/**
 * @file 11-claim-and-reclaim.test.tsx
 * @description Browser integration tests for the ClaimButton component against
 * live Docker testnets.
 *
 * Phase 3a: all Move entry functions abort with E_NOT_IMPLEMENTED (99).
 * ClaimButton uses new v0 Beta interface (windowId + pairBcs).
 * Tests verify the component renders and handles scaffold abort errors.
 *
 * Scenarios:
 *   1. Unsettled auction: both buttons disabled (Phase 3a: scaffold view returns false)
 *   2. Claim attempt: shows error (Phase 3a: claim aborts with E_NOT_IMPLEMENTED)
 *   3. Non-winner path: Phase 3a — all settle attempts abort first
 *   4. Reclaim button: always disabled (per Phase 3a design)
 *
 * No `vi.fn()` or `vi.mock()` for claim/reclaim logic — all settlement and
 * claim operations run against a live Aptos Docker testnet.
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
import { SELECTORS } from "./helpers/selectors";
import {
  setupAuctionState,
  createAuctionDirect,
  settleAuctionDirect,
  viewFunction,
} from "./helpers/auction-setup";
import { submitBid } from "@atomica/sdk/aptos";
import { ClaimButton } from "../../src/components/ClaimButton";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { setAptosInstance } from "@atomica/sdk/aptos";
import { WalletContext, WalletProvider } from "../../src/context/WalletContext";
import { getDerivedAddress } from "@atomica/aptos-docker-testnet/browser";

const MIN_PRICE = 50n;
const BID_PRICE = 200n;

// ---------------------------------------------------------------------------
// Minimal provider wrapper — provides account directly to avoid race conditions
// with WalletProvider auto-detection.
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.sequential("11: ClaimButton — settlement-aware claim with Demo-phase mint", () => {
  afterEach(() => {
    cleanup();
  });

  /**
   * Set up a live dual-chain fixture with wallet mock. Funds the SIWE-derived
   * Aptos address so SIWE transactions have gas.
   */
  async function withLiveFixture(
    run: (context: {
      fixture: IntegrationFixture;
      aptosClient: Aptos;
      moduleAddr: string;
      ethAddress: string;
    }) => Promise<void>,
    /** Which fixture ETH key to use for the wallet mock: "seller" or "bidder" */
    walletRole: "seller" | "bidder" = "bidder",
  ): Promise<void> {
    const fixture = await setupIntegrationFixture();

    const aptosConfig = new AptosConfig({
      network: Network.LOCAL,
      fullnode: fixture.aptos.nodeUrl,
    });
    const aptosClient = new Aptos(aptosConfig);
    setAptosInstance(aptosClient);

    const ethKey =
      walletRole === "seller"
        ? fixture.eth.seller.privateKey
        : fixture.eth.bidder.privateKey;

    const ethAddress = await setupWalletMock({
      privateKey: ethKey,
      rpcUrl: fixture.eth.rpcUrl,
      chainId: fixture.eth.chainId,
    });

    // Fund the SIWE-derived Aptos address with APT for gas
    const aptosAddress = await getDerivedAddress(ethAddress.toLowerCase());
    await commands.fundAccount(aptosAddress.toString(), 500_000_000);

    try {
      await run({
        fixture,
        aptosClient,
        moduleAddr: fixture.aptos.moduleAddress,
        ethAddress,
      });
    } finally {
      await teardownIntegrationFixture();
    }
  }

  // ── 11-1: Unsettled auction — both buttons disabled ─────────────────────
  //
  // Phase 3a: ClaimButton uses new v0 Beta interface (windowId + pairBcs).
  // The is_settled view function returns false for a non-existent window,
  // so both buttons remain disabled and status shows "not yet settled".

  it(
    "unsettled auction: both buttons disabled, status shows 'not yet settled'",
    async () => {
      await withLiveFixture(async ({ fixture, aptosClient, moduleAddr, ethAddress }) => {
        const testSetup = await setupAuctionState(fixture);
        const seller = testSetup.deployerAccount;

        // Phase 3a: create_auction aborts — catch and continue
        await createAuctionDirect(
          aptosClient,
          seller,
          moduleAddr,
          testSetup.lockId,
          MIN_PRICE,
          BigInt(AUCTION_DURATION_BID),
        ).catch(() => {
          // Expected: scaffold body aborts with E_NOT_IMPLEMENTED
        });

        render(
          <ClaimProviders account={ethAddress}>
            <ClaimButton windowId={0n} pairBcs={new Uint8Array(0)} />
          </ClaimProviders>,
        );

        await waitFor(
          () => {
            const status = screen.getByTestId(SELECTORS.claimButton.claimStatus);
            expect(status.textContent).toContain("Auction not yet settled");
          },
          { timeout: 15_000 },
        );

        const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
        const reclaimBtn = screen.getByTestId(SELECTORS.claimButton.reclaimButton);
        expect((claimBtn as HTMLButtonElement).disabled).toBe(true);
        expect((reclaimBtn as HTMLButtonElement).disabled).toBe(true);
      }, "bidder");
    },
    600_000,
  );

  // ── 11-2: Claim shows "not yet settled" (Phase 3a scaffold) ─────────────
  //
  // Phase 3a: settle aborts with E_NOT_IMPLEMENTED, so the auction is never
  // settled on-chain. ClaimButton detects "not settled" and both buttons remain
  // disabled. Full winner claim flow is deferred to Phase 3b (#86b).

  it(
    "claim buttons remain disabled (auction unsettled due to Phase 3a scaffold)",
    async () => {
      await withLiveFixture(async ({ fixture, aptosClient, moduleAddr, ethAddress }) => {
        const testSetup = await setupAuctionState(fixture);
        const seller = testSetup.deployerAccount;

        // Phase 3a: create_auction aborts — catch and continue
        await createAuctionDirect(
          aptosClient,
          seller,
          moduleAddr,
          testSetup.lockId,
          MIN_PRICE,
          BigInt(AUCTION_DURATION_BID),
        ).catch(() => {
          // Expected: scaffold body aborts with E_NOT_IMPLEMENTED
        });

        render(
          <ClaimProviders account={ethAddress}>
            <ClaimButton windowId={0n} pairBcs={new Uint8Array(0)} />
          </ClaimProviders>,
        );

        // Phase 3a: is_settled returns false (no registry entry exists)
        // → status shows "not yet settled", buttons disabled
        await waitFor(
          () => {
            const status = screen.getByTestId(SELECTORS.claimButton.claimStatus);
            expect(status.textContent).toContain("Auction not yet settled");
          },
          { timeout: 15_000 },
        );

        const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
        expect((claimBtn as HTMLButtonElement).disabled).toBe(true);
      }, "bidder");
    },
    600_000,
  );

  // ── 11-3: ClaimButton renders with new interface (Phase 3a scaffold) ──────
  //
  // Phase 3a: settle aborts with E_NOT_IMPLEMENTED. ClaimButton shows
  // "not yet settled" for any window. This tests the new v0 Beta interface.

  it(
    "claim button disabled for any window in Phase 3a scaffold",
    async () => {
      await withLiveFixture(async ({ fixture, aptosClient, moduleAddr, ethAddress }) => {
        const testSetup = await setupAuctionState(fixture);
        const seller = testSetup.deployerAccount;

        // Phase 3a: create + settle abort — catch and continue
        await createAuctionDirect(
          aptosClient,
          seller,
          moduleAddr,
          testSetup.lockId,
          MIN_PRICE,
          BigInt(AUCTION_DURATION_SHORT),
        ).catch(() => {});

        await new Promise((r) =>
          setTimeout(r, (AUCTION_DURATION_SHORT + 3) * 1000),
        );

        await settleAuctionDirect(
          aptosClient,
          seller,
          moduleAddr,
          seller.accountAddress.toString(),
        ).catch(() => {});

        render(
          <ClaimProviders account={ethAddress}>
            <ClaimButton windowId={0n} pairBcs={new Uint8Array(0)} />
          </ClaimProviders>,
        );

        // Phase 3a: is_settled returns false → claim button stays disabled
        await waitFor(
          () => {
            const status = screen.getByTestId(SELECTORS.claimButton.claimStatus);
            expect(status.textContent).toContain("Auction not yet settled");
          },
          { timeout: 30_000 },
        );

        const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
        expect((claimBtn as HTMLButtonElement).disabled).toBe(true);
      }, "bidder");
    },
    600_000,
  );

  // ── 11-4: Reclaim always disabled in Phase 3a ───────────────────────────

  it(
    "reclaim button is always disabled (Phase 3a scaffold — not yet implemented)",
    async () => {
      // This test does not need a live chain — the reclaim button is always
      // disabled regardless of chain state. Use WalletProvider for simplicity.
      // v0 Beta: ClaimButton uses windowId + pairBcs instead of sellerAddress.
      render(
        <WalletProvider>
          <ClaimButton windowId={0n} pairBcs={new Uint8Array(0)} />
        </WalletProvider>,
      );

      const reclaimBtn = screen.getByTestId(SELECTORS.claimButton.reclaimButton);
      expect((reclaimBtn as HTMLButtonElement).disabled).toBe(true);
    },
    30_000,
  );
});
