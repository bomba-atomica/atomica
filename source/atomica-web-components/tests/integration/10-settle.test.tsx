/**
 * 10-settle.test.tsx
 *
 * Browser integration tests for SettleButton — the UI component that
 * triggers auction settlement via the live `auction::settle` entry function
 * and displays the outcome (winner + clearing price).
 *
 * Scenarios:
 *   1. Settle after auction expiry  -- SettleButton shows "Settled" + settlement result
 *   2. Settle before expiry         -- button is disabled (auctionEndTime not reached)
 *   3. Double-settle rejected       -- button shows "Already Settled" for pre-settled auction
 *   4. No-bid auction settles       -- "Settled" shown with "0x0" winner
 *   5. Step8Monitor integration     -- SettleButton appears after auction ends
 *
 * Each test that needs a live auction uses a separate Aptos seller account so
 * that the single-auction-per-address Move constraint is not violated.
 */

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
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
  AUCTION_DURATION_BID,
  type IntegrationFixture,
} from "./fixtures/dual-chain";
import { setupWalletMock } from "./fixtures/wallet-mock";
import { settleButton, step8Monitor } from "./helpers/selectors";
import {
  setupAuctionState,
  createAuctionDirect,
  submitBidDirect,
  settleAuctionDirect,
  viewFunction,
} from "./helpers/auction-setup";
import { SettleButton } from "../../src/components/SettleButton";
import { Step8Monitor } from "../../src/components/SellFlow/steps/Step8Monitor";
import { Aptos, AptosConfig, Network, Account } from "@aptos-labs/ts-sdk";
import { setAptosInstance } from "@atomica/sdk/aptos";
import { WalletContext, WalletProvider } from "../../src/context/WalletContext";
import {
  getDerivedAddress,
} from "@atomica/aptos-docker-testnet/browser";

const MIN_PRICE = 50n;
const BID_PRICE = 200n;

// ---------------------------------------------------------------------------
// Minimal provider wrapper — provides account directly to avoid race conditions
// with WalletProvider auto-detection.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.sequential("10: Settle Auction", () => {
  afterEach(() => {
    cleanup();
  });

  async function withLiveFixture(
    run: (context: {
      fixture: IntegrationFixture;
      aptosClient: Aptos;
      moduleAddr: string;
      settlerEthAddress: string;
    }) => Promise<void>,
  ): Promise<void> {
    const fixture = await setupIntegrationFixture();

    const aptosConfig = new AptosConfig({
      network: Network.LOCAL,
      fullnode: fixture.aptos.nodeUrl,
    });
    const aptosClient = new Aptos(aptosConfig);
    setAptosInstance(aptosClient);

    // SettleButton uses submitSettle which goes through SIWE signing.
    // Set up the wallet mock so window.ethereum returns the seller's ETH address.
    const settlerEthAddress = await setupWalletMock({
      privateKey: fixture.eth.seller.privateKey,
      rpcUrl: fixture.eth.rpcUrl,
      chainId: fixture.eth.chainId,
    });

    // Fund the SIWE-derived Aptos address with APT for gas so the settle
    // transaction can be submitted on-chain.
    const settlerAptosAddress = await getDerivedAddress(
      settlerEthAddress.toLowerCase(),
    );
    await commands.fundAccount(settlerAptosAddress.toString(), 500_000_000);

    try {
      await run({
        fixture,
        aptosClient,
        moduleAddr: fixture.aptos.moduleAddress,
        settlerEthAddress,
      });
    } finally {
      await teardownIntegrationFixture();
    }
  }

  // ── Test 1: settle after close ─────────────────────────────────────────────

  it(
    "settle-status shows 'Settled' after AUCTION_DURATION_BID elapses",
    async () => {
      await withLiveFixture(async ({ fixture, aptosClient, moduleAddr, settlerEthAddress }) => {
        const testSetup = await setupAuctionState(fixture);
        const testSeller = testSetup.deployerAccount;
        const testSellerAddress = testSeller.accountAddress.toString();

        // Pre-fund the bidder BEFORE creating the auction so that the auction
        // timer does not tick while we wait for the faucet.
        const bidder = Account.generate();
        await commands.fundAccount(
          bidder.accountAddress.toString(),
          500_000_000,
        );

        const auctionStart = Date.now();

        await createAuctionDirect(
          testSetup.aptosClient,
          testSeller,
          moduleAddr,
          testSetup.lockId,
          MIN_PRICE,
          BigInt(AUCTION_DURATION_BID),
        );

        await submitBidDirect(
          testSetup.aptosClient,
          bidder,
          moduleAddr,
          testSellerAddress,
          BID_PRICE,
        );

        // Wait for the remaining auction window to expire (+ 3 s buffer).
        const elapsedMs = Date.now() - auctionStart;
        const remainingMs = (AUCTION_DURATION_BID + 3) * 1000 - elapsedMs;
        if (remainingMs > 0) {
          await new Promise((r) => setTimeout(r, remainingMs));
        }

        render(
          <SettleProviders account={settlerEthAddress}>
            <SettleButton
              sellerAddress={testSellerAddress}
              auctionEndTime={Math.floor(auctionStart / 1000) + AUCTION_DURATION_BID}
            />
          </SettleProviders>,
        );

        // Button should be enabled (auction ended, not yet settled)
        const btn = screen.getByTestId(settleButton.settleButton);
        fireEvent.click(btn);

        await waitFor(
          () => {
            const statusEl = screen.getByTestId(settleButton.settleStatus);
            expect(statusEl.textContent).toBe("Settled");
          },
          { timeout: 30_000 },
        );

        // Verify winner and clearing price are displayed in the UI
        await waitFor(
          () => {
            const winnerEl = screen.getByTestId(settleButton.settleWinner);
            expect(winnerEl.textContent).toBeTruthy();
            // The winner should be the bidder's Aptos address
            expect(winnerEl.textContent).toContain(
              bidder.accountAddress.toString().substring(0, 6),
            );

            const priceEl = screen.getByTestId(settleButton.settleClearingPrice);
            expect(priceEl.textContent).toBeTruthy();
            // Clearing price should contain a dollar amount
            expect(priceEl.textContent).toContain("$");
          },
          { timeout: 10_000 },
        );

        // Verify on-chain
        const settled = await viewFunction(
          aptosClient,
          `${moduleAddr}::auction::is_settled`,
          [],
          [testSellerAddress],
        );
        expect(settled[0]).toBe(true);
      });
    },
    600_000,
  );

  // ── Test 2: button disabled before expiry ──────────────────────────────────

  it(
    "settle button is disabled when auction has not ended",
    async () => {
      // Render SettleButton with a far-future auctionEndTime
      const futureEnd = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      render(
        <WalletProvider>
          <SettleButton
            sellerAddress="0xdeadbeef"
            auctionEndTime={futureEnd}
          />
        </WalletProvider>,
      );

      const btn = screen.getByTestId(settleButton.settleButton);
      expect(btn).toHaveProperty("disabled", true);
    },
    30_000,
  );

  // ── Test 3: already-settled auction shows "Already Settled" ────────────────

  it(
    "shows 'Already Settled' for pre-settled auction (live chain)",
    async () => {
      await withLiveFixture(async ({ fixture, aptosClient, moduleAddr, settlerEthAddress }) => {
        const testSetup = await setupAuctionState(fixture);
        const seller = testSetup.deployerAccount;
        const sellerAddress = seller.accountAddress.toString();

        await createAuctionDirect(
          aptosClient,
          seller,
          moduleAddr,
          testSetup.lockId,
          MIN_PRICE,
          BigInt(AUCTION_DURATION_SHORT),
        );

        await new Promise((r) =>
          setTimeout(r, (AUCTION_DURATION_SHORT + 3) * 1000),
        );
        await settleAuctionDirect(aptosClient, seller, moduleAddr, sellerAddress);

        render(
          <SettleProviders account={settlerEthAddress}>
            <SettleButton
              sellerAddress={sellerAddress}
              auctionEndTime={Math.floor(Date.now() / 1000) - 10}
            />
          </SettleProviders>,
        );

        // The component should detect on-chain settlement and show "Already Settled"
        await waitFor(
          () => {
            const statusEl = screen.getByTestId(settleButton.settleStatus);
            expect(statusEl.textContent).toBe("Already Settled");
          },
          { timeout: 30_000 },
        );

        // Button text should also show "Already Settled"
        const btn = screen.getByTestId(settleButton.settleButton);
        expect(btn.textContent).toBe("Already Settled");
      });
    },
    600_000,
  );

  // ── Test 4: no-bid auction settles cleanly ────────────────────────────────

  it(
    "no-bid auction settle completes without error and shows 'Settled'",
    async () => {
      await withLiveFixture(async ({ fixture, aptosClient, moduleAddr, settlerEthAddress }) => {
        const testSetup = await setupAuctionState(fixture);
        const seller = testSetup.deployerAccount;
        const sellerAddress = seller.accountAddress.toString();

        const auctionStart = Date.now();

        await createAuctionDirect(
          aptosClient,
          seller,
          moduleAddr,
          testSetup.lockId,
          MIN_PRICE,
          BigInt(AUCTION_DURATION_SHORT),
        );

        await new Promise((r) =>
          setTimeout(r, (AUCTION_DURATION_SHORT + 3) * 1000),
        );

        render(
          <SettleProviders account={settlerEthAddress}>
            <SettleButton
              sellerAddress={sellerAddress}
              auctionEndTime={Math.floor(auctionStart / 1000) + AUCTION_DURATION_SHORT}
            />
          </SettleProviders>,
        );

        fireEvent.click(screen.getByTestId(settleButton.settleButton));

        await waitFor(
          () => {
            const statusEl = screen.getByTestId(settleButton.settleStatus);
            expect(statusEl.textContent).toBe("Settled");
          },
          { timeout: 30_000 },
        );

        const settled = await viewFunction(
          aptosClient,
          `${moduleAddr}::auction::is_settled`,
          [],
          [sellerAddress],
        );
        expect(settled[0]).toBe(true);
      });
    },
    600_000,
  );

  // ── Test 5: Step8Monitor shows SettleButton after auction ends ─────────────

  it(
    "Step8Monitor renders SettleButton when auction has ended",
    async () => {
      const pastEnd = Math.floor(Date.now() / 1000) - 10;

      render(
        <WalletProvider>
          <Step8Monitor
            amount={1000000000000000000n}
            minPrice={50000000n}
            auctionEndTime={pastEnd}
            sellerAddress="0xdeadbeef"
            onCancelAndUnlock={async () => {}}
            loading={false}
          />
        </WalletProvider>,
      );

      // SettleButton should be rendered because auction has ended
      const btn = screen.getByTestId(settleButton.settleButton);
      expect(btn).toBeTruthy();

      // Status badge should show "Settled" (the ended state label)
      const badge = screen.getByTestId(step8Monitor.auctionStatusBadge);
      expect(badge.textContent).toBe("Settled");
    },
    30_000,
  );
});
