/**
 * 10-settle.test.tsx
 *
 * Browser integration tests for SettleButton — the UI component that
 * triggers auction settlement and displays the outcome.
 *
 * Scenarios:
 *   1. Settle after auction expiry → SettleButton shows "Settled" (live chain)
 *   2. Attempt settle before expiry → error shown (simulated via callback throw)
 *   3. Double-settle rejected → error shown (live chain — uses settled auction)
 *   4. No-bid auction settles cleanly → "Settled" shown (live chain)
 *
 * Tests 1, 3, and 4 create independent short-duration auctions on the live
 * dual-chain testnet.  Test 2 uses a mock callback to isolate the UI error
 * handling path without requiring an additional testnet auction.
 *
 * Each test that needs a live auction uses a separate Aptos seller account so
 * that the single-auction-per-address Move constraint is not violated.
 */

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
  type IntegrationFixture,
} from "./fixtures/dual-chain";
import { setupWalletMock } from "./fixtures/wallet-mock";
import { settleButton } from "./helpers/selectors";
import {
  setupAuctionState,
  createAuctionDirect,
  submitBidDirect,
  settleAuctionDirect,
  viewFunction,
} from "./helpers/auction-setup";
import { SettleButton } from "../../src/components/SettleButton";
import { Aptos, AptosConfig, Network, Account } from "@aptos-labs/ts-sdk";
import { setAptosInstance } from "../../src/lib/aptos/config";

const MIN_PRICE = 50n;
const BID_PRICE = 200n;

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
    }) => Promise<void>,
  ): Promise<void> {
    const fixture = await setupIntegrationFixture();

    const aptosConfig = new AptosConfig({
      network: Network.LOCAL,
      fullnode: fixture.aptos.nodeUrl,
    });
    const aptosClient = new Aptos(aptosConfig);
    setAptosInstance(aptosClient);

    // SettleButton renders inside the browser environment, so keep the seller
    // wallet mock available even though the live-chain callbacks sign directly.
    await setupWalletMock({
      privateKey: fixture.eth.seller.privateKey,
      rpcUrl: fixture.eth.rpcUrl,
      chainId: fixture.eth.chainId,
    });

    try {
      await run({
        fixture,
        aptosClient,
        moduleAddr: fixture.aptos.moduleAddress,
      });
    } finally {
      await teardownIntegrationFixture();
    }
  }

  // ── Test 1: settle after close ─────────────────────────────────────────────

  it(
    "settle-status shows 'Settled' after AUCTION_DURATION_SHORT elapses",
    async () => {
      await withLiveFixture(async ({ fixture, aptosClient, moduleAddr }) => {
        const testSetup = await setupAuctionState(fixture);
        const testSeller = testSetup.deployerAccount;
        const testSellerAddress = testSeller.accountAddress.toString();

        await createAuctionDirect(
          testSetup.aptosClient,
          testSeller,
          moduleAddr,
          testSetup.lockId,
          MIN_PRICE,
          BigInt(AUCTION_DURATION_SHORT),
        );

        const bidder = Account.generate();
        await commands.fundAccount(
          bidder.accountAddress.toString(),
          500_000_000,
        );
        await submitBidDirect(
          testSetup.aptosClient,
          bidder,
          moduleAddr,
          testSellerAddress,
          BID_PRICE,
        );

        await new Promise((r) =>
          setTimeout(r, (AUCTION_DURATION_SHORT + 3) * 1000),
        );

        const onSettle = async () => {
          await settleAuctionDirect(
            testSetup.aptosClient,
            testSeller,
            moduleAddr,
            testSellerAddress,
          );
        };

        render(<SettleButton onSettle={onSettle} />);

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
          [testSellerAddress],
        );
        expect(settled[0]).toBe(true);
      });
    },
    600_000,
  );

  // ── Test 2: attempt settle before expiry (UI error path) ─────────────────

  it(
    "settle-status shows error when settle is called before auction closes",
    async () => {
      // Use a mock callback that throws the expected Move abort to test the
      // UI error path without spinning up a full live auction for this case.
      const onSettle = async () => {
        throw new Error(
          "Transaction failed: E_AUCTION_NOT_ENDED (Move abort 3)",
        );
      };

      render(<SettleButton onSettle={onSettle} />);

      fireEvent.click(screen.getByTestId(settleButton.settleButton));

      await waitFor(
        () => {
          const statusEl = screen.getByTestId(settleButton.settleStatus);
          expect(statusEl.textContent).toMatch(/Error/);
        },
        { timeout: 10_000 },
      );
    },
    30_000,
  );

  // ── Test 3: double-settle rejected ────────────────────────────────────────

  it(
    "settle-status shows error on double-settle attempt (live chain)",
    async () => {
      await withLiveFixture(async ({ fixture, aptosClient, moduleAddr }) => {
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

        const onSettle = async () => {
          await settleAuctionDirect(
            aptosClient,
            seller,
            moduleAddr,
            sellerAddress,
          );
        };

        render(<SettleButton onSettle={onSettle} />);

        fireEvent.click(screen.getByTestId(settleButton.settleButton));

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

  // ── Test 4: no-bid auction settles cleanly ────────────────────────────────

  it(
    "no-bid auction settle completes without error and shows 'Settled'",
    async () => {
      await withLiveFixture(async ({ fixture, aptosClient, moduleAddr }) => {
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

        const onSettle = async () => {
          await settleAuctionDirect(
            aptosClient,
            seller,
            moduleAddr,
            sellerAddress,
          );
        };

        render(<SettleButton onSettle={onSettle} />);

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
});
