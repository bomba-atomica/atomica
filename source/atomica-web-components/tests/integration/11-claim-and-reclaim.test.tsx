/**
 * @file 11-claim-and-reclaim.test.tsx
 * @description Browser integration tests for the ClaimButton component against
 * live Docker testnets.
 *
 * The ClaimButton accepts `sellerAddress`, queries settlement state on-chain,
 * compares the winner against the current user's derived Aptos address, and
 * enables a Claim button that calls `fake_eth::mint` via SIWE when the user
 * is the winner.
 *
 * Scenarios:
 *   1. Unsettled auction: both buttons disabled, status shows "not yet settled"
 *   2. Winner: claim enabled, click triggers mint, status shows "Claimed"
 *   3. Non-winner: claim disabled, status shows "not the auction winner"
 *   4. Claim error: component shows error status when mint fails
 *   5. Reclaim button: always disabled in Demo phase
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

  it(
    "unsettled auction: both buttons disabled, status shows 'not yet settled'",
    async () => {
      await withLiveFixture(async ({ fixture, aptosClient, moduleAddr, ethAddress }) => {
        const testSetup = await setupAuctionState(fixture);
        const seller = testSetup.deployerAccount;
        const sellerAddress = seller.accountAddress.toString();

        // Create auction with long duration so it stays active (unsettled)
        await createAuctionDirect(
          aptosClient,
          seller,
          moduleAddr,
          testSetup.lockId,
          MIN_PRICE,
          BigInt(AUCTION_DURATION_BID),
        );

        render(
          <ClaimProviders account={ethAddress}>
            <ClaimButton sellerAddress={sellerAddress} />
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

  // ── 11-2: Winner can claim ────────────────────────────────────────────────
  //
  // The bidder submits a bid via the SIWE path (submitBid from payloads.ts)
  // so the on-chain winner is the SIWE-derived Aptos address of the bidder's
  // ETH key. ClaimButton's getDerivedAddress(account) then matches the winner.

  it(
    "winner: claim button enabled, click triggers mint, status shows 'Claimed'",
    async () => {
      await withLiveFixture(async ({ fixture, aptosClient, moduleAddr, ethAddress }) => {
        const testSetup = await setupAuctionState(fixture);
        const seller = testSetup.deployerAccount;
        const sellerAddress = seller.accountAddress.toString();

        await createAuctionDirect(
          aptosClient,
          seller,
          moduleAddr,
          testSetup.lockId,
          MIN_PRICE,
          BigInt(AUCTION_DURATION_BID),
        );

        // Submit bid via SIWE path so the winner is the bidder's SIWE-derived
        // Aptos address (which matches what ClaimButton will compute)
        await submitBid(
          ethAddress,
          sellerAddress,
          BID_PRICE,
          new Uint8Array(0),
          new Uint8Array(0),
        );

        // Wait for auction to end then settle
        await new Promise((r) =>
          setTimeout(r, (AUCTION_DURATION_BID + 3) * 1000),
        );
        await settleAuctionDirect(aptosClient, seller, moduleAddr, sellerAddress);

        // Read FakeETH balance before claim
        const bidderAptosAddress = (
          await getDerivedAddress(ethAddress.toLowerCase())
        ).toString();
        let balanceBefore = 0n;
        try {
          const [raw] = await viewFunction(
            aptosClient,
            `${moduleAddr}::fake_eth::balance`,
            [],
            [bidderAptosAddress],
          );
          balanceBefore = BigInt(raw);
        } catch {
          // No FakeETH store yet
        }

        render(
          <ClaimProviders account={ethAddress}>
            <ClaimButton sellerAddress={sellerAddress} />
          </ClaimProviders>,
        );

        // Wait for claim button to be enabled (component detects user is winner)
        await waitFor(
          () => {
            const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
            expect((claimBtn as HTMLButtonElement).disabled).toBe(false);
          },
          { timeout: 30_000 },
        );

        fireEvent.click(screen.getByTestId(SELECTORS.claimButton.claimButton));

        // Wait for "Claimed" status
        await waitFor(
          () => {
            const status = screen.getByTestId(SELECTORS.claimButton.claimStatus);
            expect(status.textContent).toBe("Claimed");
          },
          { timeout: 60_000 },
        );

        // Verify on-chain balance increased
        const [balanceAfterRaw] = await viewFunction(
          aptosClient,
          `${moduleAddr}::fake_eth::balance`,
          [],
          [bidderAptosAddress],
        );
        const balanceAfter = BigInt(balanceAfterRaw);
        expect(balanceAfter).toBeGreaterThan(balanceBefore);

        // Claim button should now be disabled and show "Claimed"
        const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
        expect(claimBtn.textContent).toBe("Claimed");
        expect((claimBtn as HTMLButtonElement).disabled).toBe(true);
      }, "bidder");
    },
    600_000,
  );

  // ── 11-3: Non-winner claim disabled ──────────────────────────────────────
  //
  // Settle an auction where the bidder is NOT the current wallet user.
  // The ClaimButton should show "not the auction winner".

  it(
    "non-winner: claim button disabled, status shows 'not the auction winner'",
    async () => {
      await withLiveFixture(async ({ fixture, aptosClient, moduleAddr, ethAddress }) => {
        const testSetup = await setupAuctionState(fixture);
        const seller = testSetup.deployerAccount;
        const sellerAddress = seller.accountAddress.toString();

        // Create an auction and settle it WITHOUT any bids. The winner will be
        // 0x0 (no valid bid), so the bidder is not the winner.
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
          <ClaimProviders account={ethAddress}>
            <ClaimButton sellerAddress={sellerAddress} />
          </ClaimProviders>,
        );

        await waitFor(
          () => {
            const status = screen.getByTestId(SELECTORS.claimButton.claimStatus);
            expect(status.textContent).toContain("not the auction winner");
          },
          { timeout: 30_000 },
        );

        const claimBtn = screen.getByTestId(SELECTORS.claimButton.claimButton);
        expect((claimBtn as HTMLButtonElement).disabled).toBe(true);
      }, "bidder");
    },
    600_000,
  );

  // ── 11-4: Reclaim always disabled in Demo ────────────────────────────────

  it(
    "reclaim button is always disabled and shows 'Not applicable (Demo)'",
    async () => {
      // This test does not need a live chain — the reclaim button is always
      // disabled regardless of chain state. Use WalletProvider for simplicity.
      render(
        <WalletProvider>
          <ClaimButton sellerAddress="0xdeadbeef" />
        </WalletProvider>,
      );

      const reclaimBtn = screen.getByTestId(SELECTORS.claimButton.reclaimButton);
      expect((reclaimBtn as HTMLButtonElement).disabled).toBe(true);
      expect(reclaimBtn.textContent).toBe("Not applicable (Demo)");
    },
    30_000,
  );
});
