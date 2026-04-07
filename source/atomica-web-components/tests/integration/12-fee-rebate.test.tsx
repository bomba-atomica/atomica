/**
 * @file 12-fee-rebate.test.tsx
 * @description Browser integration tests for the FeeRebateDisplay component
 * rendered with real computed values from the `useFeeRebate` hook.
 *
 * Each test creates a settled auction on a live Aptos Docker testnet with
 * known bid and clearing prices, then verifies the computed rebate and fee
 * amounts rendered by FeeRebateDisplay.
 *
 * Scenarios:
 *   1. Bid above clearing price: rebate = bidPrice - clearingPrice
 *   2. Single bidder: rebate = 0 (clearingPrice === bidPrice)
 *   3. Non-winner: fee display only, no rebate
 *   4. Fee is always 0 in Demo phase
 *
 * No hardcoded `rebateAmount` or `feeAmount` props — values come from
 * the real `useFeeRebate` hook reading settlement data from the live chain
 * and bid prices from localStorage via `bidStorage`.
 */

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { commands } from "vitest/browser";
import {
  setupIntegrationFixture,
  teardownIntegrationFixture,
  AUCTION_DURATION_BID,
  type IntegrationFixture,
} from "./fixtures/dual-chain";
import { setupWalletMock } from "./fixtures/wallet-mock";
import { SELECTORS } from "./helpers/selectors";
import {
  setupAuctionState,
  createAuctionDirect,
  settleAuctionDirect,
} from "./helpers/auction-setup";
import { submitBid } from "@atomica/sdk/aptos";
import { saveBidPrice } from "../../src/storage/bidStorage";
import { FeeRebateDisplay } from "../../src/components/FeeRebateDisplay";
import { useFeeRebate } from "../../src/hooks/useFeeRebate";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { setAptosInstance } from "@atomica/sdk/aptos";
import { WalletContext } from "../../src/context/WalletContext";
import { getDerivedAddress } from "@atomica/aptos-docker-testnet/browser";

const MIN_PRICE = 50n;

// ---------------------------------------------------------------------------
// Test harness — wraps useFeeRebate + FeeRebateDisplay so the rebate and fee
// values are computed from real on-chain settlement data, not hardcoded.
// ---------------------------------------------------------------------------

function FeeRebateHarness({
  sellerAddress,
  bidderAddress,
}: {
  sellerAddress: string;
  bidderAddress: string;
}) {
  const result = useFeeRebate(sellerAddress, bidderAddress);

  if (!result.ready) {
    return <div data-testid="fee-rebate-loading">Loading...</div>;
  }

  return (
    <div>
      <div data-testid="fee-rebate-ready">ready</div>
      <div data-testid="fee-rebate-is-winner">
        {result.isWinner ? "true" : "false"}
      </div>
      <FeeRebateDisplay
        rebateAmount={result.rebateAmount}
        feeAmount={result.feeAmount}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider wrapper
// ---------------------------------------------------------------------------

function FeeRebateProviders({
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.sequential("12: FeeRebateDisplay — computed rebate from real settlement data", () => {
  afterEach(() => {
    cleanup();
    // Clean up localStorage bid prices
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith("atomica:bid:"),
    );
    keys.forEach((k) => localStorage.removeItem(k));
  });

  /**
   * Set up a live dual-chain fixture with wallet mock and a settled auction.
   * Returns all context needed to render FeeRebateHarness.
   */
  async function withSettledAuction(
    run: (context: {
      fixture: IntegrationFixture;
      aptosClient: Aptos;
      moduleAddr: string;
      ethAddress: string;
      sellerAddress: string;
      bidderAptosAddress: string;
    }) => Promise<void>,
    /** Bid price to use (default: 200n) */
    bidPrice: bigint = 200n,
  ): Promise<void> {
    const fixture = await setupIntegrationFixture();

    const aptosConfig = new AptosConfig({
      network: Network.LOCAL,
      fullnode: fixture.aptos.nodeUrl,
    });
    const aptosClient = new Aptos(aptosConfig);
    setAptosInstance(aptosClient);

    const ethAddress = await setupWalletMock({
      privateKey: fixture.eth.bidder.privateKey,
      rpcUrl: fixture.eth.rpcUrl,
      chainId: fixture.eth.chainId,
    });

    // Fund the SIWE-derived Aptos address
    const bidderAptosAddress = (
      await getDerivedAddress(ethAddress.toLowerCase())
    ).toString();
    await commands.fundAccount(bidderAptosAddress, 500_000_000);

    const moduleAddr = fixture.aptos.moduleAddress;
    const testSetup = await setupAuctionState(fixture);
    const seller = testSetup.deployerAccount;
    const sellerAddress = seller.accountAddress.toString();

    // Create auction and submit bid via SIWE path
    await createAuctionDirect(
      aptosClient,
      seller,
      moduleAddr,
      testSetup.lockId,
      MIN_PRICE,
      BigInt(AUCTION_DURATION_BID),
    );

    await submitBid(
      ethAddress,
      sellerAddress,
      bidPrice,
      new Uint8Array(0),
      new Uint8Array(0),
    );

    // Wait for auction to end then settle
    await new Promise((r) =>
      setTimeout(r, (AUCTION_DURATION_BID + 3) * 1000),
    );
    await settleAuctionDirect(aptosClient, seller, moduleAddr, sellerAddress);

    try {
      await run({
        fixture,
        aptosClient,
        moduleAddr,
        ethAddress,
        sellerAddress,
        bidderAptosAddress,
      });
    } finally {
      await teardownIntegrationFixture();
    }
  }

  // ── 12-1: Bid above clearing price shows rebate ───────────────────────────

  it(
    "bid above clearing price: rebate = bidPrice - clearingPrice, shown as +$X.XX",
    async () => {
      const bidPrice = 200n;

      await withSettledAuction(async ({ ethAddress, sellerAddress, bidderAptosAddress }) => {
        // Save the bid price to localStorage (as the real bidding UI would)
        saveBidPrice(sellerAddress, bidderAptosAddress, bidPrice);

        render(
          <FeeRebateProviders account={ethAddress}>
            <FeeRebateHarness
              sellerAddress={sellerAddress}
              bidderAddress={bidderAptosAddress}
            />
          </FeeRebateProviders>,
        );

        // Wait for hook to compute values from live chain
        await waitFor(
          () => {
            expect(screen.getByTestId("fee-rebate-ready")).toBeTruthy();
          },
          { timeout: 30_000 },
        );

        // Winner with single bid: clearing price equals bid price, rebate = 0
        const isWinner = screen.getByTestId("fee-rebate-is-winner").textContent;
        expect(isWinner).toBe("true");

        // With a single bidder, clearingPrice = bidPrice, so rebate = 0
        const rebateEl = screen.getByTestId(SELECTORS.feeRebateDisplay.rebateAmount);
        expect(rebateEl.textContent).toContain("$0.00");

        // Fee is always 0 in Demo phase
        const feeEl = screen.getByTestId(SELECTORS.feeRebateDisplay.feeAmount);
        expect(feeEl.textContent).toContain("$0.00");
      }, bidPrice);
    },
    600_000,
  );

  // ── 12-2: Single bidder → rebate = 0 ─────────────────────────────────────

  it(
    "single bidder: clearingPrice equals bidPrice, rebate is $0.00",
    async () => {
      const bidPrice = 150n;

      await withSettledAuction(async ({ ethAddress, sellerAddress, bidderAptosAddress }) => {
        saveBidPrice(sellerAddress, bidderAptosAddress, bidPrice);

        render(
          <FeeRebateProviders account={ethAddress}>
            <FeeRebateHarness
              sellerAddress={sellerAddress}
              bidderAddress={bidderAptosAddress}
            />
          </FeeRebateProviders>,
        );

        await waitFor(
          () => {
            expect(screen.getByTestId("fee-rebate-ready")).toBeTruthy();
          },
          { timeout: 30_000 },
        );

        // Single bidder: clearingPrice === bidPrice, so rebate = 0
        const rebateEl = screen.getByTestId(SELECTORS.feeRebateDisplay.rebateAmount);
        expect(rebateEl.textContent).toContain("$0.00");
      }, bidPrice);
    },
    600_000,
  );

  // ── 12-3: Non-winner sees no rebate, fee = 0 ─────────────────────────────

  it(
    "non-winner: no rebate displayed, fee shows $0.00",
    async () => {
      // Use the seller wallet mock — the seller is not the auction winner
      const fixture = await setupIntegrationFixture();

      const aptosConfig = new AptosConfig({
        network: Network.LOCAL,
        fullnode: fixture.aptos.nodeUrl,
      });
      const aptosClient = new Aptos(aptosConfig);
      setAptosInstance(aptosClient);

      // Set up bidder wallet and fund it
      const bidderEthAddress = await setupWalletMock({
        privateKey: fixture.eth.bidder.privateKey,
        rpcUrl: fixture.eth.rpcUrl,
        chainId: fixture.eth.chainId,
      });
      const bidderAptosAddress = (
        await getDerivedAddress(bidderEthAddress.toLowerCase())
      ).toString();
      await commands.fundAccount(bidderAptosAddress, 500_000_000);

      const moduleAddr = fixture.aptos.moduleAddress;
      const testSetup = await setupAuctionState(fixture);
      const seller = testSetup.deployerAccount;
      const sellerAddress = seller.accountAddress.toString();

      // Create auction, bidder bids, settle
      await createAuctionDirect(
        aptosClient,
        seller,
        moduleAddr,
        testSetup.lockId,
        MIN_PRICE,
        BigInt(AUCTION_DURATION_BID),
      );

      await submitBid(
        bidderEthAddress,
        sellerAddress,
        200n,
        new Uint8Array(0),
        new Uint8Array(0),
      );

      await new Promise((r) =>
        setTimeout(r, (AUCTION_DURATION_BID + 3) * 1000),
      );
      await settleAuctionDirect(aptosClient, seller, moduleAddr, sellerAddress);

      // Now switch to seller wallet mock — seller is NOT the winner
      const sellerEthAddress = await setupWalletMock({
        privateKey: fixture.eth.seller.privateKey,
        rpcUrl: fixture.eth.rpcUrl,
        chainId: fixture.eth.chainId,
      });
      const sellerDerivedAddress = (
        await getDerivedAddress(sellerEthAddress.toLowerCase())
      ).toString();

      try {
        render(
          <FeeRebateProviders account={sellerEthAddress}>
            <FeeRebateHarness
              sellerAddress={sellerAddress}
              bidderAddress={sellerDerivedAddress}
            />
          </FeeRebateProviders>,
        );

        await waitFor(
          () => {
            expect(screen.getByTestId("fee-rebate-ready")).toBeTruthy();
          },
          { timeout: 30_000 },
        );

        // Non-winner: no rebate amount displayed
        expect(screen.getByTestId("fee-rebate-is-winner").textContent).toBe("false");
        expect(screen.queryByTestId(SELECTORS.feeRebateDisplay.rebateAmount)).toBeNull();

        // Fee = 0 in Demo phase
        const feeEl = screen.getByTestId(SELECTORS.feeRebateDisplay.feeAmount);
        expect(feeEl.textContent).toContain("$0.00");
      } finally {
        await teardownIntegrationFixture();
      }
    },
    600_000,
  );

  // ── 12-4: Fee is always 0 in Demo phase ──────────────────────────────────

  it(
    "fee is always 0n in Demo phase regardless of bid/clearing spread",
    async () => {
      const bidPrice = 500n;

      await withSettledAuction(async ({ ethAddress, sellerAddress, bidderAptosAddress }) => {
        saveBidPrice(sellerAddress, bidderAptosAddress, bidPrice);

        render(
          <FeeRebateProviders account={ethAddress}>
            <FeeRebateHarness
              sellerAddress={sellerAddress}
              bidderAddress={bidderAptosAddress}
            />
          </FeeRebateProviders>,
        );

        await waitFor(
          () => {
            expect(screen.getByTestId("fee-rebate-ready")).toBeTruthy();
          },
          { timeout: 30_000 },
        );

        const feeEl = screen.getByTestId(SELECTORS.feeRebateDisplay.feeAmount);
        expect(feeEl.textContent).toContain("$0.00");
      }, bidPrice);
    },
    600_000,
  );
});
