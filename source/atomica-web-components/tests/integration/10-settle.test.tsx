/**
 * 10-settle.test.tsx
 *
 * Live settlement tests for SettleButton on one window of the dual-chain
 * testnet. Three sealed bids compete for the seller's 0.1 FakeETH. Prices are
 * whole USD per whole FakeETH:
 *
 *   winner  — price 2000, quantity 0.1 FakeETH (fills the whole supply)
 *   loser   — price 1500, quantity 0.1 FakeETH
 *   invalid — price 3000, quantity 0.1 FakeETH, 100 FakeUSD collateral
 *             against a 300 FakeUSD quote: invalid at opening, never fills
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
 *   6. The under-collateralized bid opened without abort, reads invalid, took
 *      no fill, and settle returned its whole collateral to its depositor
 *   7. get_settlement returns the sum of the winners' fills, which SettleButton
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
  lockBidCollaterals,
  submitBidDirect,
  waitForReveal,
  openAndFinalizeWindowDirect,
  openBidsDirect,
  settleAuctionDirect,
  getWindowStatus,
  getAuctionState,
  getReceiptStatus,
  RECEIPT_FILLED,
  RECEIPT_REVOKED,
  TEST_WINDOW_SECS,
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
  getLockOutcome,
} from "@atomica/sdk/aptos";
import { WalletContext } from "../../src/context/WalletContext";
import { getDerivedAddress } from "@atomica/aptos-docker-testnet/browser";
import { ethers } from "ethers";
import { LAUNCH_PAIR_BCS, quoteForFill } from "@atomica/sdk/settlement/bridge";

// Whole USD per whole FakeETH.
const WIN_PRICE = 2000n;
const LOSE_PRICE = 1500n;
// The winner bids the whole supply. Its quote must fit the 500 FakeUSD
// collateral: 0.1 FakeETH at WIN_PRICE (`quoteForFill`) = 200 FakeUSD.
const SUPPLY = ethers.parseEther("0.1");
// submit_bid aborts on a quantity above the window supply.
const LOSE_QUANTITY = SUPPLY;
// Above WIN_PRICE, so it would win if it were valid. Its quote at its own
// price is 300 FakeUSD, above the 100 FakeUSD it locks: invalid at opening.
const INVALID_PRICE = 3000n;
const INVALID_COLLATERAL = 100n * 10n ** 6n;
// The launch pair: the only pair on the allowlist.
const PAIR_BCS = LAUNCH_PAIR_BCS;
/**
 * The window is created with at least this long left before its close, so
 * the collaterals and the bids land in it (seconds). On the docker Ethereum
 * chain one lock proof cycle takes about 3 minutes: the seller lock, the two
 * default collaterals and the invalid collateral take three.
 */
const MIN_WINDOW_LEFT_SECS = 720n;
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
  let invalidCollateral: string;

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

    // The window first: the collaterals lock into the window open then.
    auction = await createLiveWindow(fixture, aptosClient, operator, {
      pairBcs: PAIR_BCS,
      minWindowLeftSecs: MIN_WINDOW_LEFT_SECS,
      lockAmount: SUPPLY,
    });
    // One proof cycle for both default collaterals.
    [winCollateral, loseCollateral] = await lockBidCollaterals(
      fixture,
      aptosClient,
      operator,
      PAIR_BCS,
      2,
    );
    invalidCollateral = await lockBidCollateral(
      fixture,
      aptosClient,
      operator,
      PAIR_BCS,
      INVALID_COLLATERAL,
    );
    expect(quoteForFill(SUPPLY, INVALID_PRICE)).toBeGreaterThan(INVALID_COLLATERAL);
    await submitBidDirect(aptosClient, fixture.eth.bidder, auction, WIN_PRICE, winCollateral, SUPPLY);
    await submitBidDirect(
      aptosClient,
      fixture.eth.bidder,
      auction,
      LOSE_PRICE,
      loseCollateral,
      LOSE_QUANTITY,
    );
    await submitBidDirect(
      aptosClient,
      fixture.eth.bidder,
      auction,
      INVALID_PRICE,
      invalidCollateral,
      SUPPLY,
    );

    const state = await getAuctionState(aptosClient, moduleAddr, auction);
    expect(state).toEqual({
      totalSupply: SUPPLY,
      bidCount: 3n,
      settled: false,
      clearingPrice: 0n,
    });
  }, 2_400_000);

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
        TEST_WINDOW_SECS + REVEAL_TIMEOUT_SECS,
      );

      // The operator, which is not a bidder, opens the bids on chain with
      // open_bids: no price and no salt is sent. It does not clear.
      await openBidsDirect(aptosClient, operator, auction);
      for (const [i, price] of [WIN_PRICE, LOSE_PRICE, INVALID_PRICE].entries()) {
        const info = await getBidInfo(auction.windowId, PAIR_BCS, BigInt(i));
        expect(info.opened).toBe(true);
        expect(info.price).toBe(price);
      }
      expect(
        await getWindowStatus(aptosClient, moduleAddr, auction.windowId, PAIR_BCS),
      ).toEqual({ timelockId: auction.timelockId, revealFinal: false, refunded: false });

      // finalize_window, from the same non-bidder, clears the window.
      const { openHashes } = await openAndFinalizeWindowDirect(aptosClient, operator, auction);
      expect(openHashes).toHaveLength(0);
      expect(
        await getWindowStatus(aptosClient, moduleAddr, auction.windowId, PAIR_BCS),
      ).toEqual({ timelockId: auction.timelockId, revealFinal: true, refunded: false });

      const results = await getBidResults(auction.windowId, PAIR_BCS);
      expect(results.map((r) => [r.isWinner, r.fillAmount])).toEqual([
        [true, SUPPLY],
        [false, 0n],
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
      expect(screen.getByTestId(settleButton.settleClearingPrice).textContent).toBe("$2000");

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
    (TEST_WINDOW_SECS + REVEAL_TIMEOUT_SECS + 180) * 1000,
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
    expect(screen.getByTestId(settleButton.settleClearingPrice).textContent).toBe("$2000");
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
        expect(rows[0].textContent).toContain("$2000");
      },
      { timeout: 15_000 },
    );
  }, 60_000);

  // ── Test 6: the under-collateralized bid ───────────────────────────────────

  it("an under-collateralized bid opens without abort, reads invalid, takes no fill, and settle returns its whole collateral to its depositor", async () => {
    // Test 3 opened all three bids in one call without abort.
    const info = await getBidInfo(auction.windowId, PAIR_BCS, 2n);
    expect(info.opened).toBe(true);
    expect(info.price).toBe(INVALID_PRICE);
    expect(info.valid).toBe(false);
    // The valid bids stay valid.
    expect((await getBidInfo(auction.windowId, PAIR_BCS, 0n)).valid).toBe(true);
    expect((await getBidInfo(auction.windowId, PAIR_BCS, 1n)).valid).toBe(true);

    // The higher price did not win and did not set the clearing price.
    const results = await getBidResults(auction.windowId, PAIR_BCS);
    expect([results[2].isWinner, results[2].fillAmount]).toEqual([false, 0n]);
    const state = await getAuctionState(aptosClient, moduleAddr, auction);
    expect(state.clearingPrice).toBe(WIN_PRICE);

    // Its whole collateral goes back to its depositor: nothing is slashed.
    expect(
      await getReceiptStatus(aptosClient, moduleAddr, "FakeUSD", invalidCollateral),
    ).toBe(RECEIPT_REVOKED);
    const outcome = await getLockOutcome("FakeUSD", invalidCollateral);
    expect(outcome.recipients).toEqual([
      new ethers.Wallet(fixture.eth.bidder.privateKey).address,
    ]);
    expect(outcome.amounts).toEqual([INVALID_COLLATERAL]);
  }, 60_000);

  // ── Test 7: get_settlement reads the filled total ──────────────────────────

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
