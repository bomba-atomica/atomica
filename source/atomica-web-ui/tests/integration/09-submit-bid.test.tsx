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
  createAptosClient,
  viewFunction,
} from "./helpers/auction-setup";
import { AuctionBidder } from "../../src/components/AuctionBidder";
import {
  WalletContext,
  NetworkConfigProvider,
  ContractStatusProvider,
  BalancesProvider,
} from "../../src/index";
import { setAptosInstance } from "../../src/lib/aptos/config";
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
    <NetworkConfigProvider>
      <WalletContext.Provider value={{ account, connect: async () => {} }}>
        <ContractStatusProvider>
          <BalancesProvider>{children}</BalancesProvider>
        </ContractStatusProvider>
      </WalletContext.Provider>
    </NetworkConfigProvider>
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
    const aptosInstance = createAptosClient(nextFixture);
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
    // We need the seller's Aptos address (deployer) for auction lookups
    const auctionSetup = await setupAuctionState(fixture);
    sellerAptosAddress =
      auctionSetup.deployerAccount.accountAddress.toString();

    // Create the auction using the deployer's native account
    await createAuctionDirect(
      auctionSetup.aptosClient,
      auctionSetup.deployerAccount,
      fixture.aptos.moduleAddress,
      auctionSetup.lockId,
      MIN_PRICE,
      AUCTION_DURATION,
    );
  }, 600_000);

  afterAll(async () => {
    await teardownIntegrationFixture();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Test 1: happy path bid ─────────────────────────────────────────────────

  it("shows tx hash in bid-status after successful bid above min_price", async () => {
    render(
      <BidderProviders account={bidderAddress}>
        <AuctionBidder />
      </BidderProviders>,
    );

    // Fill in seller address
    const sellerInput = screen.getByTestId(auctionBidder.sellerAddressInput);
    fireEvent.change(sellerInput, { target: { value: sellerAptosAddress } });

    // Set bid amount above min_price (MIN_PRICE = 100, so use 150)
    const bidInput = screen.getByTestId(auctionBidder.bidAmountInput);
    fireEvent.change(bidInput, { target: { value: "150" } });

    // Click Submit Encrypted Bid
    const submitBtn = screen.getByTestId(auctionBidder.submitBidButton);
    fireEvent.click(submitBtn);

    // Wait for status to show a successful submission (Tx: ... hash)
    await waitFor(
      () => {
        const statusEl = screen.getByTestId(auctionBidder.bidStatus);
        expect(statusEl).toBeTruthy();
        expect(statusEl.textContent).toMatch(/Bid Submitted!/);
      },
      { timeout: 60_000 },
    );
  }, 90_000);

  // ── Test 2: bid below min_price ────────────────────────────────────────────

  it("shows error in bid-status and does not increment bid count on below-min bid", async () => {
    // Get current bid count before the test
    const aptosClient = createAptosClient(fixture);
    const countBefore = await viewFunction(
      aptosClient,
      `${fixture.aptos.moduleAddress}::auction::get_bid_count`,
      [],
      [sellerAptosAddress],
    );
    const bidCountBefore = BigInt(countBefore[0]);

    render(
      <BidderProviders account={bidderAddress}>
        <AuctionBidder />
      </BidderProviders>,
    );

    // Fill in seller address
    fireEvent.change(screen.getByTestId(auctionBidder.sellerAddressInput), {
      target: { value: sellerAptosAddress },
    });

    // Bid amount below min_price (MIN_PRICE = 100, so use 50)
    fireEvent.change(screen.getByTestId(auctionBidder.bidAmountInput), {
      target: { value: "50" },
    });

    fireEvent.click(screen.getByTestId(auctionBidder.submitBidButton));

    // Status should surface an Error
    await waitFor(
      () => {
        const statusEl = screen.getByTestId(auctionBidder.bidStatus);
        expect(statusEl).toBeTruthy();
        expect(statusEl.textContent).toMatch(/Error/);
      },
      { timeout: 60_000 },
    );

    // Bid count must not have changed
    const countAfter = await viewFunction(
      aptosClient,
      `${fixture.aptos.moduleAddress}::auction::get_bid_count`,
      [],
      [sellerAptosAddress],
    );
    expect(BigInt(countAfter[0])).toBe(bidCountBefore);
  }, 90_000);

  // ── Test 3: bid on nonexistent auction ────────────────────────────────────

  it("shows error in bid-status when auction does not exist", async () => {
    render(
      <BidderProviders account={bidderAddress}>
        <AuctionBidder />
      </BidderProviders>,
    );

    // Use an address that has no auction
    fireEvent.change(screen.getByTestId(auctionBidder.sellerAddressInput), {
      target: { value: NONEXISTENT_SELLER },
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

  it("shows error in bid-status when auction has already closed", async () => {
    // This case intentionally replaces the shared long-lived fixture with a
    // fresh short-duration auction so the UI hits the real closed-auction
    // path. In CI, booting a new dual-chain fixture plus waiting for expiry
    // can take longer than the default 4-minute browser-test budget.
    await teardownIntegrationFixture();
    fixture = await setupIntegrationFixture();
    await configureBidderForFixture(fixture);

    const auctionSetup = await setupAuctionState(fixture);
    const closedSellerAddress =
      auctionSetup.deployerAccount.accountAddress.toString();

    await createAuctionDirect(
      auctionSetup.aptosClient,
      auctionSetup.deployerAccount,
      fixture.aptos.moduleAddress,
      auctionSetup.lockId,
      MIN_PRICE,
      BigInt(AUCTION_DURATION_SHORT),
    );

    await new Promise((r) =>
      setTimeout(r, (AUCTION_DURATION_SHORT + 3) * 1000),
    );

    render(
      <BidderProviders account={bidderAddress}>
        <AuctionBidder />
      </BidderProviders>,
    );

    fireEvent.change(screen.getByTestId(auctionBidder.sellerAddressInput), {
      target: { value: closedSellerAddress },
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
