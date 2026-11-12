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
 *
 * Setup:
 *   - Dual-chain testnet started in beforeAll
 *   - Ethereum lock → the validators certify a block covering it → the
 *     deployer account (no special rights) carries the proof to Aptos, with
 *     no header submission. The receipt belongs to the seller's
 *     Ethereum-derivable account, which signs create_auction (SIWE)
 *   - A real timelock registered for the window (the epoch key must exist)
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
  currentWindowId,
  waitForTimelockKey,
  chainNowUs,
  registerTimelockDirect,
  getWindowStatus,
  getReceiptStatus,
  RECEIPT_ACTIVE,
  RECEIPT_CLAIMED,
  type EthLockProofResult,
} from "./helpers/auction-setup";
import { Step7Auction } from "../../src/components/SellFlow/steps/Step7Auction";
import { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import { setAptosInstance, aptos as aptosGlobal } from "@atomica/sdk/aptos";
import { ethers } from "ethers";
import { getCreateAuctionPayload } from "@atomica/sdk/aptos";
import { submitNativeTransaction } from "@atomica/sdk";

const MIN_PRICE = 100n;
const PAIR_BCS = new TextEncoder().encode("07-create-auction");
/** The timelock deadline is far enough out that the window stays open. */
const DEADLINE_AHEAD_US = 600_000_000n;

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
  minPrice,
  onCreateAuction,
}: {
  amount: bigint;
  minPrice: bigint;
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
      minPrice={minPrice}
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
  let timelockId: bigint;

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

    // The deployer's native Aptos account carries the proof and registers the
    // timelock. It has no special rights: any account could.
    deployerAccount = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(fixture.aptos.deployerPrivateKey),
    });

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

    // create_auction needs a Pending timelock in the current epoch.
    await waitForTimelockKey(aptosGlobal);
    timelockId = await registerTimelockDirect(
      aptosGlobal,
      deployerAccount,
      (await chainNowUs(aptosGlobal)) + DEADLINE_AHEAD_US,
    );
    windowId = await currentWindowId(aptosGlobal);
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

    const onCreateAuction = async () => {
      const txHash = await createAuctionDirect(
        aptosGlobal,
        fixture.eth.seller,
        ethProof.lockId,
        MIN_PRICE,
        windowId,
        PAIR_BCS,
        timelockId,
      );
      return { txHash };
    };

    render(
      <AuctionWrapper
        amount={ethers.parseEther("10")}
        minPrice={MIN_PRICE}
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

    expect(
      await getWindowStatus(aptosGlobal, moduleAddr, windowId, PAIR_BCS),
    ).toEqual({ timelockId, revealFinal: false, refunded: false });
    expect(
      await getReceiptStatus(aptosGlobal, moduleAddr, "FakeETH", ethProof.lockId),
    ).toBe(RECEIPT_CLAIMED);
  }, 90_000);

  // ── Test 2: amount and min price displayed ─────────────────────────────────

  it("shows formatted amount and min price in description text", () => {
    render(
      <Step7Auction
        loading={true}
        amount={ethers.parseEther("10")}
        minPrice={MIN_PRICE}
        onCreateAuction={async () => {}}
      />,
    );

    const text = document.body.textContent ?? "";
    expect(text).toContain("10.0000 FETH");
    // MIN_PRICE = 100n (raw FUSD units, 6 decimals) → $0.00
    expect(text).toContain("$0.00");
  });

  // ── Test 3: the claimed receipt cannot back a second auction ─────────────

  it("shows E_RECEIPT_ALREADY_CLAIMED when the seller receipt is reused", async () => {
    const onCreateAuction = async () => {
      const txHash = await createAuctionDirect(
        aptosGlobal,
        fixture.eth.seller,
        ethProof.lockId,
        MIN_PRICE,
        windowId,
        PAIR_BCS,
        timelockId,
      );
      return { txHash };
    };

    render(
      <AuctionWrapper
        amount={ethers.parseEther("10")}
        minPrice={MIN_PRICE}
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
    const mpk = new Uint8Array(0);

    const onCreateAuction = async () => {
      // getCreateAuctionPayload(windowId, pairBcs, lockId, minPrice, timelockId, mpkBytes)
      const payload = getCreateAuctionPayload(
        0n,                // windowId
        new Uint8Array(0), // pairBcs (empty — the wallet rejects before submission)
        lockIdBytes,
        MIN_PRICE,
        0n,                // timelockId
        mpk,
      );
      const result = await submitNativeTransaction(aptosGlobal, sellerAddress, payload);
      return { txHash: (result as { hash?: string }).hash };
    };

    render(
      <AuctionWrapper
        amount={ethers.parseEther("10")}
        minPrice={MIN_PRICE}
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
});
