/**
 * 10-settle.test.tsx
 *
 * Live settlement tests for SettleButton on one window of the dual-chain
 * testnet. Two sealed bids compete for the seller's 10 FakeETH:
 *
 // SCOUT(#217) EDIT: header prices read 2.00 and 1.50; they become 2000 and 1500 whole USD.
 *   winner — price 2.00, quantity 10 FakeETH (fills the whole supply)
 *   loser  — price 1.50, quantity  1 FakeETH
 *
 * Scenarios:
 *   1. SettleButton is disabled before the window ends
 *   2. settle before the timelock deadline aborts with E_DEADLINE_NOT_PASSED
 *   3. After the reveal: opening the bids also clears the window, and the real
 *      SettleButton settles it with no separate clearing call. is_settled, the clearing price, the bid
 *      results and every receipt status are asserted on chain
 *   4. A second settle aborts with E_WINDOW_ALREADY_SETTLED; SettleButton
 *      shows "Already Settled"
 *   5. Step8Monitor shows the settled window and records it in the history
 *   6. get_settlement returns the sum of the winners' fills, which SettleButton
 *      shows as the total filled
 *
 * The bidder's Ethereum-derivable account bids: only it can claim the
 * bidder's collateral receipts. The operator (no special rights) relays
 * openings. SettleButton signs through SIWE with the seller wallet mock.
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
import { settleButton, step8Monitor, bidHistory } from "./helpers/selectors";
import {
  createLiveWindow,
  lockBidCollateral,
  submitBidDirect,
  waitForReveal,
  openWindowBidsDirect,
  settleAuctionDirect,
  getWindowStatus,
  getAuctionState,
  getReceiptStatus,
  RECEIPT_FILLED,
  RECEIPT_REVOKED,
  type LiveWindow,
} from "./helpers/auction-setup";
import { SettleButton } from "../../src/components/SettleButton";
import { Step8Monitor } from "../../src/components/SellFlow/steps/Step8Monitor";
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import {
  setAptosInstance,
  isSettled,
  getBidResults,
  getBidInfo,
  getSettlement,
} from "@atomica/sdk/aptos";
import { WalletContext } from "../../src/context/WalletContext";
import { getDerivedAddress } from "@atomica/aptos-docker-testnet/browser";
import { ethers } from "ethers";

// SCOUT(#241) REMOVE: MIN_PRICE and the minPrice option below.
const MIN_PRICE = 1_000_000n;
// SCOUT(#217) EDIT: whole-USD prices (2000 and 1500); the $2.00 expectations below become $2000.
// SCOUT(#216) EDIT: on main the winner bids the whole 10 FakeETH supply, far above its 500 FakeUSD collateral; pull request 213 already shrinks SUPPLY to 0.0001 FakeETH (200 FakeUSD at 2_000_000), but LOSE_QUANTITY stays 1 FakeETH, which is above that supply, so the loser's submit_bid aborts with the new over-supply code; shrink LOSE_QUANTITY too.
const WIN_PRICE = 2_000_000n;
const LOSE_PRICE = 1_500_000n;
// The winner bids the whole supply. Its quote must fit the 500 FakeUSD
// collateral: 0.0001 FakeETH at WIN_PRICE (USD per whole FakeETH,
// `quoteForFill`) = 200.
const SUPPLY = ethers.parseEther("0.0001");
const LOSE_QUANTITY = ethers.parseEther("1");
// SCOUT(#224) EDIT: use the launch pair.
const PAIR_BCS = new TextEncoder().encode("10-settle");
// SCOUT(#243) EDIT: a 120 second deadline needs the test cap.
const DEADLINE_AHEAD_US = 120_000_000n;
/** Seconds to wait after the deadline for the validators to reveal the key. */
const REVEAL_TIMEOUT_SECS = 300;

function SettleProviders({
  account,
  children,
}: {
  account: string;
  children: React.ReactNode;
}) {
  return (
    <WalletContext.Provider value={{ account, connect: async () => {} }}>
      {children}
    </WalletContext.Provider>
  );
}

describe.sequential("10: Settle Auction", () => {
  let fixture: IntegrationFixture;
  let aptosClient: Aptos;
  let moduleAddr: string;
  let operator: Account;
  let settlerEthAddress: string;
  let settlerAptosAddress: string;
  let auction: LiveWindow;
  let winCollateral: string;
  let loseCollateral: string;

  beforeAll(async () => {
    fixture = await setupIntegrationFixture();
    moduleAddr = fixture.aptos.moduleAddress;

    aptosClient = new Aptos(
      new AptosConfig({ network: Network.LOCAL, fullnode: fixture.aptos.nodeUrl }),
    );
    setAptosInstance(aptosClient);

    operator = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(fixture.aptos.deployerPrivateKey),
    });

    // SettleButton signs with SIWE: fund the seller's derived Aptos address.
    settlerEthAddress = await setupWalletMock({
      privateKey: fixture.eth.seller.privateKey,
      rpcUrl: fixture.eth.rpcUrl,
      chainId: fixture.eth.chainId,
    });
    settlerAptosAddress = (await getDerivedAddress(settlerEthAddress.toLowerCase())).toString();
    await commands.fundAccount(settlerAptosAddress, 500_000_000);

    winCollateral = await lockBidCollateral(fixture, aptosClient, operator, PAIR_BCS);
    loseCollateral = await lockBidCollateral(fixture, aptosClient, operator, PAIR_BCS);

    auction = await createLiveWindow(fixture, aptosClient, operator, {
      pairBcs: PAIR_BCS,
      minPrice: MIN_PRICE,
      deadlineAheadUs: DEADLINE_AHEAD_US,
      // SCOUT(#218) EDIT: pull request 213 sets SUPPLY to 0.0001 FakeETH, below the proposed 0.01 FakeETH minimum seller lock, so create_auction aborts; raise SUPPLY and size collateral with whole-USD prices (217).
      lockAmount: SUPPLY,
    });
    await submitBidDirect(aptosClient, fixture.eth.bidder, auction, WIN_PRICE, winCollateral, SUPPLY);
    await submitBidDirect(
      aptosClient,
      fixture.eth.bidder,
      auction,
      LOSE_PRICE,
      loseCollateral,
      // SCOUT(#216) EDIT: after pull request 213 this quantity (1 FakeETH) is above the window supply (0.0001 FakeETH) and aborts with the new over-supply code.
      LOSE_QUANTITY,
    );

    const state = await getAuctionState(aptosClient, moduleAddr, auction);
    expect(state).toEqual({
      totalSupply: SUPPLY,
      bidCount: 2n,
      settled: false,
      clearingPrice: 0n,
    });
  }, 1_200_000);

  afterAll(async () => {
    await teardownIntegrationFixture();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Test 1: button disabled before the window ends ─────────────────────────

  it("settle button is disabled while the window is open", async () => {
    render(
      <SettleProviders account={settlerEthAddress}>
        <SettleButton
          windowId={auction.windowId}
          pairBcs={PAIR_BCS}
          auctionEndTime={Math.floor(Date.now() / 1000) + 3600}
        />
      </SettleProviders>,
    );

    const btn = screen.getByTestId(settleButton.settleButton) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.textContent).toBe("Settle Auction");
    expect(await isSettled(auction.windowId, PAIR_BCS)).toBe(false);
  }, 30_000);

  // ── Test 2: settle before the deadline aborts ──────────────────────────────

  it("settle before the timelock deadline aborts with E_DEADLINE_NOT_PASSED", async () => {
    await expect(settleAuctionDirect(aptosClient, operator, auction)).rejects.toThrow(
      /E_DEADLINE_NOT_PASSED/,
    );
    expect(await isSettled(auction.windowId, PAIR_BCS)).toBe(false);
  }, 60_000);

  // ── Test 3: reveal → open (clears) → SettleButton ──────────────────────────

  it(
    "after the reveal SettleButton settles the window at the winning price",
    async () => {
      await waitForReveal(
        auction.timelockId,
        Number(DEADLINE_AHEAD_US / 1_000_000n) + REVEAL_TIMEOUT_SECS,
      );

      // SCOUT(#228) EDIT: call open_bids from an account that is not the bidder, with no prices and no salts.
      const opened = await openWindowBidsDirect(aptosClient, operator, auction);
      expect(opened.map((b) => b.price)).toEqual([WIN_PRICE, LOSE_PRICE]);
      expect((await getBidInfo(auction.windowId, PAIR_BCS, 0n)).opened).toBe(true);
      expect((await getBidInfo(auction.windowId, PAIR_BCS, 1n)).opened).toBe(true);
      // SCOUT(#228) EDIT: reveal_final has no finalize step any more; assert the cleared state the new view gives.
      expect(
        await getWindowStatus(aptosClient, moduleAddr, auction.windowId, PAIR_BCS),
      ).toEqual({ timelockId: auction.timelockId, revealFinal: true, refunded: false });

      // Opening the last bid finalized the reveal and cleared the window.
      const results = await getBidResults(auction.windowId, PAIR_BCS);
      expect(results.map((r) => [r.isWinner, r.fillAmount])).toEqual([
        [true, SUPPLY],
        [false, 0n],
      ]);

      render(
        <SettleProviders account={settlerEthAddress}>
          <SettleButton
            windowId={auction.windowId}
            pairBcs={PAIR_BCS}
            auctionEndTime={Math.floor(Date.now() / 1000) - 10}
          />
        </SettleProviders>,
      );
      const btn = await waitFor(
        () => {
          const b = screen.getByTestId(settleButton.settleButton) as HTMLButtonElement;
          expect(b.disabled).toBe(false);
          return b;
        },
        { timeout: 10_000 },
      );
      fireEvent.click(btn);

      await waitFor(
        () => {
          expect(screen.getByTestId(settleButton.settleStatus).textContent).toBe("Settled");
        },
        { timeout: 60_000 },
      );
      const settleResult = screen.getByTestId(settleButton.settleResult);
      expect(settleResult.contains(screen.getByTestId(settleButton.settleClearingPrice))).toBe(
        true,
      );
      // SCOUT(#217) EDIT: the displayed clearing price becomes $2000.
      expect(screen.getByTestId(settleButton.settleClearingPrice).textContent).toBe("$2.00");

      const state = await getAuctionState(aptosClient, moduleAddr, auction);
      expect(state.settled).toBe(true);
      expect(state.clearingPrice).toBe(WIN_PRICE);
      expect(await isSettled(auction.windowId, PAIR_BCS)).toBe(true);

      // Winner collateral pays the seller (filled), loser collateral goes back
      // to the bidder (revoked), and the seller lock pays the winner (filled).
      expect(
        await getReceiptStatus(aptosClient, moduleAddr, "FakeUSD", winCollateral),
      ).toBe(RECEIPT_FILLED);
      expect(
        await getReceiptStatus(aptosClient, moduleAddr, "FakeUSD", loseCollateral),
      ).toBe(RECEIPT_REVOKED);
      expect(
        await getReceiptStatus(aptosClient, moduleAddr, "FakeETH", auction.sellerLockId),
      ).toBe(RECEIPT_FILLED);
    },
    (Number(DEADLINE_AHEAD_US / 1_000_000n) + REVEAL_TIMEOUT_SECS + 180) * 1000,
  );

  // ── Test 4: double settle rejected ─────────────────────────────────────────

  it("a second settle aborts with E_WINDOW_ALREADY_SETTLED and the button shows Already Settled", async () => {
    await expect(settleAuctionDirect(aptosClient, operator, auction)).rejects.toThrow(
      /E_WINDOW_ALREADY_SETTLED/,
    );

    render(
      <SettleProviders account={settlerEthAddress}>
        <SettleButton
          windowId={auction.windowId}
          pairBcs={PAIR_BCS}
          auctionEndTime={Math.floor(Date.now() / 1000) - 10}
        />
      </SettleProviders>,
    );
    await waitFor(
      () => {
        expect(screen.getByTestId(settleButton.settleStatus).textContent).toBe(
          "Already Settled",
        );
      },
      { timeout: 15_000 },
    );
    const btn = screen.getByTestId(settleButton.settleButton) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    // SCOUT(#217) EDIT: the displayed clearing price becomes $2000.
    expect(screen.getByTestId(settleButton.settleClearingPrice).textContent).toBe("$2.00");
  }, 60_000);

  // ── Test 5: Step8Monitor shows the settled window ──────────────────────────

  it("Step8Monitor shows the settled window and records its clearing price", async () => {
    localStorage.clear();
    // The seller's Ethereum-derivable account created the window.
    const sellerAddress = settlerAptosAddress;

    render(
      <SettleProviders account={settlerEthAddress}>
        <Step8Monitor
          auctionEndTime={Math.floor(Date.now() / 1000) - 10}
          windowId={auction.windowId}
          pairBcs={PAIR_BCS}
          sellerAddress={sellerAddress}
          onCancelAndUnlock={async () => {}}
          loading={false}
        />
      </SettleProviders>,
    );

    expect(screen.getByTestId(step8Monitor.auctionStatusBadge).textContent).toBe("Settled");
    await waitFor(
      () => {
        expect(screen.getByTestId(settleButton.settleStatus).textContent).toBe(
          "Already Settled",
        );
        const rows = screen.getAllByTestId(bidHistory.bidHistoryRow);
        expect(rows).toHaveLength(1);
        expect(rows[0].textContent).toContain(auction.windowId.toString());
        // SCOUT(#217) EDIT: the bid history price becomes $2000.
        expect(rows[0].textContent).toContain("$2.00");
      },
      { timeout: 15_000 },
    );
  }, 60_000);

  it.todo("SCOUT(#216) an under-collateralized bid opens without abort, reads invalid, takes no fill, and settle returns its whole collateral to its depositor");
  // ── Test 6: get_settlement reads the filled total ──────────────────────────

  it("get_settlement returns the sum of the winners' fills and SettleButton shows it as the total filled", async () => {
    const results = await getBidResults(auction.windowId, PAIR_BCS);
    const filled = results.reduce((sum, r) => sum + r.fillAmount, 0n);
    expect(filled).toBe(SUPPLY);

    const settlement = await getSettlement(auction.windowId, PAIR_BCS);
    expect(settlement).toEqual({ clearingPrice: WIN_PRICE, totalFilled: filled });

    render(
      <SettleProviders account={settlerEthAddress}>
        <SettleButton
          windowId={auction.windowId}
          pairBcs={PAIR_BCS}
          auctionEndTime={Math.floor(Date.now() / 1000) - 10}
        />
      </SettleProviders>,
    );
    await waitFor(
      () => {
        expect(screen.getByTestId(settleButton.settleTotalFilled).textContent).toBe(
          `${(Number(filled) / 1e18).toFixed(4)} ETH`,
        );
      },
      { timeout: 15_000 },
    );
  }, 60_000);
});
