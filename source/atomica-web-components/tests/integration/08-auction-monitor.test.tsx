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
 *      when a short-duration auction created with AUCTION_DURATION_SHORT is used
 *
 * Setup:
 *   - Dual-chain testnet started in beforeAll
 *   - Auction created with AUCTION_DURATION_SHORT (2 s) for timer tests
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
  setupAuctionState,
  createAuctionDirect,
} from "./helpers/auction-setup";
import { Step8Monitor } from "../../src/components/SellFlow/steps/Step8Monitor";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { setAptosInstance } from "../../src/lib/aptos/config";

const MIN_PRICE = 50n;

describe.sequential("08: Auction Monitor countdown and status", () => {
  let fixture: IntegrationFixture;

  beforeAll(async () => {
    fixture = await setupIntegrationFixture();

    const aptosConfig = new AptosConfig({
      network: Network.LOCAL,
      fullnode: fixture.aptos.nodeUrl,
    });
    setAptosInstance(new Aptos(aptosConfig));

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

  // ── Test 6: short-duration auction created on live chain ──────────────────

  it(
    "auction created with AUCTION_DURATION_SHORT shows countdown then expires",
    async () => {
      // Set up Ethereum lock + Aptos proof registration
      const auctionSetup = await setupAuctionState(fixture);

      // Create auction with 2 s duration
      await createAuctionDirect(
        auctionSetup.aptosClient,
        auctionSetup.deployerAccount,
        fixture.aptos.moduleAddress,
        auctionSetup.lockId,
        MIN_PRICE,
        BigInt(AUCTION_DURATION_SHORT),
      );

      const endTime = Math.floor(Date.now() / 1000) + AUCTION_DURATION_SHORT;

      render(
        <Step8Monitor
          auctionEndTime={endTime}
          onCancelAndUnlock={async () => {}}
          loading={false}
        />,
      );

      // Initially Active
      const badge = screen.getByTestId(step8Monitor.auctionStatusBadge);
      expect(badge.textContent).toBe("Active");

      // After AUCTION_DURATION_SHORT passes, badge should be "Settled"
      await waitFor(
        () => {
          expect(
            screen.getByTestId(step8Monitor.auctionStatusBadge).textContent,
          ).toBe("Settled");
        },
        { timeout: 10_000 },
      );
    },
    600_000,
  );
});
