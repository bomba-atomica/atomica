/**
 * 09-submit-bid.test.tsx
 *
 * Live `submit_bid` tests on one window of the dual-chain testnet.
 *
 * Scenarios:
 *   1. A sealed bid is stored: get_bid_count, get_bid_info and the collateral
 *      receipt status change, the window status does not
 *   2. A second bid on an already claimed collateral receipt aborts
 *   3. AuctionBidder on a window that does not exist shows E_AUCTION_NOT_FOUND
 *   4. A bidder approves, locks and registers FakeUSD through AuctionBidder,
 *      then bids against the registered lock id
 *   5. A bid after the timelock deadline aborts and leaves its receipt active
 *
 * Setup:
 *   - Dual-chain testnet started in beforeAll
 *   - One window created with a real timelock (createLiveWindow)
 *   - The bidder locks FakeUSD collateral. Its receipt belongs to the bidder's
 *     Ethereum-derivable account, which alone can claim it
 *     (`lock_receipt::claim`). Bids are sealed with sealBid (the AuctionBidder
 *     code path) and SIWE-signed as that account
 *   - Bidder wallet mock injected for the AuctionBidder UI test
 */

import React from "react";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  fireEvent,
  cleanup,
} from "@testing-library/react";
import { commands } from "vitest/browser";
import {
  setupIntegrationFixture,
  teardownIntegrationFixture,
  type IntegrationFixture,
} from "./fixtures/dual-chain";
import { setupWalletMock } from "./fixtures/wallet-mock";
import { auctionBidder } from "./helpers/selectors";
import {
  createLiveWindow,
  lockBidCollateral,
  submitBidDirect,
  getWindowStatus,
  getAuctionState,
  getReceiptStatus,
  waitForChainTime,
  RECEIPT_ACTIVE,
  RECEIPT_CLAIMED,
  type LiveWindow,
} from "./helpers/auction-setup";
import { AuctionBidder } from "../../src/components/AuctionBidder";
import {
  WalletContext,
  AppStateProvider,
  NetworkConfigProvider,
  ContractStatusProvider,
  BalancesProvider,
} from "../../src/index";
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import {
  setAptosInstance,
  getBidCount,
  getBidInfo,
  isSettled,
} from "@atomica/sdk/aptos";
import {
  setAptosInstance as setDockerAptosInstance,
  getDerivedAddress,
} from "@atomica/aptos-docker-testnet/browser";
import { ethers } from "ethers";

// SCOUT(#217) EDIT: bid 2000 whole USD, not 2_000_000.
// SCOUT(#216) EDIT: 1 FakeETH at this price needs 2,000,000 FakeUSD of collateral and the helper locks 500; the bid would be invalid once opened (this file never opens it, and pull request 213 does not shrink this quantity).
const BID_PRICE = 2_000_000n;
const BID_QUANTITY = ethers.parseEther("1");
// SCOUT(#224) EDIT: use the launch pair.
const PAIR_BCS = new TextEncoder().encode("09-submit-bid");
// SCOUT(#243) EDIT: a 360 second deadline needs the test cap.
/**
 * Bids close 360 s after the window is created: tests 1-4 run before that.
 * Test 4 waits for a certified Ethereum block before it registers its lock.
 */
const DEADLINE_AHEAD_US = 360_000_000n;
const MISSING_WINDOW_ID = 999_999n;

// ---------------------------------------------------------------------------
// Minimal provider wrapper for AuctionBidder
// ---------------------------------------------------------------------------

function BidderProviders({
  account,
  children,
}: {
  account: string;
  children: React.ReactNode;
}) {
  return (
    <AppStateProvider>
      <NetworkConfigProvider>
        <WalletContext.Provider value={{ account, connect: async () => {} }}>
          <ContractStatusProvider>
            <BalancesProvider>{children}</BalancesProvider>
          </ContractStatusProvider>
        </WalletContext.Provider>
      </NetworkConfigProvider>
    </AppStateProvider>
  );
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.sequential("09: Submit Bid on Auction", () => {
  let fixture: IntegrationFixture;
  let aptosClient: Aptos;
  let moduleAddr: string;
  let operator: Account;
  let bidderAddress: string;
  let bidderAptosAddress: string;
  let auction: LiveWindow;
  let firstCollateral: string;

  beforeAll(async () => {
    fixture = await setupIntegrationFixture();
    moduleAddr = fixture.aptos.moduleAddress;

    aptosClient = new Aptos(
      new AptosConfig({ network: Network.LOCAL, fullnode: fixture.aptos.nodeUrl }),
    );
    setAptosInstance(aptosClient);
    setDockerAptosInstance(aptosClient);

    operator = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(fixture.aptos.deployerPrivateKey),
    });

    bidderAddress = await setupWalletMock({
      privateKey: fixture.eth.bidder.privateKey,
      rpcUrl: fixture.eth.rpcUrl,
      chainId: fixture.eth.chainId,
    });
    bidderAptosAddress = (await getDerivedAddress(bidderAddress.toLowerCase())).toString();
    await commands.fundAccount(bidderAptosAddress, 500_000_000);

    // Collateral first: the timelock deadline starts counting at createLiveWindow.
    firstCollateral = await lockBidCollateral(fixture, aptosClient, operator, PAIR_BCS);
    auction = await createLiveWindow(fixture, aptosClient, operator, {
      pairBcs: PAIR_BCS,
      deadlineAheadUs: DEADLINE_AHEAD_US,
    });
  }, 1_200_000);

  afterAll(async () => {
    await teardownIntegrationFixture();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Test 1: a sealed bid is stored ─────────────────────────────────────────

  it("stores a sealed bid and claims its FakeUSD collateral receipt", async () => {
    expect(await getBidCount(auction.windowId, PAIR_BCS)).toBe(0n);
    expect(
      await getReceiptStatus(aptosClient, moduleAddr, "FakeUSD", firstCollateral),
    ).toBe(RECEIPT_ACTIVE);

    const bid = await submitBidDirect(
      aptosClient,
      fixture.eth.bidder,
      auction,
      BID_PRICE,
      firstCollateral,
      BID_QUANTITY,
    );

    expect(await getBidCount(auction.windowId, PAIR_BCS)).toBe(1n);
    // SCOUT(#216) EDIT: the bid view gains a validity flag; assert it.
    // SCOUT(#228) EDIT: the commitment field asserted below leaves the bid view.
    const stored = await getBidInfo(auction.windowId, PAIR_BCS, 0n);
    expect(stored.bidder.replace(/^0x0*/, "")).toBe(
      bidderAptosAddress.replace(/^0x0*/, ""),
    );
    expect(stored.ciphertext).toEqual(bid.ciphertext);
    expect(stored.commitment).toEqual(bid.commitment);
    expect(stored.opened).toBe(false);
    expect(stored.price).toBe(0n);

    expect(
      await getReceiptStatus(aptosClient, moduleAddr, "FakeUSD", firstCollateral),
    ).toBe(RECEIPT_CLAIMED);
    expect(await getWindowStatus(aptosClient, moduleAddr, auction.windowId, PAIR_BCS)).toEqual({
      timelockId: auction.timelockId,
      revealFinal: false,
      refunded: false,
    });
    expect(await isSettled(auction.windowId, PAIR_BCS)).toBe(false);
  }, 120_000);

  // ── Test 2: a claimed collateral receipt cannot back a second bid ─────────

  it("rejects a second bid on the same collateral receipt with E_RECEIPT_ALREADY_CLAIMED", async () => {
    await expect(
      submitBidDirect(
        aptosClient,
        fixture.eth.bidder,
        auction,
        BID_PRICE + 1n,
        firstCollateral,
        BID_QUANTITY,
      ),
    ).rejects.toThrow(/E_RECEIPT_ALREADY_CLAIMED/);

    expect(await getBidCount(auction.windowId, PAIR_BCS)).toBe(1n);
    expect(
      await getReceiptStatus(aptosClient, moduleAddr, "FakeUSD", firstCollateral),
    ).toBe(RECEIPT_CLAIMED);
  }, 120_000);

  // ── Test 3: AuctionBidder on a missing window ──────────────────────────────

  it("AuctionBidder shows E_AUCTION_NOT_FOUND for a window that does not exist", async () => {
    render(
      <BidderProviders account={bidderAddress}>
        <AuctionBidder />
      </BidderProviders>,
    );

    fireEvent.click(screen.getByTestId(auctionBidder.skipToBidButton));
    fireEvent.change(screen.getByTestId(auctionBidder.windowIdInput), {
      target: { value: MISSING_WINDOW_ID.toString() },
    });
    // The bid step needs a lock id; sealBid aborts on the missing window first.
    fireEvent.change(screen.getByTestId(auctionBidder.collateralLockIdInput), {
      target: { value: firstCollateral },
    });
    // SCOUT(#217) EDIT: this types the price into the bidder screen.
    fireEvent.change(screen.getByTestId(auctionBidder.bidAmountInput), {
      target: { value: BID_PRICE.toString() },
    });
    fireEvent.click(screen.getByTestId(auctionBidder.submitBidButton));

    // sealBid reads get_window_status first, which aborts for a missing window.
    await waitFor(
      () => {
        const statusEl = screen.getByTestId(auctionBidder.bidStatus);
        expect(statusEl.textContent).toMatch(/^Error: /);
        expect(statusEl.textContent).toMatch(/E_AUCTION_NOT_FOUND/);
      },
      { timeout: 60_000 },
    );

    expect(await getBidCount(MISSING_WINDOW_ID, new Uint8Array(0))).toBe(0n);
    expect(await getBidCount(auction.windowId, PAIR_BCS)).toBe(1n);
  }, 90_000);

  // ── Test 4: AuctionBidder locks, registers and bids ───────────────────────

  it("a bidder approves, locks and registers FakeUSD through AuctionBidder, bids, get_bid_count rises by one and the receipt of that lock id reads claimed", async () => {
    const countBefore = await getBidCount(auction.windowId, PAIR_BCS);

    render(
      <BidderProviders account={bidderAddress}>
        <AuctionBidder />
      </BidderProviders>,
    );

    // Step 1: the lock is bound to the pair the bid names.
    fireEvent.change(screen.getByTestId(auctionBidder.pairBcsInput), {
      target: { value: ethers.hexlify(PAIR_BCS) },
    });
    fireEvent.click(screen.getByTestId(auctionBidder.approveLockUsdButton));

    // Approve, lock, certified block wait, proof and FakeUSD registration.
    await waitFor(
      () => {
        const lockStatus = screen.queryByTestId(auctionBidder.lockStatus);
        if (lockStatus?.textContent?.startsWith("Error")) {
          throw new Error(lockStatus.textContent);
        }
        expect(screen.getByTestId(auctionBidder.submitBidStep)).toBeTruthy();
      },
      { timeout: 180_000, interval: 1_000 },
    );

    const lockId = (
      screen.getByTestId(auctionBidder.collateralLockIdInput) as HTMLInputElement
    ).value;
    expect(lockId).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(
      (screen.getByTestId(auctionBidder.windowIdInput) as HTMLInputElement).value,
    ).toBe(auction.windowId.toString());
    expect(
      await getReceiptStatus(aptosClient, moduleAddr, "FakeUSD", lockId),
    ).toBe(RECEIPT_ACTIVE);

    // Step 2: bid against the registered lock.
    // SCOUT(#217) EDIT: this types the price into the bidder screen.
    fireEvent.change(screen.getByTestId(auctionBidder.bidAmountInput), {
      target: { value: BID_PRICE.toString() },
    });
    fireEvent.change(screen.getByTestId(auctionBidder.bidQuantityInput), {
      target: { value: BID_QUANTITY.toString() },
    });
    fireEvent.click(screen.getByTestId(auctionBidder.submitBidButton));

    await waitFor(
      () => {
        const statusEl = screen.getByTestId(auctionBidder.bidStatus);
        if (statusEl.textContent?.startsWith("Error")) {
          throw new Error(statusEl.textContent);
        }
        expect(statusEl.textContent).toMatch(/Bid Submitted/);
      },
      { timeout: 60_000, interval: 1_000 },
    );

    expect(await getBidCount(auction.windowId, PAIR_BCS)).toBe(countBefore + 1n);
    expect(
      await getReceiptStatus(aptosClient, moduleAddr, "FakeUSD", lockId),
    ).toBe(RECEIPT_CLAIMED);
  }, 300_000);

  // ── Test 5: bids close at the timelock deadline ───────────────────────────

  // SCOUT(#243) EDIT: this waits for auction.deadlineUs, which becomes the window close or the test cap.
  it("rejects a bid after the timelock deadline and leaves its receipt active", async () => {
    const lateCollateral = await lockBidCollateral(fixture, aptosClient, operator, PAIR_BCS);
    await waitForChainTime(aptosClient, auction.deadlineUs);

    // Right after the deadline the timelock is still Pending (E_BID_AFTER_DEADLINE).
    // Once the validators reveal it, the status check fires first (E_TIMELOCK_NOT_PENDING).
    await expect(
      submitBidDirect(
        aptosClient,
        fixture.eth.bidder,
        auction,
        BID_PRICE,
        lateCollateral,
        BID_QUANTITY,
      ),
    ).rejects.toThrow(/E_BID_AFTER_DEADLINE|E_TIMELOCK_NOT_PENDING/);

    // The abort rolled back the collateral claim.
    expect(
      await getReceiptStatus(aptosClient, moduleAddr, "FakeUSD", lateCollateral),
    ).toBe(RECEIPT_ACTIVE);
    const state = await getAuctionState(aptosClient, moduleAddr, auction);
    // The direct bid of test 1 and the screen bid of test 4.
    expect(state.bidCount).toBe(2n);
    expect(state.settled).toBe(false);
  }, 900_000);

  it.todo("SCOUT(#216) submit_bid with quantity zero aborts with the new zero-quantity code");
  it.todo("SCOUT(#216) submit_bid with quantity above the window supply aborts with the new over-supply code");
});
