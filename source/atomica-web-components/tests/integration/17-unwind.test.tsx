/**
 * @file 17-unwind.test.tsx
 * @description Live permissionless unwind, outcome carrier and reclaim UI
 * (issue 195) on the dual-chain testnet. Anvil tier only: anvil runs Prague
 * here (ETH_ANVIL_HARDFORK=prague), so the Aptos light client can verify BLS
 * signatures, and the reclaim case warps the anvil clock.
 *
 * Scenarios:
 *   1. The seller locks FakeETH and the bidder locks FakeUSD collateral into
 *      one window, and the bidder bids. The window stalls past its stuck
 *      deadline (the testnet shortens the unwind grace to 60 s with
 *      `timelock_config::set_unwind_grace_us_on_test_chain`). The seller's
 *      wallet clicks Unwind, then Carry: the validator-signed AuctionOutcome
 *      goes to the LockBox through the real AptosLightClient, and each lock is
 *      released. Each depositor's ERC-20 balance returns to its pre-lock value.
 *   2. ReclaimLockButton: a FakeETH lock is disabled before its deadline. After
 *      the anvil clock passes the deadline with no proven outcome, any wallet
 *      (here the bidder, not the depositor) clicks Reclaim, and the
 *      depositor's FakeETH balance returns to its pre-lock value.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import { ethers } from "ethers";
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import { setAptosInstance, getStuckDeadlineUs } from "@atomica/sdk/aptos";
import {
  approveFakeEth,
  currentWindowId as hostWindowId,
  getLockStatus,
  LOCK_STATUS,
  lockBinding,
  lockFakeEth,
  lockFromReceipt,
  type LockFields,
} from "@atomica/sdk/ethereum";
import {
  setupIntegrationFixture,
  teardownIntegrationFixture,
  type IntegrationFixture,
} from "./fixtures/dual-chain";
import { setupWalletMock } from "./fixtures/wallet-mock";
import {
  createLiveWindow,
  ethAccountAddress,
  lockBidCollateral,
  submitBidDirect,
  waitForChainTime,
  type LiveWindow,
} from "./helpers/auction-setup";
import { commands } from "vitest/browser";
import { WalletContext } from "../../src/context/WalletContext";
import { UnwindButton } from "../../src/components/UnwindButton";
import { ReclaimLockButton } from "../../src/components/ReclaimLockButton";

const PAIR_BCS = new TextEncoder().encode("17-unwind");
/**
 * The reclaim case binds its lock to another pair: 17-1 records an outcome
 * for (window, PAIR_BCS), and a lock of an auction with a recorded outcome
 * goes home by release, not by reclaim.
 */
const RECLAIM_PAIR_BCS = new TextEncoder().encode("17-reclaim");
const DEADLINE_AHEAD_US = 120_000_000n;
/** The testnet's shortened unwind grace, microseconds. */
const UNWIND_GRACE_US = 60_000_000n;
const LOCK_AMOUNT = ethers.parseEther("1");
const COLLATERAL = 500n * 10n ** 6n;
// 0.0001 FakeETH at 2_000_000 USD per FakeETH quotes 200 FakeUSD (`quoteForFill`).
const BID_PRICE = 2_000_000n;
const BID_QUANTITY = ethers.parseEther("0.0001");
/** Reveal window, opening window and grace after the timelock deadline, plus slack. */
const STALL_TIMEOUT_SECS = 1_800;
const ERC20 = ["function balanceOf(address) view returns (uint256)"];

describe.sequential("17: permissionless unwind and reclaim", () => {
  let fixture: IntegrationFixture;
  let aptosClient: Aptos;
  let operator: Account;
  let auction: LiveWindow;
  let fakeEth: ethers.Contract;
  let fakeUsd: ethers.Contract;
  let rpc: ethers.JsonRpcProvider;

  beforeAll(async () => {
    fixture = await setupIntegrationFixture({ unwindGraceUs: UNWIND_GRACE_US });
    aptosClient = new Aptos(
      new AptosConfig({
        network: Network.LOCAL,
        fullnode: fixture.aptos.nodeUrl,
      }),
    );
    setAptosInstance(aptosClient);
    operator = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(fixture.aptos.deployerPrivateKey),
    });
    rpc = new ethers.JsonRpcProvider(fixture.eth.rpcUrl, undefined, {
      cacheTimeout: -1,
    });
    fakeEth = new ethers.Contract(fixture.eth.contracts.fakeETH, ERC20, rpc);
    fakeUsd = new ethers.Contract(fixture.eth.contracts.fakeUSD, ERC20, rpc);
  }, 1_200_000);

  afterAll(async () => {
    await teardownIntegrationFixture();
  });

  afterEach(() => {
    cleanup();
  });

  it("17-1: Unwind, then Carry, returns every lock of a stalled auction to its depositor", async () => {
    const seller = fixture.eth.seller.address;
    const bidder = fixture.eth.bidder.address;

    // The seller's FakeETH lock and the window. The helper mints first, so the
    // pre-lock balance is the balance after the lock plus the locked amount.
    auction = await createLiveWindow(fixture, aptosClient, operator, {
      pairBcs: PAIR_BCS,
      minPrice: 1n,
      deadlineAheadUs: DEADLINE_AHEAD_US,
      lockAmount: LOCK_AMOUNT,
    });
    const sellerPreLock =
      ((await fakeEth.balanceOf(seller)) as bigint) + LOCK_AMOUNT;

    // The bidder's FakeUSD collateral lock, claimed by a bid.
    const collateral = await lockBidCollateral(
      fixture,
      aptosClient,
      operator,
      PAIR_BCS,
      COLLATERAL,
    );
    const bidderPreLock =
      ((await fakeUsd.balanceOf(bidder)) as bigint) + COLLATERAL;
    await submitBidDirect(
      aptosClient,
      fixture.eth.bidder,
      auction,
      BID_PRICE,
      collateral,
      BID_QUANTITY,
    );

    const stuckDeadlineUs = await getStuckDeadlineUs(
      auction.windowId,
      auction.pairBcs,
    );
    expect(stuckDeadlineUs).toBeGreaterThanOrEqual(
      auction.deadlineUs + UNWIND_GRACE_US,
    );

    // The seller's wallet presses both buttons. Its Ethereum-derivable Aptos
    // account pays the unwind gas. It holds no special rights.
    const account = (
      await setupWalletMock({
        privateKey: fixture.eth.seller.privateKey,
        rpcUrl: fixture.eth.rpcUrl,
        chainId: fixture.eth.chainId,
      })
    ).toLowerCase();
    await commands.fundAccount(
      await ethAccountAddress(fixture.eth.seller),
      500_000_000,
    );

    render(
      <WalletContext.Provider value={{ account, connect: async () => {} }}>
        <UnwindButton
          windowId={auction.windowId}
          pairBcs={auction.pairBcs}
          pollIntervalMs={2_000}
        />
      </WalletContext.Provider>,
    );

    await waitFor(
      () =>
        expect(
          screen.getByTestId("unwind-eligibility").getAttribute("data-reason"),
        ).toBe("before-stuck-deadline"),
      { timeout: 30_000 },
    );
    expect(screen.getByTestId("unwind-button")).toBeDisabled();
    expect(screen.getByTestId("carry-outcome-button")).toBeDisabled();

    // Nobody opens or settles the window: it stalls past its stuck deadline.
    await waitForChainTime(aptosClient, stuckDeadlineUs, STALL_TIMEOUT_SECS);
    await waitFor(
      () => expect(screen.getByTestId("unwind-button")).not.toBeDisabled(),
      { timeout: 60_000 },
    );
    fireEvent.click(screen.getByTestId("unwind-button"));
    await waitFor(
      () =>
        expect(screen.getByTestId("unwind-status").textContent).toContain(
          "Unwound on Aptos",
        ),
      { timeout: 120_000 },
    );

    // The window is final now: carry its outcome and release both locks.
    await waitFor(
      () =>
        expect(screen.getByTestId("carry-outcome-button")).not.toBeDisabled(),
      { timeout: 60_000 },
    );
    fireEvent.click(screen.getByTestId("carry-outcome-button"));
    await waitFor(
      () =>
        expect(screen.getByTestId("unwind-status").textContent).toContain(
          "Released 2 lock(s)",
        ),
      { timeout: 300_000 },
    );

    expect(await fakeEth.balanceOf(seller)).toBe(sellerPreLock);
    expect(await fakeUsd.balanceOf(bidder)).toBe(bidderPreLock);
  }, 2_700_000);

  it("17-2: anyone reclaims a lock after its deadline and the depositor's balance is restored", async () => {
    // The seller locks 1 FakeETH into the current window, with no Aptos
    // registration and no outcome.
    await setupWalletMock({
      privateKey: fixture.eth.seller.privateKey,
      rpcUrl: fixture.eth.rpcUrl,
      chainId: fixture.eth.chainId,
    });
    const sellerProvider = new ethers.BrowserProvider(
      (window as unknown as { ethereum: ethers.Eip1193Provider }).ethereum,
    );
    const before = (await fakeEth.balanceOf(
      fixture.eth.seller.address,
    )) as bigint;
    await approveFakeEth(sellerProvider, LOCK_AMOUNT);
    const head = await rpc.getBlock("latest");
    const binding = lockBinding(
      hostWindowId(BigInt(head!.timestamp)),
      RECLAIM_PAIR_BCS,
    );
    const lock: LockFields = lockFromReceipt(
      await lockFakeEth(sellerProvider, LOCK_AMOUNT, binding),
    );
    expect(await fakeEth.balanceOf(fixture.eth.seller.address)).toBe(
      before - LOCK_AMOUNT,
    );

    // Any wallet may press Reclaim: switch to the bidder, who has no rights
    // over the lock. The tokens still go to the depositor.
    const caller = await setupWalletMock({
      privateKey: fixture.eth.bidder.privateKey,
      rpcUrl: fixture.eth.rpcUrl,
      chainId: fixture.eth.chainId,
    });

    render(
      <WalletContext.Provider
        value={{ account: caller, connect: async () => {} }}
      >
        <ReclaimLockButton lock={lock} pollIntervalMs={1_000} />
      </WalletContext.Provider>,
    );

    await waitFor(
      () =>
        expect(
          screen
            .getByTestId("reclaim-lock-eligibility")
            .getAttribute("data-reason"),
        ).toBe("before-deadline"),
      { timeout: 30_000 },
    );
    expect(screen.getByTestId("reclaim-lock-button")).toBeDisabled();

    // Move the anvil clock past the lock deadline.
    const now = BigInt((await rpc.getBlock("latest"))!.timestamp);
    await rpc.send("evm_increaseTime", [Number(lock.deadline - now + 1n)]);
    await rpc.send("evm_mine", []);

    await waitFor(
      () =>
        expect(
          screen
            .getByTestId("reclaim-lock-eligibility")
            .getAttribute("data-reason"),
        ).toBe("eligible"),
      { timeout: 30_000 },
    );
    fireEvent.click(screen.getByTestId("reclaim-lock-button"));

    await waitFor(
      () =>
        expect(screen.getByTestId("reclaim-lock-status").textContent).toContain(
          "Reclaimed to",
        ),
      { timeout: 60_000 },
    );
    expect(await getLockStatus(rpc, lock.lockId)).toBe(LOCK_STATUS.Reclaimed);
    expect(await fakeEth.balanceOf(fixture.eth.seller.address)).toBe(before);
  }, 300_000);
});
