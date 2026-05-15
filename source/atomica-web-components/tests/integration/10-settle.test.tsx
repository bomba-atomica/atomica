/**
 * 10-settle.test.tsx
 *
 * Browser integration tests for SettleButton — the UI component that
 * triggers auction settlement via the live `auction::settle` entry function
 * and displays the outcome (winner + clearing price).
 *
 * Phase 3a: all Move entry functions abort with E_NOT_IMPLEMENTED (99).
 * Tests are updated to use the v0 Beta SettleButton interface (windowId + pairBcs)
 * and expect scaffold abort errors instead of successful settlement results.
 *
 * Scenarios:
 *   1. Settle after auction expiry  -- shows error (Phase 3a scaffold abort)
 *   2. Settle before expiry         -- button is disabled (auctionEndTime not reached)
 *   3. Double-settle rejected       -- scaffold aborts; no "Already Settled" yet
 *   4. No-bid auction settles       -- scaffold aborts with E_NOT_IMPLEMENTED
 *   5. Step8Monitor integration     -- SettleButton renders when windowId + pairBcs passed
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
import { AppStateProvider } from "../../src/state/app-state";
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
    "settle-status shows error after AUCTION_DURATION_BID elapses (Phase 3a scaffold)",
    async () => {
      // Phase 3a: settle aborts with E_NOT_IMPLEMENTED (99). SettleButton uses
      // new v0 Beta interface (windowId + pairBcs). The UI should surface the
      // scaffold error in the settle-status element.
      await withLiveFixture(async ({ fixture, aptosClient: _aptosClient, moduleAddr, settlerEthAddress }) => {
        const testSetup = await setupAuctionState(fixture);
        const testSeller = testSetup.deployerAccount;

        const auctionStart = Date.now();

        // Phase 3a: create_auction aborts — catch and continue
        await createAuctionDirect(
          testSetup.aptosClient,
          testSeller,
          moduleAddr,
          testSetup.lockId,
          MIN_PRICE,
          BigInt(AUCTION_DURATION_BID),
        ).catch(() => {
          // Expected: scaffold body aborts with E_NOT_IMPLEMENTED
        });

        // Phase 3a: submit_bid aborts — catch and continue
        const bidder = Account.generate();
        await commands.fundAccount(bidder.accountAddress.toString(), 500_000_000);
        await submitBidDirect(
          testSetup.aptosClient,
          bidder,
          moduleAddr,
          testSeller.accountAddress.toString(),
          BID_PRICE,
        ).catch(() => {
          // Expected: scaffold body aborts with E_NOT_IMPLEMENTED
        });

        // Wait for the auction window to expire
        const elapsedMs = Date.now() - auctionStart;
        const remainingMs = (AUCTION_DURATION_BID + 3) * 1000 - elapsedMs;
        if (remainingMs > 0) {
          await new Promise((r) => setTimeout(r, remainingMs));
        }

        render(
          <SettleProviders account={settlerEthAddress}>
            <SettleButton
              windowId={0n}
              pairBcs={new Uint8Array(0)}
              auctionEndTime={Math.floor(auctionStart / 1000) + AUCTION_DURATION_BID}
            />
          </SettleProviders>,
        );

        // Button should be enabled (auction ended, not yet settled)
        const btn = screen.getByTestId(settleButton.settleButton);
        expect((btn as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(btn);

        // Phase 3a: settle aborts with E_NOT_IMPLEMENTED — error in status
        await waitFor(
          () => {
            const statusEl = screen.getByTestId(settleButton.settleStatus);
            expect(statusEl.textContent).toMatch(/Error/);
          },
          { timeout: 30_000 },
        );
      });
    },
    600_000,
  );

  // ── Test 2: button disabled before expiry ──────────────────────────────────

  it(
    "settle button is disabled when auction has not ended",
    async () => {
      // Render SettleButton with a far-future auctionEndTime
      // v0 Beta interface: windowId + pairBcs instead of sellerAddress
      const futureEnd = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      render(
        <AppStateProvider>
          <WalletProvider>
            <SettleButton
              windowId={0n}
              pairBcs={new Uint8Array(0)}
              auctionEndTime={futureEnd}
            />
          </WalletProvider>
        </AppStateProvider>,
      );

      const btn = screen.getByTestId(settleButton.settleButton);
      expect(btn).toHaveProperty("disabled", true);
    },
    30_000,
  );

  // ── Test 3: settle errors surfaced in UI (Phase 3a scaffold) ─────────────
  //
  // Phase 3a: settleAuctionDirect aborts with E_NOT_IMPLEMENTED. The SettleButton
  // should surface the error. This test verifies the error-display path
  // with the new v0 Beta windowId + pairBcs interface.

  it(
    "shows error in settle-status when settle aborts (Phase 3a scaffold)",
    async () => {
      await withLiveFixture(async ({ fixture, aptosClient: _aptosClient, moduleAddr, settlerEthAddress }) => {
        const testSetup = await setupAuctionState(fixture);
        const seller = testSetup.deployerAccount;

        // Phase 3a: create_auction and settle both abort — catch and continue
        await createAuctionDirect(
          testSetup.aptosClient,
          seller,
          moduleAddr,
          testSetup.lockId,
          MIN_PRICE,
          BigInt(AUCTION_DURATION_SHORT),
        ).catch(() => {
          // Expected: scaffold body aborts with E_NOT_IMPLEMENTED
        });

        await new Promise((r) =>
          setTimeout(r, (AUCTION_DURATION_SHORT + 3) * 1000),
        );

        await settleAuctionDirect(
          testSetup.aptosClient,
          seller,
          moduleAddr,
          seller.accountAddress.toString(),
        ).catch(() => {
          // Expected: scaffold body aborts with E_NOT_IMPLEMENTED
        });

        render(
          <SettleProviders account={settlerEthAddress}>
            <SettleButton
              windowId={0n}
              pairBcs={new Uint8Array(0)}
              auctionEndTime={Math.floor(Date.now() / 1000) - 10}
            />
          </SettleProviders>,
        );

        // Click settle — scaffold aborts, error shown
        const btn = screen.getByTestId(settleButton.settleButton);
        fireEvent.click(btn);

        await waitFor(
          () => {
            const statusEl = screen.getByTestId(settleButton.settleStatus);
            expect(statusEl.textContent).toMatch(/Error/);
          },
          { timeout: 30_000 },
        );
      });
    },
    600_000,
  );

  // ── Test 4: settle button enabled and errors surfaced (Phase 3a) ──────────
  //
  // Phase 3a: settle aborts with E_NOT_IMPLEMENTED (99). This test verifies
  // that the SettleButton is enabled after expiry and the error is displayed
  // with the new v0 Beta windowId + pairBcs interface.

  it(
    "settle button enabled after expiry and shows error on click (Phase 3a scaffold)",
    async () => {
      await withLiveFixture(async ({ fixture, aptosClient: _aptosClient, moduleAddr, settlerEthAddress }) => {
        const testSetup = await setupAuctionState(fixture);
        const seller = testSetup.deployerAccount;

        const auctionStart = Date.now();

        // Phase 3a: create_auction aborts — catch and continue
        await createAuctionDirect(
          testSetup.aptosClient,
          seller,
          moduleAddr,
          testSetup.lockId,
          MIN_PRICE,
          BigInt(AUCTION_DURATION_SHORT),
        ).catch(() => {
          // Expected: scaffold body aborts with E_NOT_IMPLEMENTED
        });

        await new Promise((r) =>
          setTimeout(r, (AUCTION_DURATION_SHORT + 3) * 1000),
        );

        render(
          <SettleProviders account={settlerEthAddress}>
            <SettleButton
              windowId={0n}
              pairBcs={new Uint8Array(0)}
              auctionEndTime={Math.floor(auctionStart / 1000) + AUCTION_DURATION_SHORT}
            />
          </SettleProviders>,
        );

        // Button enabled (auction ended)
        const btn = screen.getByTestId(settleButton.settleButton);
        expect((btn as HTMLButtonElement).disabled).toBe(false);
        fireEvent.click(btn);

        // Phase 3a: settle aborts — error shown
        await waitFor(
          () => {
            const statusEl = screen.getByTestId(settleButton.settleStatus);
            expect(statusEl.textContent).toMatch(/Error/);
          },
          { timeout: 30_000 },
        );
      });
    },
    600_000,
  );

  // ── Test 5: Step8Monitor shows SettleButton after auction ends ─────────────
  //
  // v0 Beta: Step8Monitor renders SettleButton only when windowId + pairBcs
  // are provided. Pass both to ensure the button renders after expiry.

  it(
    "Step8Monitor renders SettleButton when auction has ended (v0 Beta windowId + pairBcs)",
    async () => {
      const pastEnd = Math.floor(Date.now() / 1000) - 10;

      render(
        <AppStateProvider>
          <WalletProvider>
            <Step8Monitor
              amount={1000000000000000000n}
              minPrice={50000000n}
              auctionEndTime={pastEnd}
              windowId={0n}
              pairBcs={new Uint8Array(0)}
              sellerAddress="0xdeadbeef"
              onCancelAndUnlock={async () => {}}
              loading={false}
            />
          </WalletProvider>
        </AppStateProvider>,
      );

      // SettleButton should be rendered because auction has ended and
      // windowId + pairBcs are provided
      const btn = screen.getByTestId(settleButton.settleButton);
      expect(btn).toBeTruthy();

      // Status badge should show "Settled" (the ended state label)
      const badge = screen.getByTestId(step8Monitor.auctionStatusBadge);
      expect(badge.textContent).toBe("Settled");
    },
    30_000,
  );
});
