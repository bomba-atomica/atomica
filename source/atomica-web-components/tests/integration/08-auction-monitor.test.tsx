/**
 * 08-auction-monitor.test.tsx
 *
 * Browser integration tests for Step8Monitor — the UI component that
 * shows a live countdown, status badge, and seller address for an auction.
 *
 * Scenarios:
 *   1. Active countdown displayed when endTime is in the future
 *   2. Status badge reads "Active" while auction is open
 *   3. Status badge transitions to "Settled" (i.e. "Ended") after expiry
 *   4. A live window created on chain reads back from get_window_status and
 *      Step8Monitor counts down to it
 *
 * Setup:
 *   - Dual-chain testnet started in beforeAll
 *
 * Note: Step8Monitor is a presentation component — it takes auctionEndTime as
 * a prop and renders a countdown.  No on-chain interaction is needed in tests
 * 1 and 2.  Test 3 verifies the DOM transition that happens when the endTime
 * passes.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import {
  setupIntegrationFixture,
  teardownIntegrationFixture,
  AUCTION_DURATION_SHORT,
  type IntegrationFixture,
} from "./fixtures/dual-chain";
import { setupWalletMock } from "./fixtures/wallet-mock";
import { step8Monitor } from "./helpers/selectors";
import {
  createLiveWindow,
  chainNowUs,
  getAuctionState,
  getReceiptStatus,
  getWindowStatus,
  RECEIPT_CLAIMED,
} from "./helpers/auction-setup";
import { Step8Monitor } from "../../src/components/SellFlow/steps/Step8Monitor";
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import { setAptosInstance } from "@atomica/sdk/aptos";
import { ethers } from "ethers";

const MIN_PRICE = 1_000_000n;
const PAIR_BCS = new TextEncoder().encode("08-auction-monitor");
/** The live window's bids close this far after creation. */
const DEADLINE_AHEAD_US = 20_000_000n;

describe.sequential("08: Auction Monitor countdown and status", () => {
  let fixture: IntegrationFixture;
  let aptosClient: Aptos;

  beforeAll(async () => {
    fixture = await setupIntegrationFixture();

    const aptosConfig = new AptosConfig({
      network: Network.LOCAL,
      fullnode: fixture.aptos.nodeUrl,
    });
    aptosClient = new Aptos(aptosConfig);
    setAptosInstance(aptosClient);

    await setupWalletMock({
      privateKey: fixture.eth.seller.privateKey,
      rpcUrl: fixture.eth.rpcUrl,
      chainId: fixture.eth.chainId,
    });
  }, 600_000);

  afterAll(async () => {
    await teardownIntegrationFixture();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Test 1: active countdown shown ────────────────────────────────────────

  it("shows auction-countdown element when auctionEndTime is in the future", () => {
    const endTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    render(
      <Step8Monitor
        auctionEndTime={endTime}
        onCancelAndUnlock={async () => {}}
        loading={false}
      />,
    );

    const countdownEl = screen.getByTestId(step8Monitor.auctionCountdown);
    expect(countdownEl).toBeTruthy();
    // Should show non-zero time remaining (not "Ended")
    expect(countdownEl.textContent).not.toBe("Ended");
    expect(countdownEl.textContent).not.toBe("—");
  });

  // ── Test 2: status badge reads Active while open ──────────────────────────

  it("shows status badge with 'Active' while auction has not expired", () => {
    const endTime = Math.floor(Date.now() / 1000) + 3600;

    render(
      <Step8Monitor
        auctionEndTime={endTime}
        onCancelAndUnlock={async () => {}}
        loading={false}
      />,
    );

    const badge = screen.getByTestId(step8Monitor.auctionStatusBadge);
    expect(badge.textContent).toBe("Active");
  });

  // ── Test 3: seller address shown ──────────────────────────────────────────

  it("shows auction-seller-address when sellerAddress prop is provided", () => {
    const sellerAddress = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const endTime = Math.floor(Date.now() / 1000) + 3600;

    render(
      <Step8Monitor
        auctionEndTime={endTime}
        sellerAddress={sellerAddress}
        onCancelAndUnlock={async () => {}}
        loading={false}
      />,
    );

    const addrEl = screen.getByTestId(step8Monitor.auctionSellerAddress);
    expect(addrEl).toBeTruthy();
    expect(addrEl.textContent?.toLowerCase()).toContain(
      sellerAddress.toLowerCase(),
    );
  });

  // ── Test 4: countdown timer decrements ────────────────────────────────────

  it("countdown timer decrements over time", async () => {
    const endTime = Math.floor(Date.now() / 1000) + 10; // 10 s from now

    render(
      <Step8Monitor
        auctionEndTime={endTime}
        onCancelAndUnlock={async () => {}}
        loading={false}
      />,
    );

    const initial = screen.getByTestId(step8Monitor.auctionCountdown).textContent;

    // Wait 2 s and check that the countdown has changed
    await new Promise((r) => setTimeout(r, 2000));

    const updated = screen.getByTestId(step8Monitor.auctionCountdown).textContent;
    expect(initial).not.toBe(updated);
  }, 15_000);

  // ── Test 5: status badge transitions to Settled after expiry ──────────────

  it(
    "status badge transitions to 'Settled' once AUCTION_DURATION_SHORT elapses",
    async () => {
      // Use AUCTION_DURATION_SHORT (2 s) so the test doesn't take too long.
      // Set endTime 2 s in the future.
      const endTime =
        Math.floor(Date.now() / 1000) + AUCTION_DURATION_SHORT;

      render(
        <Step8Monitor
          auctionEndTime={endTime}
          onCancelAndUnlock={async () => {}}
          loading={false}
        />,
      );

      // Initially Active
      expect(screen.getByTestId(step8Monitor.auctionStatusBadge).textContent).toBe(
        "Active",
      );

      // After expiry the component re-renders with "Settled" (Step8Monitor
      // calls the state "Settled" when ended — see the JSX: ended ? "Settled" : "Active")
      await waitFor(
        () => {
          expect(
            screen.getByTestId(step8Monitor.auctionStatusBadge).textContent,
          ).toBe("Settled");
        },
        { timeout: 10_000 },
      );
    },
    20_000,
  );

  // ── Test 6: live window counts down to its deadline ──────────────────────

  it(
    "live window reads back from chain and Step8Monitor counts down to its deadline",
    async () => {
      const operator = Account.fromPrivateKey({
        privateKey: new Ed25519PrivateKey(fixture.aptos.deployerPrivateKey),
      });
      const moduleAddr = fixture.aptos.moduleAddress;
      const lockAmount = ethers.parseEther("10");

      const auction = await createLiveWindow(fixture, aptosClient, operator, {
        pairBcs: PAIR_BCS,
        minPrice: MIN_PRICE,
        deadlineAheadUs: DEADLINE_AHEAD_US,
        lockAmount,
      });

      expect(
        await getWindowStatus(aptosClient, moduleAddr, auction.windowId, PAIR_BCS),
      ).toEqual({ timelockId: auction.timelockId, revealFinal: false, refunded: false });
      expect(await getAuctionState(aptosClient, moduleAddr, auction)).toEqual({
        totalSupply: lockAmount,
        bidCount: 0n,
        settled: false,
        clearingPrice: 0n,
      });
      expect(
        await getReceiptStatus(aptosClient, moduleAddr, "FakeETH", auction.sellerLockId),
      ).toBe(RECEIPT_CLAIMED);

      // The monitor counts down to the timelock deadline, in wall-clock seconds.
      const remainingSecs = Number(
        (auction.deadlineUs - (await chainNowUs(aptosClient))) / 1_000_000n,
      );
      expect(remainingSecs).toBeGreaterThan(0);
      const endTime = Math.floor(Date.now() / 1000) + remainingSecs;

      render(
        <Step8Monitor
          auctionEndTime={endTime}
          onCancelAndUnlock={async () => {}}
          loading={false}
        />,
      );

      expect(screen.getByTestId(step8Monitor.auctionStatusBadge).textContent).toBe(
        "Active",
      );
      await waitFor(
        () => {
          expect(
            screen.getByTestId(step8Monitor.auctionStatusBadge).textContent,
          ).toBe("Settled");
        },
        { timeout: (remainingSecs + 10) * 1000 },
      );
    },
    900_000,
  );
});
