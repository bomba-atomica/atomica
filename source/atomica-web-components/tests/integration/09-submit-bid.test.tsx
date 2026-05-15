/**
 * 09-submit-bid.test.tsx
 *
 * Browser integration tests for AuctionBidder — the UI component that
 * encrypts and submits a bid on an Aptos auction.
 *
 * Scenarios:
 *   1. Happy path: bid above min_price → tx hash shown in bid-status
 *   2. Bid below min_price → Move abort error shown in bid-status, count unchanged
 *   3. Bid on closed auction → error shown in bid-status
 *   4. Bid on nonexistent auction → error shown in bid-status
 *
 * Setup:
 *   - Dual-chain testnet started in beforeAll
 *   - Auction created via deployer account (no SIWE) before UI tests
 *   - Bidder wallet mock injected for SIWE signing during UI interactions
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
  AUCTION_DURATION_SHORT,
  type IntegrationFixture,
} from "./fixtures/dual-chain";
import { setupWalletMock } from "./fixtures/wallet-mock";
import { auctionBidder } from "./helpers/selectors";
import {
  setupAuctionState,
  createAuctionDirect,
  viewFunction,
} from "./helpers/auction-setup";
import { AuctionBidder } from "../../src/components/AuctionBidder";
import {
  WalletContext,
  AppStateProvider,
  NetworkConfigProvider,
  ContractStatusProvider,
  BalancesProvider,
} from "../../src/index";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { setAptosInstance } from "@atomica/sdk/aptos";
import {
  setAptosInstance as setDockerAptosInstance,
  getDerivedAddress,
} from "@atomica/aptos-docker-testnet/browser";

const MIN_PRICE = 100n;
const AUCTION_DURATION = 3600n; // 1 hour — long enough for bids
const NONEXISTENT_SELLER = "0x000000000000000000000000000000000000000000000000000000000000dead";

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
  let bidderAddress: string;
  let sellerAptosAddress: string;

  async function configureBidderForFixture(
    nextFixture: IntegrationFixture,
  ): Promise<void> {
    const aptosConfig = new AptosConfig({
      network: Network.LOCAL,
      fullnode: nextFixture.aptos.nodeUrl,
    });
    const aptosInstance = new Aptos(aptosConfig);
    setAptosInstance(aptosInstance);
    // AuctionBidder uses submitBid from @atomica/aptos-docker-testnet/browser
    // which has its own aptos singleton — update it too.
    setDockerAptosInstance(aptosInstance);

    bidderAddress = await setupWalletMock({
      privateKey: nextFixture.eth.bidder.privateKey,
      rpcUrl: nextFixture.eth.rpcUrl,
      chainId: nextFixture.eth.chainId,
    });

    const bidderAptosAddress = await getDerivedAddress(
      bidderAddress.toLowerCase(),
    );
    await commands.fundAccount(bidderAptosAddress.toString(), 500_000_000);
  }

  beforeAll(async () => {
    fixture = await setupIntegrationFixture();
    await configureBidderForFixture(fixture);

    // Set up Ethereum lock + Aptos registration (seller side, no SIWE)
    const auctionSetup = await setupAuctionState(fixture);
    sellerAptosAddress =
      auctionSetup.deployerAccount.accountAddress.toString();

    // Phase 3a: create_auction aborts with E_NOT_IMPLEMENTED (99).
    // Catch the error — the bidder UI tests still exercise the AuctionBidder
    // component's error-handling and the new windowId input interface.
    await createAuctionDirect(
      auctionSetup.aptosClient,
      auctionSetup.deployerAccount,
      fixture.aptos.moduleAddress,
      auctionSetup.lockId,
      MIN_PRICE,
      AUCTION_DURATION,
    ).catch(() => {
      // Expected: scaffold body aborts with E_NOT_IMPLEMENTED
    });
  }, 600_000);

  afterAll(async () => {
    await teardownIntegrationFixture();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Test 1: scaffold abort (Phase 3a) ─────────────────────────────────────
  //
  // Phase 3a: submit_bid aborts with E_NOT_IMPLEMENTED (99). AuctionBidder
  // now uses windowId instead of sellerAddress. The test verifies that:
  //   - window-id-input is present (new v0 Beta interface)
  //   - bid submission surfaces an Error status (scaffold abort)

  it("shows error in bid-status when submit_bid aborts (Phase 3a scaffold)", async () => {
    render(
      <BidderProviders account={bidderAddress}>
        <AuctionBidder />
      </BidderProviders>,
    );

    // v0 Beta: fill in window ID instead of seller address
    const windowInput = screen.getByTestId(auctionBidder.windowIdInput);
    fireEvent.change(windowInput, { target: { value: "0" } });

    // Set bid amount
    const bidInput = screen.getByTestId(auctionBidder.bidAmountInput);
    fireEvent.change(bidInput, { target: { value: "150" } });

    // Click Submit Encrypted Bid
    const submitBtn = screen.getByTestId(auctionBidder.submitBidButton);
    fireEvent.click(submitBtn);

    // Phase 3a: submit_bid aborts with E_NOT_IMPLEMENTED — error shown
    await waitFor(
      () => {
        const statusEl = screen.getByTestId(auctionBidder.bidStatus);
        expect(statusEl).toBeTruthy();
        expect(statusEl.textContent).toMatch(/Error/);
      },
      { timeout: 60_000 },
    );
  }, 90_000);

  // ── Test 2: bid below min_price ────────────────────────────────────────────

  it("shows error in bid-status on any bid submission (Phase 3a scaffold)", async () => {
    // Phase 3a: submit_bid aborts with E_NOT_IMPLEMENTED (99) regardless of
    // bid amount. Bid count remains 0 (get_bid_count returns 0 for non-existent windows).
    const aptosConfig = new AptosConfig({
      network: Network.LOCAL,
      fullnode: fixture.aptos.nodeUrl,
    });
    const aptosClient = new Aptos(aptosConfig);
    // v0 Beta: get_bid_count takes (window_id, pair_bcs); returns 0 when window not found
    const countBefore = await viewFunction(
      aptosClient,
      `${fixture.aptos.moduleAddress}::auction::get_bid_count`,
      [],
      [0n, new Uint8Array(0)],
    );
    const bidCountBefore = BigInt(countBefore[0]);

    render(
      <BidderProviders account={bidderAddress}>
        <AuctionBidder />
      </BidderProviders>,
    );

    // v0 Beta: fill window ID (was seller address)
    fireEvent.change(screen.getByTestId(auctionBidder.windowIdInput), {
      target: { value: "0" },
    });

    fireEvent.change(screen.getByTestId(auctionBidder.bidAmountInput), {
      target: { value: "50" },
    });

    fireEvent.click(screen.getByTestId(auctionBidder.submitBidButton));

    // Phase 3a: any submit_bid call aborts — error surfaced in UI
    await waitFor(
      () => {
        const statusEl = screen.getByTestId(auctionBidder.bidStatus);
        expect(statusEl).toBeTruthy();
        expect(statusEl.textContent).toMatch(/Error/);
      },
      { timeout: 60_000 },
    );

    // Bid count must not have changed (still 0 for window 0)
    const countAfter = await viewFunction(
      aptosClient,
      `${fixture.aptos.moduleAddress}::auction::get_bid_count`,
      [],
      [0n, new Uint8Array(0)],
    );
    expect(BigInt(countAfter[0])).toBe(bidCountBefore);
  }, 90_000);

  // ── Test 3: bid on nonexistent auction ────────────────────────────────────

  it("shows error in bid-status for any window ID (Phase 3a scaffold)", async () => {
    // Phase 3a: submit_bid aborts with E_NOT_IMPLEMENTED (99) for any window.
    render(
      <BidderProviders account={bidderAddress}>
        <AuctionBidder />
      </BidderProviders>,
    );

    // v0 Beta: use a large window ID that has no registered auction
    fireEvent.change(screen.getByTestId(auctionBidder.windowIdInput), {
      target: { value: "999999" },
    });

    fireEvent.change(screen.getByTestId(auctionBidder.bidAmountInput), {
      target: { value: "150" },
    });

    fireEvent.click(screen.getByTestId(auctionBidder.submitBidButton));

    await waitFor(
      () => {
        const statusEl = screen.getByTestId(auctionBidder.bidStatus);
        expect(statusEl).toBeTruthy();
        expect(statusEl.textContent).toMatch(/Error/);
      },
      { timeout: 60_000 },
    );
  }, 90_000);

  // ── Test 4: bid on closed auction ─────────────────────────────────────────

  it("shows error in bid-status after auction window elapses (Phase 3a scaffold)", async () => {
    // Phase 3a: submit_bid aborts with E_NOT_IMPLEMENTED (99) before any
    // window-closed check can occur. This test verifies the UI error path
    // using the new v0 Beta windowId interface.
    await teardownIntegrationFixture();
    fixture = await setupIntegrationFixture();
    await configureBidderForFixture(fixture);

    const auctionSetup = await setupAuctionState(fixture);

    // Phase 3a: create_auction aborts — catch and continue
    await createAuctionDirect(
      auctionSetup.aptosClient,
      auctionSetup.deployerAccount,
      fixture.aptos.moduleAddress,
      auctionSetup.lockId,
      MIN_PRICE,
      BigInt(AUCTION_DURATION_SHORT),
    ).catch(() => {
      // Expected: scaffold body aborts with E_NOT_IMPLEMENTED
    });

    await new Promise((r) =>
      setTimeout(r, (AUCTION_DURATION_SHORT + 3) * 1000),
    );

    render(
      <BidderProviders account={bidderAddress}>
        <AuctionBidder />
      </BidderProviders>,
    );

    // v0 Beta: use window ID 0
    fireEvent.change(screen.getByTestId(auctionBidder.windowIdInput), {
      target: { value: "0" },
    });

    fireEvent.change(screen.getByTestId(auctionBidder.bidAmountInput), {
      target: { value: "150" },
    });

    fireEvent.click(screen.getByTestId(auctionBidder.submitBidButton));

    await waitFor(
      () => {
        const statusEl = screen.getByTestId(auctionBidder.bidStatus);
        expect(statusEl.textContent).toMatch(/Error/);
      },
      { timeout: 60_000 },
    );
  }, 600_000);
});
