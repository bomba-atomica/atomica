/**
 * @file 11-claim-and-reclaim.test.tsx
 * @description Live ReleaseButton tests on one window of the dual-chain
 * testnet: the release step of a trade (open, settle, release). The file
 * keeps its old name, so the claim-reclaim chunk and the coverage exemption
 * list need no change.
 *
 * One sealed bid (price 2000, 0.1 FakeETH of the seller's lock) is placed by
 * the bidder's Ethereum-derivable account. The release is pressed by the
 * carrier wallet, which is neither the seller nor the bidder: it carries the
 * validator-signed AuctionOutcome to the LockBox through the real
 * AptosLightClient, then releases each lock per its leaf. This needs the
 * BLS12-381 precompiles: the anvil tier runs Prague (ETH_ANVIL_HARDFORK).
 *
 * Scenarios:
 *   1. Before settlement: ReleaseButton is disabled and says release opens
 *      once the window settles.
 *   2. After reveal, opening and settle: the carrier presses Release. The
 *      winner's FakeETH and the seller's FakeUSD ERC-20 balances on Ethereum
 *      rise by the amounts the outcome names. The carrier's tokens do not move.
 *   3. LockBox.statuses reads Released for the seller lock and the winner's
 *      collateral lock.
 *   4. A second press finds no open lock and sends no transaction.
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
  openAndFinalizeWindowDirect,
  settleAuctionDirect,
  getAuctionState,
  TEST_WINDOW_SECS,
  type LiveWindow,
} from "./helpers/auction-setup";
import { ReleaseButton } from "../../src/components/ReleaseButton";
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
  getLockOutcome,
} from "@atomica/sdk/aptos";
import { getLockStatus, LOCK_STATUS } from "@atomica/sdk/ethereum";
import { quoteForFill } from "@atomica/sdk";
import { WalletContext } from "../../src/context/WalletContext";
import { ethers } from "ethers";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";

/** Whole USD per whole FakeETH. */
const BID_PRICE = 2000n;
// Small enough that the winner's quote fits the 500 FakeUSD collateral:
// 0.1 FakeETH at BID_PRICE (`quoteForFill`) = 200 FakeUSD.
const BID_QUANTITY = ethers.parseEther("0.1");
// The launch pair: the only pair on the allowlist.
const PAIR_BCS = LAUNCH_PAIR_BCS;
/**
 * The window is created with at least this long left before its close, so
 * the collateral and the bid land in it (seconds). On the docker Ethereum
 * chain one lock proof cycle takes about 3 minutes: the seller lock and the
 * collateral take two.
 */
const MIN_WINDOW_LEFT_SECS = 540n;
/** Seconds to wait after the deadline for the validators to reveal the key. */
const REVEAL_TIMEOUT_SECS = 300;
const ERC20 = ["function balanceOf(address) view returns (uint256)"];

function ReleaseProviders({
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

/** Sum of the payouts a lock's leaf names for `recipient`. */
function paidTo(
  outcome: { recipients: string[]; amounts: bigint[] },
  recipient: string,
): bigint {
  return outcome.recipients.reduce(
    (sum, r, i) =>
      r.toLowerCase() === recipient.toLowerCase()
        ? sum + outcome.amounts[i]
        : sum,
    0n,
  );
}

describe.sequential(
  "11: ReleaseButton — anyone releases a settled window on Ethereum",
  () => {
    let fixture: IntegrationFixture;
    let aptosClient: Aptos;
    let moduleAddr: string;
    let operator: Account;
    let carrierAccount: string;
    let auction: LiveWindow;
    let collateral: string;
    let rpc: ethers.JsonRpcProvider;
    let fakeEth: ethers.Contract;
    let fakeUsd: ethers.Contract;

    beforeAll(async () => {
      fixture = await setupIntegrationFixture();
      moduleAddr = fixture.aptos.moduleAddress;

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

      // The window first: the collateral locks into the window open then.
      auction = await createLiveWindow(fixture, aptosClient, operator, {
        pairBcs: PAIR_BCS,
        minWindowLeftSecs: MIN_WINDOW_LEFT_SECS,
      });
      collateral = await lockBidCollateral(
        fixture,
        aptosClient,
        operator,
        PAIR_BCS,
      );
      await submitBidDirect(
        aptosClient,
        fixture.eth.bidder,
        auction,
        BID_PRICE,
        collateral,
        BID_QUANTITY,
      );

      // The carrier presses Release. It is neither the seller nor the bidder,
      // and it holds ETH for gas only.
      carrierAccount = (
        await setupWalletMock({
          privateKey: fixture.eth.carrier.privateKey,
          rpcUrl: fixture.eth.rpcUrl,
          chainId: fixture.eth.chainId,
        })
      ).toLowerCase();
      expect(carrierAccount).not.toBe(fixture.eth.seller.address.toLowerCase());
      expect(carrierAccount).not.toBe(fixture.eth.bidder.address.toLowerCase());
    }, 2_400_000);

    afterAll(async () => {
      await teardownIntegrationFixture();
    });

    afterEach(() => {
      cleanup();
    });

    // ── 11-1: before settlement ────────────────────────────────────────────────

    it("unsettled window: release is disabled until the window settles", async () => {
      expect(await getBidCount(auction.windowId, PAIR_BCS)).toBe(1n);
      expect(await isSettled(auction.windowId, PAIR_BCS)).toBe(false);

      render(
        <ReleaseProviders account={carrierAccount}>
          <ReleaseButton windowId={auction.windowId} pairBcs={PAIR_BCS} />
        </ReleaseProviders>,
      );

      await waitFor(
        () => {
          expect(
            screen.getByTestId(SELECTORS.releaseButton.releaseNote).textContent,
          ).toContain("once the window settles");
          // The seller lock and the collateral lock, both open on Ethereum.
          expect(
            screen
              .getAllByTestId(SELECTORS.releaseButton.releaseLock)
              .map((r) => r.getAttribute("data-status")),
          ).toEqual(["open", "open"]);
        },
        { timeout: 30_000 },
      );
      expect(
        screen.getByTestId(SELECTORS.releaseButton.releaseButton),
      ).toBeDisabled();
    }, 60_000);

    // ── 11-2: settled window — a third party releases ──────────────────────────

    it(
      "release pressed by a wallet that is neither seller nor bidder pays the winner FakeETH and the seller FakeUSD on Ethereum",
      async () => {
        await waitForReveal(
          auction.timelockId,
          TEST_WINDOW_SECS + REVEAL_TIMEOUT_SECS,
        );
        await openAndFinalizeWindowDirect(aptosClient, operator, auction);
        await settleAuctionDirect(aptosClient, operator, auction);

        const state = await getAuctionState(aptosClient, moduleAddr, auction);
        expect(state.settled).toBe(true);
        expect(state.clearingPrice).toBe(BID_PRICE);
        const results = await getBidResults(auction.windowId, PAIR_BCS);
        expect(results.map((r) => [r.isWinner, r.fillAmount])).toEqual([
          [true, BID_QUANTITY],
        ]);

        const seller = fixture.eth.seller.address;
        const winner = fixture.eth.bidder.address;
        const sellerOutcome = await getLockOutcome(
          "FakeETH",
          auction.sellerLockId,
        );
        const collateralOutcome = await getLockOutcome("FakeUSD", collateral);
        // The seller lock pays the winner its fill; the collateral pays the
        // seller the quote.
        expect(paidTo(sellerOutcome, winner)).toBe(BID_QUANTITY);
        expect(paidTo(collateralOutcome, seller)).toBe(
          quoteForFill(BID_QUANTITY, BID_PRICE),
        );

        const before = {
          winnerEth: (await fakeEth.balanceOf(winner)) as bigint,
          sellerUsd: (await fakeUsd.balanceOf(seller)) as bigint,
          carrierEth: (await fakeEth.balanceOf(carrierAccount)) as bigint,
          carrierUsd: (await fakeUsd.balanceOf(carrierAccount)) as bigint,
        };

        render(
          <ReleaseProviders account={carrierAccount}>
            <ReleaseButton
              windowId={auction.windowId}
              pairBcs={PAIR_BCS}
              pollIntervalMs={2_000}
            />
          </ReleaseProviders>,
        );
        const button = await waitFor(
          () => {
            const b = screen.getByTestId(SELECTORS.releaseButton.releaseButton);
            expect(b).not.toBeDisabled();
            return b;
          },
          { timeout: 60_000 },
        );
        fireEvent.click(button);

        await waitFor(
          () => {
            expect(
              screen.getByTestId(SELECTORS.releaseButton.releaseStatus)
                .textContent,
            ).toBe("Released 2 lock(s).");
          },
          { timeout: 300_000 },
        );

        // The winner's FakeETH rises by its payout in the seller lock's leaf,
        // the seller's FakeUSD by its payout in the collateral lock's leaf.
        expect(
          ((await fakeEth.balanceOf(winner)) as bigint) - before.winnerEth,
        ).toBe(paidTo(sellerOutcome, winner));
        expect(
          ((await fakeUsd.balanceOf(seller)) as bigint) - before.sellerUsd,
        ).toBe(paidTo(collateralOutcome, seller));
        expect(await fakeEth.balanceOf(carrierAccount)).toBe(before.carrierEth);
        expect(await fakeUsd.balanceOf(carrierAccount)).toBe(before.carrierUsd);
      },
      (TEST_WINDOW_SECS + REVEAL_TIMEOUT_SECS + 600) * 1000,
    );

    // ── 11-3: both locks are released on LockBox ───────────────────────────────

    it("LockBox.statuses reads released for the seller lock and the winner collateral lock", async () => {
      expect(await getLockStatus(rpc, auction.sellerLockId)).toBe(
        LOCK_STATUS.Released,
      );
      expect(await getLockStatus(rpc, collateral)).toBe(LOCK_STATUS.Released);
    }, 30_000);

    // ── 11-4: a second press sends nothing ─────────────────────────────────────

    it("a second press finds no open lock and sends no transaction", async () => {
      const nonceBefore = await rpc.getTransactionCount(carrierAccount);
      render(
        <ReleaseProviders account={carrierAccount}>
          <ReleaseButton windowId={auction.windowId} pairBcs={PAIR_BCS} />
        </ReleaseProviders>,
      );
      await waitFor(
        () => {
          expect(
            screen.getByTestId(SELECTORS.releaseButton.releaseNote).textContent,
          ).toContain("Every lock of this window is closed");
        },
        { timeout: 30_000 },
      );
      const button = screen.getByTestId(SELECTORS.releaseButton.releaseButton);
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(
        screen
          .getAllByTestId(SELECTORS.releaseButton.releaseLock)
          .map((r) => r.getAttribute("data-status")),
      ).toEqual(["released", "released"]);
      expect(
        screen.queryByTestId(SELECTORS.releaseButton.releaseStatus),
      ).toBeNull();
      expect(await rpc.getTransactionCount(carrierAccount)).toBe(nonceBefore);
    }, 60_000);
  },
);
