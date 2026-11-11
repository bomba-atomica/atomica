/**
 * 10-settle.test.tsx
 *
 * Live settlement tests for SettleButton on one window of the dual-chain
 * testnet. Two sealed bids compete for the seller's 10 FakeETH:
 *
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
  RECEIPT_CLAIMED,
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
} from "@atomica/sdk/aptos";
import { WalletContext } from "../../src/context/WalletContext";
import { getDerivedAddress } from "@atomica/aptos-docker-testnet/browser";
import { ethers } from "ethers";

const MIN_PRICE = 1_000_000n;
const WIN_PRICE = 2_000_000n;
const LOSE_PRICE = 1_500_000n;
const SUPPLY = ethers.parseEther("10");
const LOSE_QUANTITY = ethers.parseEther("1");
const PAIR_BCS = new TextEncoder().encode("10-settle");
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

    winCollateral = await lockBidCollateral(fixture, aptosClient, operator);
    loseCollateral = await lockBidCollateral(fixture, aptosClient, operator);

    auction = await createLiveWindow(fixture, aptosClient, operator, {
      pairBcs: PAIR_BCS,
      minPrice: MIN_PRICE,
      deadlineAheadUs: DEADLINE_AHEAD_US,
      lockAmount: SUPPLY,
    });
    await submitBidDirect(aptosClient, fixture.eth.bidder, auction, WIN_PRICE, winCollateral, SUPPLY);
    await submitBidDirect(
      aptosClient,
      fixture.eth.bidder,
      auction,
      LOSE_PRICE,
      loseCollateral,
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

      const opened = await openWindowBidsDirect(aptosClient, operator, auction);
      expect(opened.map((b) => b.price)).toEqual([WIN_PRICE, LOSE_PRICE]);
      expect((await getBidInfo(auction.windowId, PAIR_BCS, 0n)).opened).toBe(true);
      expect((await getBidInfo(auction.windowId, PAIR_BCS, 1n)).opened).toBe(true);
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
      expect(screen.getByTestId(settleButton.settleClearingPrice).textContent).toBe("$2.00");

      const state = await getAuctionState(aptosClient, moduleAddr, auction);
      expect(state.settled).toBe(true);
      expect(state.clearingPrice).toBe(WIN_PRICE);
      expect(await isSettled(auction.windowId, PAIR_BCS)).toBe(true);

      // Winner collateral stays claimed, loser collateral is released for the
      // relayer, and the filled seller lock stays claimed.
      expect(
        await getReceiptStatus(aptosClient, moduleAddr, "FakeUSD", winCollateral),
      ).toBe(RECEIPT_CLAIMED);
      expect(
        await getReceiptStatus(aptosClient, moduleAddr, "FakeUSD", loseCollateral),
      ).toBe(RECEIPT_REVOKED);
      expect(
        await getReceiptStatus(aptosClient, moduleAddr, "FakeETH", auction.sellerLockId),
      ).toBe(RECEIPT_CLAIMED);
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
        expect(rows[0].textContent).toContain("$2.00");
      },
      { timeout: 15_000 },
    );
  }, 60_000);
});
