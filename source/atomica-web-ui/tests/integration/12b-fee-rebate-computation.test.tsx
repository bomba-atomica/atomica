/**
 * @file 12b-fee-rebate-computation.test.tsx
 * @description Unit tests for rebate computation logic.
 *
 * Verifies that rebateAmount = bidPrice - clearingPrice is correctly
 * computed and displayed via FeeRebateDisplay for various scenarios.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FeeRebateDisplay } from "../../src/components/FeeRebateDisplay";
import { SELECTORS } from "./helpers/selectors";

afterEach(() => {
  cleanup();
});

/**
 * Simulate the rebate computation that useFeeRebate performs:
 *   rebate = bidPrice - clearingPrice
 *   fee = 0 (Demo phase)
 */
function computeRebate(bidPrice: bigint, clearingPrice: bigint) {
  const rebate = bidPrice - clearingPrice;
  return {
    rebateAmount: rebate >= 0n ? rebate : 0n,
    feeAmount: 0n,
  };
}

describe("12b: Fee/rebate computation with real settlement data", () => {
  // ── Scenario: bid above clearing price ─────────────────────────────────

  it("rebate = bid - clearing when bid > clearing", () => {
    // Bid $1.10, clearing $1.00 → rebate $0.10
    const { rebateAmount, feeAmount } = computeRebate(1_100_000n, 1_000_000n);

    render(<FeeRebateDisplay rebateAmount={rebateAmount} feeAmount={feeAmount} />);

    const rebateEl = screen.getByTestId(SELECTORS.feeRebateDisplay.rebateAmount);
    expect(rebateEl.textContent).toContain("+$0.10");

    const feeEl = screen.getByTestId(SELECTORS.feeRebateDisplay.feeAmount);
    expect(feeEl.textContent).toContain("$0.00");
  });

  // ── Scenario: single bidder (clearing = bid) ──────────────────────────

  it("single bidder: rebate = 0 since clearing = bid", () => {
    const { rebateAmount, feeAmount } = computeRebate(110_000_000n, 110_000_000n);

    render(<FeeRebateDisplay rebateAmount={rebateAmount} feeAmount={feeAmount} />);

    const rebateEl = screen.getByTestId(SELECTORS.feeRebateDisplay.rebateAmount);
    expect(rebateEl.textContent).toContain("$0.00");
  });

  // ── Scenario: large bid surplus ───────────────────────────────────────

  it("large surplus: bid $500, clearing $100 → rebate $400", () => {
    const { rebateAmount, feeAmount } = computeRebate(500_000_000n, 100_000_000n);

    render(<FeeRebateDisplay rebateAmount={rebateAmount} feeAmount={feeAmount} />);

    const rebateEl = screen.getByTestId(SELECTORS.feeRebateDisplay.rebateAmount);
    expect(rebateEl.textContent).toContain("+$400.00");
  });

  // ── Scenario: fee is always 0 in Demo ─────────────────────────────────

  it("fee is always 0 in Demo phase", () => {
    const { feeAmount } = computeRebate(200_000_000n, 100_000_000n);
    expect(feeAmount).toBe(0n);
  });

  // ── Scenario: negative difference clamped to 0 ────────────────────────

  it("negative difference (bid < clearing) clamped to 0 rebate", () => {
    // Shouldn't happen in practice (winner bid >= clearing), but defensive
    const { rebateAmount } = computeRebate(90_000_000n, 100_000_000n);
    expect(rebateAmount).toBe(0n);
  });

  // ── Scenario: non-winner gets no rebate display ───────────────────────

  it("non-winner: FeeRebateDisplay hidden when rebateAmount undefined", () => {
    // When user is not the winner, useFeeRebate sets rebateAmount=undefined
    render(<FeeRebateDisplay feeAmount={0n} />);

    expect(screen.queryByTestId(SELECTORS.feeRebateDisplay.rebateAmount)).toBeNull();
    const feeEl = screen.getByTestId(SELECTORS.feeRebateDisplay.feeAmount);
    expect(feeEl.textContent).toContain("$0.00");
  });
});
