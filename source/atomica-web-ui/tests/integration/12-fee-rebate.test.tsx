/**
 * @file 12-fee-rebate.test.tsx
 * @description Browser integration tests for the FeeRebateDisplay component.
 *
 * Covers fee / rebate display scenarios:
 *   - Accurate bidder rebate shown (positive amount → green "+$X.XX")
 *   - Noisy bidder fee shown (positive fee amount → red "-$X.XX")
 *   - Uniform clearing price (both bidders at same price → $0.00 rebate)
 *   - Only rebate prop renders rebate section; only fee prop renders fee section
 *   - When neither prop is provided the component renders without crashing
 *
 * Tests run against the stub component from issue #41.
 * Amount arithmetic mirrors the contract: rebateAmount and feeAmount are both
 * in USD micro-units (6 decimal places, i.e. 1_000_000 = $1.00).
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FeeRebateDisplay } from "../../src/components/FeeRebateDisplay";
import { SELECTORS } from "./helpers/selectors";

afterEach(() => {
  cleanup();
});

describe("12: FeeRebateDisplay — fee and rebate amounts", () => {
  // ── 12-1: Accurate bidder rebate shown ───────────────────────────────────

  it("accurate bidder: positive rebateAmount shows '+$X.XX' in rebate slot", () => {
    // Bidder bid above clearing price → receives $1.50 rebate
    render(
      <FeeRebateDisplay rebateAmount={1_500_000n} feeAmount={0n} />,
    );

    const rebateEl = screen.getByTestId(SELECTORS.feeRebateDisplay.rebateAmount);
    expect(rebateEl).toBeTruthy();
    expect(rebateEl.textContent).toContain("+$1.50");
  });

  // ── 12-2: Noisy bidder fee shown ─────────────────────────────────────────

  it("noisy bidder: positive feeAmount shows '-$X.XX' in fee slot", () => {
    // Bidder placed a noisy bid → charged $0.75 fee
    render(
      <FeeRebateDisplay feeAmount={750_000n} />,
    );

    const feeEl = screen.getByTestId(SELECTORS.feeRebateDisplay.feeAmount);
    expect(feeEl).toBeTruthy();
    expect(feeEl.textContent).toContain("-$0.75");
  });

  // ── 12-3: Uniform clearing price → zero rebate ───────────────────────────

  it("uniform clearing price: zero rebateAmount shows '+$0.00'", () => {
    render(
      <FeeRebateDisplay rebateAmount={0n} feeAmount={0n} />,
    );

    const rebateEl = screen.getByTestId(SELECTORS.feeRebateDisplay.rebateAmount);
    expect(rebateEl.textContent).toContain("$0.00");
  });

  // ── 12-4: Three-bidder scenario: each result card shows correct amount ────

  it("three-bidder scenario: each instance shows independent amounts", () => {
    // Bidder A: +$2.00 rebate
    const { unmount: unmountA } = render(
      <FeeRebateDisplay rebateAmount={2_000_000n} />,
    );
    expect(screen.getByTestId(SELECTORS.feeRebateDisplay.rebateAmount).textContent).toContain(
      "+$2.00",
    );
    unmountA();
    cleanup();

    // Bidder B: -$1.00 fee
    const { unmount: unmountB } = render(
      <FeeRebateDisplay feeAmount={1_000_000n} />,
    );
    expect(screen.getByTestId(SELECTORS.feeRebateDisplay.feeAmount).textContent).toContain(
      "-$1.00",
    );
    unmountB();
    cleanup();

    // Bidder C: $0.00 (exactly at clearing price)
    render(
      <FeeRebateDisplay rebateAmount={0n} feeAmount={0n} />,
    );
    expect(screen.getByTestId(SELECTORS.feeRebateDisplay.rebateAmount).textContent).toContain(
      "$0.00",
    );
  });

  // ── 12-5: Only rebate prop renders only rebate slot ───────────────────────

  it("only rebateAmount prop: fee slot is absent", () => {
    render(
      <FeeRebateDisplay rebateAmount={500_000n} />,
    );

    expect(screen.getByTestId(SELECTORS.feeRebateDisplay.rebateAmount)).toBeTruthy();
    expect(screen.queryByTestId(SELECTORS.feeRebateDisplay.feeAmount)).toBeNull();
  });

  // ── 12-6: Only fee prop renders only fee slot ─────────────────────────────

  it("only feeAmount prop: rebate slot is absent", () => {
    render(
      <FeeRebateDisplay feeAmount={250_000n} />,
    );

    expect(screen.getByTestId(SELECTORS.feeRebateDisplay.feeAmount)).toBeTruthy();
    expect(screen.queryByTestId(SELECTORS.feeRebateDisplay.rebateAmount)).toBeNull();
  });

  // ── 12-7: No props renders without crashing ───────────────────────────────

  it("no props: renders without crashing and shows no amounts", () => {
    render(<FeeRebateDisplay />);

    expect(screen.queryByTestId(SELECTORS.feeRebateDisplay.rebateAmount)).toBeNull();
    expect(screen.queryByTestId(SELECTORS.feeRebateDisplay.feeAmount)).toBeNull();
  });

  // ── 12-8: Large amount formatted correctly ────────────────────────────────

  it("large rebate amount is formatted to two decimal places", () => {
    // $1234.56 in micro-USD
    render(
      <FeeRebateDisplay rebateAmount={1_234_560_000n} />,
    );

    const rebateEl = screen.getByTestId(SELECTORS.feeRebateDisplay.rebateAmount);
    expect(rebateEl.textContent).toContain("$1234.56");
  });
});
