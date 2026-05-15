/**
 * @file 12-fee-rebate.test.tsx
 * @description Browser integration tests for the FeeRebateDisplay component
 * and useFeeRebate hook.
 *
 * Phase 3a: all Move entry functions abort with E_NOT_IMPLEMENTED (99).
 * The useFeeRebate hook uses new v0 Beta interface (windowId, pairBcs, bidderAddress).
 * Since settlement never completes on-chain in Phase 3a, tests verify:
 *   1. FeeRebateDisplay renders correctly with directly-passed props
 *   2. useFeeRebate stays in "not ready" state when auction is not settled
 *   3. FeeRebateDisplay shows $0.00 fee in Demo/scaffold phase
 *   4. Component renders correctly in the scaffold context
 *
 * Full on-chain settlement tests (rebate from live clearing price) are
 * deferred to Phase 3b (#86b) when settle() is implemented.
 */

import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { SELECTORS } from "./helpers/selectors";
import { FeeRebateDisplay } from "../../src/components/FeeRebateDisplay";
import { useFeeRebate } from "../../src/hooks/useFeeRebate";
import { WalletContext } from "../../src/context/WalletContext";

// ---------------------------------------------------------------------------
// Test harness — wraps useFeeRebate + FeeRebateDisplay
// Phase 3a: uses new v0 Beta interface (windowId, pairBcs, bidderAddress)
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

describe.sequential("12: FeeRebateDisplay — Phase 3a scaffold tests", () => {
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
  // Phase 3a: useFeeRebate hook requires (windowId, pairBcs, bidderAddress).
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

  // ── 12-4: useFeeRebate stays in "not ready" for unsettled window ──────────
  //
  // Phase 3a: the is_settled view returns false for non-existent windows.
  // Hook never transitions to ready.

  it(
    "useFeeRebate stays loading when no settlement data on chain (Phase 3a scaffold)",
    async () => {
      render(
        <FeeRebateProviders account="0xdeadbeef">
          <FeeRebateHarness
            windowId={0n}
            pairBcs={new Uint8Array(0)}
            bidderAddress="0xdeadbeef"
          />
        </FeeRebateProviders>,
      );

      // Check that loading state is shown (hook queries is_settled → false)
      // We don't wait for ready since settlement never happens in Phase 3a
      await waitFor(
        () => {
          expect(screen.getByTestId("fee-rebate-loading")).toBeTruthy();
        },
        { timeout: 5_000 },
      );
    },
    30_000,
  );
});
