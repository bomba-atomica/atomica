/**
 * @file 11-claim-and-reclaim.test.tsx
 * @description Live ClaimButton tests on one window of the dual-chain testnet.
 *
 * One sealed bid (price 2.00, 1 FakeETH of the seller's 10) is placed by the
 * bidder's Ethereum-derivable account, the only account that can claim the
 * bidder's collateral receipt. The ClaimButton signs through SIWE with the
 * bidder wallet mock.
 *
 * Scenarios:
 *   1. Before settlement: ClaimButton shows "Auction not yet settled" and both
 *      buttons are disabled; is_settled is false and the bid is on chain
 *   2. After reveal, opening, clearing and settle: ClaimButton reads the
 *      settlement, the claim mints the clearing price in FakeETH (the Demo-phase
 *      payout) and the receipts keep their settled statuses
 *   3. The reclaim button stays disabled: the Demo phase has no reclaim path
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
import { SELECTORS } from "./helpers/selectors";
import {
  createLiveWindow,
  lockBidCollateral,
  submitBidDirect,
  waitForReveal,
  openWindowBidsDirect,
  settleAuctionDirect,
  getAuctionState,
  getReceiptStatus,
  RECEIPT_FILLED,
  type LiveWindow,
} from "./helpers/auction-setup";
import { ClaimButton } from "../../src/components/ClaimButton";
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
  getBidCount,
  getBidResults,
  getFakeEthBalance,
} from "@atomica/sdk/aptos";
import { WalletContext } from "../../src/context/WalletContext";
import { getDerivedAddress } from "@atomica/aptos-docker-testnet/browser";
import { ethers } from "ethers";

const MIN_PRICE = 1_000_000n;
const BID_PRICE = 2_000_000n;
const BID_QUANTITY = ethers.parseEther("1");
const PAIR_BCS = new TextEncoder().encode("11-claim");
const DEADLINE_AHEAD_US = 120_000_000n;
/** Seconds to wait after the deadline for the validators to reveal the key. */
const REVEAL_TIMEOUT_SECS = 300;

function ClaimProviders({
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

describe.sequential("11: ClaimButton — settlement-aware claim with Demo-phase mint", () => {
  let fixture: IntegrationFixture;
  let aptosClient: Aptos;
  let moduleAddr: string;
  let operator: Account;
  let ethAddress: string;
  let derivedAddress: string;
  let auction: LiveWindow;
  let collateral: string;

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

    // The ClaimButton signs with SIWE: fund the bidder's derived Aptos address.
    ethAddress = await setupWalletMock({
      privateKey: fixture.eth.bidder.privateKey,
      rpcUrl: fixture.eth.rpcUrl,
      chainId: fixture.eth.chainId,
    });
    derivedAddress = (await getDerivedAddress(ethAddress.toLowerCase())).toString();
    await commands.fundAccount(derivedAddress, 500_000_000);

    collateral = await lockBidCollateral(fixture, aptosClient, operator, PAIR_BCS);
    auction = await createLiveWindow(fixture, aptosClient, operator, {
      pairBcs: PAIR_BCS,
      minPrice: MIN_PRICE,
      deadlineAheadUs: DEADLINE_AHEAD_US,
    });
    await submitBidDirect(aptosClient, fixture.eth.bidder, auction, BID_PRICE, collateral, BID_QUANTITY);
  }, 1_200_000);

  afterAll(async () => {
    await teardownIntegrationFixture();
  });

  afterEach(() => {
    cleanup();
  });

  // ── 11-1: before settlement ────────────────────────────────────────────────

  it(
    "unsettled window: both buttons disabled, status shows 'not yet settled'",
    async () => {
      expect(await getBidCount(auction.windowId, PAIR_BCS)).toBe(1n);
      expect(await isSettled(auction.windowId, PAIR_BCS)).toBe(false);

      render(
        <ClaimProviders account={ethAddress}>
          <ClaimButton windowId={auction.windowId} pairBcs={PAIR_BCS} />
        </ClaimProviders>,
      );

      await waitFor(
        () => {
          const status = screen.getByTestId(SELECTORS.claimButton.claimStatus);
          expect(status.textContent).toBe("Auction not yet settled");
        },
        { timeout: 15_000 },
      );

      const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
      const reclaimBtn = screen.getByTestId(SELECTORS.claimButton.reclaimButton);
      expect((claimBtn as HTMLButtonElement).disabled).toBe(true);
      expect((reclaimBtn as HTMLButtonElement).disabled).toBe(true);
    },
    60_000,
  );

  // ── 11-2: settled window — claim mints the clearing price ──────────────────

  it(
    "settled window: claim enables and mints the clearing price in FakeETH",
    async () => {
      await waitForReveal(
        auction.timelockId,
        Number(DEADLINE_AHEAD_US / 1_000_000n) + REVEAL_TIMEOUT_SECS,
      );
      await openWindowBidsDirect(aptosClient, operator, auction);
      await settleAuctionDirect(aptosClient, operator, auction);

      const state = await getAuctionState(aptosClient, moduleAddr, auction);
      expect(state.settled).toBe(true);
      expect(state.clearingPrice).toBe(BID_PRICE);
      const results = await getBidResults(auction.windowId, PAIR_BCS);
      expect(results.map((r) => [r.isWinner, r.fillAmount])).toEqual([
        [true, BID_QUANTITY],
      ]);
      // The winner's collateral pays the seller and the partly filled seller
      // lock pays the winner: both are filled (issue 194).
      expect(
        await getReceiptStatus(aptosClient, moduleAddr, "FakeUSD", collateral),
      ).toBe(RECEIPT_FILLED);
      expect(
        await getReceiptStatus(aptosClient, moduleAddr, "FakeETH", auction.sellerLockId),
      ).toBe(RECEIPT_FILLED);

      const balanceBefore = await getFakeEthBalance(derivedAddress);

      render(
        <ClaimProviders account={ethAddress}>
          <ClaimButton windowId={auction.windowId} pairBcs={PAIR_BCS} />
        </ClaimProviders>,
      );

      const claimBtn = await waitFor(
        () => {
          const status = screen.getByTestId(SELECTORS.claimButton.claimStatus);
          expect(status.textContent).toMatch(/^Settled/);
          const b = screen.getByTestId(SELECTORS.claimButton.claimButton) as HTMLButtonElement;
          expect(b.disabled).toBe(false);
          return b;
        },
        { timeout: 15_000 },
      );
      fireEvent.click(claimBtn);

      await waitFor(
        () => {
          expect(
            screen.getByTestId(SELECTORS.claimButton.claimStatus).textContent,
          ).toBe("Claimed");
        },
        { timeout: 60_000 },
      );
      expect(screen.getByTestId(SELECTORS.claimButton.claimButton).textContent).toBe(
        "Claimed",
      );
      const balanceAfter = await getFakeEthBalance(derivedAddress);
      expect(balanceAfter - balanceBefore).toBe(BID_PRICE);
    },
    (Number(DEADLINE_AHEAD_US / 1_000_000n) + REVEAL_TIMEOUT_SECS + 180) * 1000,
  );

  // ── 11-3: reclaim is not available in the Demo phase ───────────────────────

  it("reclaim button stays disabled on a settled window (no Demo-phase reclaim)", async () => {
    render(
      <ClaimProviders account={ethAddress}>
        <ClaimButton windowId={auction.windowId} pairBcs={PAIR_BCS} />
      </ClaimProviders>,
    );

    await waitFor(
      () => {
        expect(
          screen.getByTestId(SELECTORS.claimButton.claimStatus).textContent,
        ).toMatch(/^Settled/);
      },
      { timeout: 15_000 },
    );
    const reclaimBtn = screen.getByTestId(SELECTORS.claimButton.reclaimButton);
    expect((reclaimBtn as HTMLButtonElement).disabled).toBe(true);
    expect(reclaimBtn.textContent).toBe("Not applicable (Demo)");
  }, 30_000);
});
