/**
 * 07-create-auction.test.tsx
 *
 * Browser integration tests for Step7Auction — the UI component that
 * auto-creates an auction from a LockReceipt on mount.
 *
 * Scenarios:
 *   1. Happy path: create_auction succeeds, the tx hash is shown, and
 *      get_window_status and the claimed seller receipt read back on chain
 *   2. Amount and min price displayed in description text
 *   3. Receipt already claimed: E_RECEIPT_ALREADY_CLAIMED shown via error prop
 *   4. SIWE signature rejected: error shown via error prop
 *   5. A second seller with the SDK launch pair joins the same window
 *   6. Pair bytes that are not on the allowlist abort with E_PAIR_NOT_ALLOWED
 *   7. The window timelock that create_auction registered closes at the
 *      window close (window_deadline_us), and the package registrar sent it
 *   8. The SDK registrar address equals the package view and the framework's
 *      stored registrar
 *   9. A direct register_timelock from the operator aborts with E_NOT_REGISTRAR
 *
 * Setup:
 *   - Dual-chain testnet started in beforeAll
 *   - Ethereum lock → the validators certify a block covering it → the
 *     deployer account (no special rights) carries the proof to Aptos, with
 *     no header submission. The receipt belongs to the seller's
 *     Ethereum-derivable account, which signs create_auction (SIWE)
 *   - The epoch key must exist; the first create_auction of the window id
 *     registers its timelock (test 1)
 *   - Seller wallet mock injected for SIWE signing in UI callbacks
 */

import React, { useState } from "react";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import {
  setupIntegrationFixture,
  teardownIntegrationFixture,
  type IntegrationFixture,
} from "./fixtures/dual-chain";
import { setupWalletMock } from "./fixtures/wallet-mock";
import { step7Auction } from "./helpers/selectors";
import {
  generateEthLockProof,
  registerLockOnAptos,
  createAuctionDirect,
  waitForTimelockKey,
  waitForWindowTimeLeft,
  chainNowUs,
  registerTimelockDirect,
  getChainWindowSchedule,
  getWindowDeadlineUs,
  getWindowTimelock,
  getWindowStatus,
  getReceiptStatus,
  getAuctionState,
  RECEIPT_ACTIVE,
  RECEIPT_CLAIMED,
  type EthLockProofResult,
} from "./helpers/auction-setup";
import { Step7Auction } from "../../src/components/SellFlow/steps/Step7Auction";
import { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import { setAptosInstance, aptos as aptosGlobal } from "@atomica/sdk/aptos";
import { ethers } from "ethers";
import {
  getCreateAuctionPayload,
  getLaunchPairBcs,
  isPairAllowed,
  timelockRegistrarAddress,
  TIMELOCK_REGISTRATION_EVENT,
} from "@atomica/sdk/aptos";
import { windowCloseSecs } from "@atomica/sdk/ethereum";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";
import { submitNativeTransaction } from "@atomica/sdk";

// SCOUT(#217) EDIT: a price constant (100 raw units, shown as $0.00 below).
// The launch pair: the only pair on the allowlist.
const PAIR_BCS = LAUNCH_PAIR_BCS;
/** Pair bytes that are not on the allowlist: only the abort case uses them. */
const UNLISTED_PAIR_BCS = new TextEncoder().encode("07-create-auction");
/**
 * The first lock is made with at least this long left in its window, so the
 * second seller of test 5 still locks into the same, open window (seconds).
 */
const MIN_WINDOW_LEFT_SECS = 600n;

/** Read an Aptos address view result as a normalized 0x + 64 hex string. */
function longAddress(value: unknown): string {
  return "0x" + String(value).replace(/^0x/, "").padStart(64, "0").toLowerCase();
}

// ---------------------------------------------------------------------------
// Stateful wrapper so we can observe the result of onCreateAuction
// ---------------------------------------------------------------------------

interface WrapperState {
  loading: boolean;
  error?: string;
  txHash?: string;
}

function AuctionWrapper({
  amount,
  onCreateAuction,
}: {
  amount: bigint;
  onCreateAuction: () => Promise<{ txHash?: string }>;
}) {
  const [state, setState] = useState<WrapperState>({ loading: false });

  const handleCreate = async () => {
    setState({ loading: true });
    try {
      const result = await onCreateAuction();
      setState({ loading: false, txHash: result.txHash });
    } catch (e: unknown) {
      setState({
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <Step7Auction
      loading={state.loading}
      error={state.error}
      txHash={state.txHash}
      amount={amount}
      onCreateAuction={handleCreate}
    />
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.sequential("07: Create Auction from LockReceipt", () => {
  let fixture: IntegrationFixture;
  let ethProof: EthLockProofResult;
  let sellerAddress: string;
  let deployerAccount: Account;
  let windowId: bigint;
  /** `ibe_config::get_next_timelock_id` right before test 1's create_auction. */
  let nextTimelockIdBefore: bigint;
  /** The timelock test 1's create_auction registered for the window id. */
  let timelockId: bigint;
  /** Hash of test 1's create_auction, which registered the timelock. */
  let createTxHash: string;

  beforeAll(async () => {
    fixture = await setupIntegrationFixture();

    // Point the global Aptos singleton at the testnet node
    const aptosConfig = new AptosConfig({
      network: Network.LOCAL,
      fullnode: fixture.aptos.nodeUrl,
    });
    setAptosInstance(new Aptos(aptosConfig));

    // Inject seller wallet mock so SIWE signing works without MetaMask
    // (used by Tests 3 and 4 which exercise UI error paths via SIWE)
    sellerAddress = await setupWalletMock({
      privateKey: fixture.eth.seller.privateKey,
      rpcUrl: fixture.eth.rpcUrl,
      chainId: fixture.eth.chainId,
    });

    // The deployer's native Aptos account carries the proof. It has no special
    // rights: any account could, and it cannot register a timelock.
    deployerAccount = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(fixture.aptos.deployerPrivateKey),
    });

    // create_auction needs the epoch key to register the window timelock.
    await waitForTimelockKey(aptosGlobal);
    await waitForWindowTimeLeft(
      aptosGlobal,
      fixture.aptos.moduleAddress,
      MIN_WINDOW_LEFT_SECS,
    );

    // Lock ETH on Ethereum and prove it at a validator-certified block.
    ethProof = await generateEthLockProof(
      fixture,
      undefined,
      undefined,
      undefined,
      undefined,
      PAIR_BCS,
    );

    // Register the lock on Aptos: no submit_header, any carrier.
    await registerLockOnAptos(
      aptosGlobal,
      deployerAccount,
      fixture.aptos.moduleAddress,
      ethProof.proof,
    );

    // The window is the one the lock is bound to.
    windowId = BigInt(ethProof.proof.windowId);
  }, 1_200_000);

  afterAll(async () => {
    await teardownIntegrationFixture();
  });

  afterEach(() => {
    cleanup();
    // Restore wallet mock after each test (some tests swap it out)
    setupWalletMock({
      privateKey: fixture?.eth.seller.privateKey ?? "0x" + "0".repeat(64),
      rpcUrl: fixture?.eth.rpcUrl,
      chainId: fixture?.eth.chainId,
    });
  });

  // ── Test 1: create_auction succeeds ───────────────────────────────────────

  it("shows the tx hash after create_auction succeeds and the window exists on chain", async () => {
    const moduleAddr = fixture.aptos.moduleAddress;
    expect(
      await getReceiptStatus(aptosGlobal, moduleAddr, "FakeETH", ethProof.lockId),
    ).toBe(RECEIPT_ACTIVE);

    const [next] = await aptosGlobal.view({
      payload: {
        function: "0x1::ibe_config::get_next_timelock_id",
        functionArguments: [],
      },
    });
    nextTimelockIdBefore = BigInt(next as string);

    const onCreateAuction = async () => {
      const txHash = await createAuctionDirect(
        aptosGlobal,
        fixture.eth.seller,
        ethProof.lockId,
        windowId,
        PAIR_BCS,
      );
      createTxHash = txHash;
      return { txHash };
    };

    render(
      <AuctionWrapper
        amount={ethers.parseEther("10")}
        onCreateAuction={onCreateAuction}
      />,
    );

    // spinner shown on mount while auto-creating
    expect(screen.getByTestId(step7Auction.auctionSpinner)).toBeTruthy();

    await waitFor(
      () => {
        expect(screen.getByTestId(step7Auction.auctionTxHash).textContent).toMatch(
          /^Tx: 0x[0-9a-f]{64}$/,
        );
      },
      { timeout: 60_000 },
    );
    expect(document.querySelector(".text-red-400")).toBeNull();

    // create_auction registered the window id's timelock: the id
    // ibe_config::get_next_timelock_id reported before the call.
    timelockId = await getWindowTimelock(aptosGlobal, moduleAddr, windowId);
    expect(timelockId).toBe(nextTimelockIdBefore);
    expect(
      await getWindowStatus(aptosGlobal, moduleAddr, windowId, PAIR_BCS),
    ).toEqual({ timelockId, revealFinal: false, refunded: false });
    expect(
      await getReceiptStatus(aptosGlobal, moduleAddr, "FakeETH", ethProof.lockId),
    ).toBe(RECEIPT_CLAIMED);
  }, 90_000);

  // ── Test 2: amount displayed, no reserve price ─────────────────────────────

  // SCOUT(#217) EDIT: it asserts $0.00 for a price of 100 raw units.
  it("shows formatted amount and no min price in description text", () => {
    render(
      <Step7Auction
        loading={true}
        amount={ethers.parseEther("10")}
        onCreateAuction={async () => {}}
      />,
    );

    const text = document.body.textContent ?? "";
    expect(text).toContain("10.0000 FETH");
    expect(text).not.toMatch(/min price/i);
    expect(text).not.toContain("$");
  });

  // ── Test 3: the claimed receipt cannot back a second auction ─────────────

  it("shows E_RECEIPT_ALREADY_CLAIMED when the seller receipt is reused", async () => {
    const onCreateAuction = async () => {
      const txHash = await createAuctionDirect(
        aptosGlobal,
        fixture.eth.seller,
        ethProof.lockId,
        windowId,
        PAIR_BCS,
      );
      return { txHash };
    };

    render(
      <AuctionWrapper
        amount={ethers.parseEther("10")}
        onCreateAuction={onCreateAuction}
      />,
    );

    await waitFor(
      () => {
        const errorEl = document.querySelector(".text-red-400");
        expect(errorEl?.textContent).toMatch(/E_RECEIPT_ALREADY_CLAIMED/);
      },
      { timeout: 60_000 },
    );
    expect(screen.queryByTestId(step7Auction.auctionTxHash)).toBeNull();
  }, 90_000);

  // ── Test 4: SIWE signature rejected ───────────────────────────────────────

  it("shows error when SIWE personal_sign is rejected by the wallet", async () => {
    // Swap in a wallet mock that rejects personal_sign
    const rejectedMock = {
      isMetaMask: true,
      selectedAddress: sellerAddress,
      chainId: `0x${fixture.eth.chainId.toString(16)}`,
      on: () => {},
      removeListener: () => {},
      async request({ method }: { method: string; params?: unknown[] }) {
        if (method === "eth_accounts" || method === "eth_requestAccounts") {
          return [sellerAddress];
        }
        if (method === "eth_chainId") {
          return `0x${fixture.eth.chainId.toString(16)}`;
        }
        if (method === "personal_sign") {
          throw Object.assign(new Error("MetaMask: User denied message signature."), {
            code: 4001,
          });
        }
        const provider = new ethers.JsonRpcProvider(fixture.eth.rpcUrl, undefined, { cacheTimeout: -1 });
        return provider.send(method, []);
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ethereum = rejectedMock;

    const lockIdBytes = ethers.getBytes(ethProof.lockId);

    const onCreateAuction = async () => {
      // getCreateAuctionPayload(windowId, pairBcs, lockId)
      const payload = getCreateAuctionPayload(
        0n,                // windowId
        new Uint8Array(0), // pairBcs (empty — the wallet rejects before submission)
        lockIdBytes,
      );
      const result = await submitNativeTransaction(aptosGlobal, sellerAddress, payload);
      return { txHash: (result as { hash?: string }).hash };
    };

    render(
      <AuctionWrapper
        amount={ethers.parseEther("10")}
        onCreateAuction={onCreateAuction}
      />,
    );

    // An error should be surfaced via the red error element
    await waitFor(
      () => {
        const errorEl = document.querySelector(".text-red-400");
        expect(errorEl).toBeTruthy();
      },
      { timeout: 30_000 },
    );
  }, 60_000);

  // ── Test 5: the launch pair, a second seller joins the window ─────────────

  it("create_auction through the UI with the SDK launch pair constant creates the window", async () => {
    const moduleAddr = fixture.aptos.moduleAddress;
    // The chain lists the SDK constant, and computes the same bytes.
    expect(await isPairAllowed(LAUNCH_PAIR_BCS)).toBe(true);
    expect(ethers.hexlify(await getLaunchPairBcs())).toBe(
      ethers.hexlify(LAUNCH_PAIR_BCS),
    );

    // A second seller lock, bound to the launch pair (the helper default).
    const second = await generateEthLockProof(fixture);
    expect(BigInt(second.proof.windowId)).toBe(windowId);
    await registerLockOnAptos(aptosGlobal, deployerAccount, moduleAddr, second.proof);
    const before = await getAuctionState(aptosGlobal, moduleAddr, {
      windowId,
      pairBcs: LAUNCH_PAIR_BCS,
    });

    const onCreateAuction = async () => {
      const txHash = await createAuctionDirect(
        aptosGlobal,
        fixture.eth.seller,
        second.lockId,
        windowId,
        LAUNCH_PAIR_BCS,
      );
      return { txHash };
    };
    render(
      <AuctionWrapper
        amount={ethers.parseEther("10")}
        onCreateAuction={onCreateAuction}
      />,
    );
    await waitFor(
      () => {
        expect(screen.getByTestId(step7Auction.auctionTxHash).textContent).toMatch(
          /^Tx: 0x[0-9a-f]{64}$/,
        );
      },
      { timeout: 60_000 },
    );

    // One pair, one window: the second lock joins the window of test 1, and
    // its timelock: no second one was registered.
    const after = await getAuctionState(aptosGlobal, moduleAddr, {
      windowId,
      pairBcs: LAUNCH_PAIR_BCS,
    });
    expect(after.totalSupply).toBe(before.totalSupply + ethers.parseEther("10"));
    expect(
      await getReceiptStatus(aptosGlobal, moduleAddr, "FakeETH", second.lockId),
    ).toBe(RECEIPT_CLAIMED);
    expect(await getWindowTimelock(aptosGlobal, moduleAddr, windowId)).toBe(
      timelockId,
    );
  }, 600_000);

  // ── Test 6: unlisted pair bytes ──────────────────────────────────────────

  it("create_auction with bytes that are not on the allowlist fails with the new abort code", async () => {
    expect(await isPairAllowed(UNLISTED_PAIR_BCS)).toBe(false);

    // The pair check runs before the lock claim, so any lock id shows it.
    const onCreateAuction = async () => {
      const txHash = await createAuctionDirect(
        aptosGlobal,
        fixture.eth.seller,
        ethProof.lockId,
        windowId,
        UNLISTED_PAIR_BCS,
      );
      return { txHash };
    };
    render(
      <AuctionWrapper
        amount={ethers.parseEther("10")}
        onCreateAuction={onCreateAuction}
      />,
    );
    await waitFor(
      () => {
        const errorEl = document.querySelector(".text-red-400");
        expect(errorEl?.textContent).toMatch(/E_PAIR_NOT_ALLOWED/);
      },
      { timeout: 60_000 },
    );
    expect(screen.queryByTestId(step7Auction.auctionTxHash)).toBeNull();
  }, 90_000);

  // ── Test 7: the registered timelock closes at the window close ───────────

  it("the window timelock deadline equals the window_deadline_us view and the TimelockRegistrationEvent sender is the registrar address", async () => {
    const moduleAddr = fixture.aptos.moduleAddress;
    const deadlineUs = await getWindowDeadlineUs(aptosGlobal, moduleAddr, windowId);
    const [timelockDeadline] = await aptosGlobal.view({
      payload: {
        function: `${moduleAddr}::timelock::get_deadline`,
        functionArguments: [timelockId],
      },
    });
    expect(BigInt(timelockDeadline as string)).toBe(deadlineUs);
    // The deadline is the window close on the chain's window schedule.
    const schedule = await getChainWindowSchedule(aptosGlobal, moduleAddr);
    expect(deadlineUs).toBe(windowCloseSecs(windowId, schedule) * 1_000_000n);

    // Test 1's create_auction emitted the registration, sent by the package's
    // registrar object.
    const tx = await aptosGlobal.getTransactionByHash({
      transactionHash: createTxHash,
    });
    const events = "events" in tx ? tx.events : [];
    const registration = events.find(
      (e) => e.type === TIMELOCK_REGISTRATION_EVENT,
    );
    expect(registration).toBeDefined();
    const data = registration!.data as {
      timelock_id: string;
      deadline_us: string;
      sender: string;
    };
    expect(BigInt(data.timelock_id)).toBe(timelockId);
    expect(BigInt(data.deadline_us)).toBe(deadlineUs);
    expect(longAddress(data.sender)).toBe(
      longAddress(timelockRegistrarAddress(moduleAddr)),
    );
  }, 60_000);

  // ── Test 8: one registrar address on every side ──────────────────────────

  it("the SDK registrar address equals auction::timelock_registrar_address and 0x1::ibe_config::timelock_registrar", async () => {
    const moduleAddr = fixture.aptos.moduleAddress;
    const sdk = longAddress(timelockRegistrarAddress(moduleAddr));
    const [packageView] = await aptosGlobal.view({
      payload: {
        function: `${moduleAddr}::auction::timelock_registrar_address`,
        functionArguments: [],
      },
    });
    const [stored] = await aptosGlobal.view({
      payload: {
        function: "0x1::ibe_config::timelock_registrar",
        functionArguments: [],
      },
    });
    expect(longAddress(packageView)).toBe(sdk);
    // An Option<address> reads as { vec: [address] }.
    const vec = (stored as { vec: string[] }).vec;
    expect(vec).toHaveLength(1);
    expect(longAddress(vec[0])).toBe(sdk);
  }, 60_000);

  // ── Test 9: no other account registers a timelock ────────────────────────

  it("register_timelock from the operator account fails with E_NOT_REGISTRAR", async () => {
    const before = await aptosGlobal.view({
      payload: {
        function: "0x1::ibe_config::get_next_timelock_id",
        functionArguments: [],
      },
    });
    await expect(
      registerTimelockDirect(
        aptosGlobal,
        deployerAccount,
        (await chainNowUs(aptosGlobal)) + 120_000_000n,
      ),
    ).rejects.toThrow(/E_NOT_REGISTRAR/);
    // No timelock was registered.
    const after = await aptosGlobal.view({
      payload: {
        function: "0x1::ibe_config::get_next_timelock_id",
        functionArguments: [],
      },
    });
    expect(after).toEqual(before);
  }, 60_000);
});
