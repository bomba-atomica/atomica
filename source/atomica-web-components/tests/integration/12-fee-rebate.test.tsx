/**
 * @file 12-fee-rebate.test.tsx
 * @description Browser integration tests for the FeeRebateDisplay component
 * and the useFeeRebate hook against a live settled window.
 *
 * Scenarios:
 *   1. FeeRebateDisplay renders rebate and fee amounts from props
 *   2. FeeRebateDisplay renders $0.00 for zero amounts
 *   3. useFeeRebate stays loading when windowId is null
 *   4. useFeeRebate stays loading while the live window is unsettled
 *   5. After settlement useFeeRebate reads the clearing price and bid results:
 *      the bidder is the winner with a zero rebate and fee (REBATE_COEFFICIENT
 *      is 0), and an address with no bid is not a winner
 *
 * One sealed bid (price 2.00) is placed by the bidder's Ethereum-derivable
 * account, the only account that can claim the bidder's collateral receipt.
 */

import React from "react";
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import {
  setupIntegrationFixture,
  teardownIntegrationFixture,
  type IntegrationFixture,
} from "./fixtures/dual-chain";
import { SELECTORS } from "./helpers/selectors";
import {
  createLiveWindow,
  lockBidCollateral,
  submitBidDirect,
  ethAccountAddress,
  waitForReveal,
  openWindowBidsDirect,
  settleAuctionDirect,
  getAuctionState,
  type LiveWindow,
} from "./helpers/auction-setup";
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import { setAptosInstance, isSettled } from "@atomica/sdk/aptos";
import { ethers } from "ethers";
import { FeeRebateDisplay } from "../../src/components/FeeRebateDisplay";
import { useFeeRebate } from "../../src/hooks/useFeeRebate";
import { WalletContext } from "../../src/context/WalletContext";

const MIN_PRICE = 1_000_000n;
const BID_PRICE = 2_000_000n;
const BID_QUANTITY = ethers.parseEther("1");
const PAIR_BCS = new TextEncoder().encode("12-fee-rebate");
const DEADLINE_AHEAD_US = 120_000_000n;
/** Seconds to wait after the deadline for the validators to reveal the key. */
const REVEAL_TIMEOUT_SECS = 300;
const NON_BIDDER =
  "0x000000000000000000000000000000000000000000000000000000000000dead";

// ---------------------------------------------------------------------------
// Test harness — wraps useFeeRebate + FeeRebateDisplay
// ---------------------------------------------------------------------------

function FeeRebateHarness({
  windowId,
  pairBcs,
  bidderAddress,
}: {
  windowId: bigint | null;
  pairBcs: Uint8Array | null;
  bidderAddress: string;
}) {
  const result = useFeeRebate(windowId, pairBcs, bidderAddress);

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

describe.sequential("12: FeeRebateDisplay — live fee and rebate after settlement", () => {
  let fixture: IntegrationFixture;
  let aptosClient: Aptos;
  let moduleAddr: string;
  let operator: Account;
  let auction: LiveWindow;

  beforeAll(async () => {
    fixture = await setupIntegrationFixture();
    moduleAddr = fixture.aptos.moduleAddress;

    aptosClient = new Aptos(
      new AptosConfig({ network: Network.LOCAL, fullnode: fixture.aptos.nodeUrl }),
    );
    setAptosInstance(aptosClient);

    operator = Account.fromPrivateKey({
      privateKey: new Ed25519PrivateKey(fixture.aptos.deployerPrivateKey),
    });

    const collateral = await lockBidCollateral(fixture, aptosClient, operator, PAIR_BCS);
    auction = await createLiveWindow(fixture, aptosClient, operator, {
      pairBcs: PAIR_BCS,
      minPrice: MIN_PRICE,
      deadlineAheadUs: DEADLINE_AHEAD_US,
    });
    await submitBidDirect(aptosClient, fixture.eth.bidder, auction, BID_PRICE, collateral, BID_QUANTITY);
  }, 1_200_000);

  afterAll(async () => {
    await teardownIntegrationFixture();
  });

  afterEach(() => {
    cleanup();
    // Clean up localStorage bid prices
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith("atomica:bid:"),
    );
    keys.forEach((k) => localStorage.removeItem(k));
  });

  // ── 12-1: FeeRebateDisplay renders with hardcoded props ──────────────────

  it(
    "FeeRebateDisplay renders rebate and fee amounts from props",
    () => {
      // Test the display component directly (no hook, no chain)
      render(
        <FeeRebateDisplay rebateAmount={50_000_000n} feeAmount={0n} />,
      );

      const rebateEl = screen.getByTestId(SELECTORS.feeRebateDisplay.rebateAmount);
      expect(rebateEl).toBeTruthy();
      // 50_000_000 / 1e6 = $50.00
      expect(rebateEl.textContent).toContain("$50.00");

      const feeEl = screen.getByTestId(SELECTORS.feeRebateDisplay.feeAmount);
      expect(feeEl).toBeTruthy();
      expect(feeEl.textContent).toContain("$0.00");
    },
    30_000,
  );

  // ── 12-2: FeeRebateDisplay renders zero amounts ───────────────────────────

  it(
    "FeeRebateDisplay renders $0.00 for zero rebate and fee",
    () => {
      render(
        <FeeRebateDisplay rebateAmount={0n} feeAmount={0n} />,
      );

      expect(screen.getByTestId(SELECTORS.feeRebateDisplay.rebateAmount).textContent)
        .toContain("$0.00");
      expect(screen.getByTestId(SELECTORS.feeRebateDisplay.feeAmount).textContent)
        .toContain("$0.00");
    },
    30_000,
  );

  // ── 12-3: useFeeRebate stays in "not ready" when windowId is null ─────────
  //
  // useFeeRebate requires (windowId, pairBcs, bidderAddress).
  // When windowId is null, the hook returns { ready: false } immediately.

  it(
    "useFeeRebate stays loading when windowId is null",
    async () => {
      render(
        <FeeRebateProviders account="0xdeadbeef">
          <FeeRebateHarness
            windowId={null}
            pairBcs={new Uint8Array(0)}
            bidderAddress="0xdeadbeef"
          />
        </FeeRebateProviders>,
      );

      // With null windowId, hook returns immediately without setting ready
      expect(screen.getByTestId("fee-rebate-loading")).toBeTruthy();
    },
    30_000,
  );

  // ── 12-4: useFeeRebate stays in "not ready" while the window is open ─────

  it(
    "useFeeRebate stays loading while the live window is unsettled",
    async () => {
      const bidder = await ethAccountAddress(fixture.eth.bidder);
      expect(await isSettled(auction.windowId, PAIR_BCS)).toBe(false);

      render(
        <FeeRebateProviders account={bidder}>
          <FeeRebateHarness
            windowId={auction.windowId}
            pairBcs={PAIR_BCS}
            bidderAddress={bidder}
          />
        </FeeRebateProviders>,
      );

      // The hook reads is_settled → false and stays not ready.
      await new Promise((r) => setTimeout(r, 3_000));
      expect(screen.getByTestId("fee-rebate-loading")).toBeTruthy();
      expect(screen.queryByTestId("fee-rebate-ready")).toBeNull();
    },
    30_000,
  );

  // ── 12-5: useFeeRebate after settlement ──────────────────────────────────

  it(
    "after settlement useFeeRebate reports the winner with a zero rebate and fee",
    async () => {
      await waitForReveal(
        auction.timelockId,
        Number(DEADLINE_AHEAD_US / 1_000_000n) + REVEAL_TIMEOUT_SECS,
      );
      await openWindowBidsDirect(aptosClient, operator, auction);
      await settleAuctionDirect(aptosClient, operator, auction);

      const state = await getAuctionState(aptosClient, moduleAddr, auction);
      expect(state.settled).toBe(true);
      expect(state.clearingPrice).toBe(BID_PRICE);

      const bidder = await ethAccountAddress(fixture.eth.bidder);
      render(
        <FeeRebateProviders account={bidder}>
          <FeeRebateHarness
            windowId={auction.windowId}
            pairBcs={PAIR_BCS}
            bidderAddress={bidder}
          />
        </FeeRebateProviders>,
      );

      await waitFor(
        () => {
          expect(screen.getByTestId("fee-rebate-ready")).toBeTruthy();
        },
        { timeout: 15_000 },
      );
      expect(screen.getByTestId("fee-rebate-is-winner").textContent).toBe("true");
      expect(
        screen.getByTestId(SELECTORS.feeRebateDisplay.rebateAmount).textContent,
      ).toBe("+$0.00");
      expect(
        screen.getByTestId(SELECTORS.feeRebateDisplay.feeAmount).textContent,
      ).toBe("+$0.00");

      cleanup();
      render(
        <FeeRebateProviders account={NON_BIDDER}>
          <FeeRebateHarness
            windowId={auction.windowId}
            pairBcs={PAIR_BCS}
            bidderAddress={NON_BIDDER}
          />
        </FeeRebateProviders>,
      );
      await waitFor(
        () => {
          expect(screen.getByTestId("fee-rebate-ready")).toBeTruthy();
        },
        { timeout: 15_000 },
      );
      expect(screen.getByTestId("fee-rebate-is-winner").textContent).toBe("false");
    },
    (Number(DEADLINE_AHEAD_US / 1_000_000n) + REVEAL_TIMEOUT_SECS + 180) * 1000,
  );
});
