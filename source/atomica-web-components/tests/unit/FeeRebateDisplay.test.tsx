/**
 * Unit tests for FeeRebateDisplay component.
 *
 * Verifies that:
 *   1. The component renders a scaffold notice when no amounts are provided (null/undefined).
 *   2. The component renders rebate amounts when data is provided.
 *
 * FeeRebateDisplay is a pure presentation component with no external dependencies.
 *
 * @see docs/specifications/web-architecture.md
 * @see #135 — Web component unit tests
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { FeeRebateDisplay } from "../../src/components/FeeRebateDisplay";

describe("FeeRebateDisplay — unit", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders nothing (no rows) when no props are provided", () => {
    const { container } = render(<FeeRebateDisplay />);
    // Neither rebate-amount nor fee-amount should be present
    expect(container.querySelector("[data-testid='rebate-amount']")).toBeNull();
    expect(container.querySelector("[data-testid='fee-amount']")).toBeNull();
  });

  it("renders rebate amount row when rebateAmount is provided", () => {
    render(<FeeRebateDisplay rebateAmount={500000n} />);

    const rebateEl = screen.getByTestId("rebate-amount");
    expect(rebateEl).toBeTruthy();
    // 500000 micro-USD = $0.50
    expect(rebateEl.textContent).toContain("0.50");
    expect(rebateEl.textContent).toContain("+");
  });

  it("renders negative rebate amount with minus sign", () => {
    render(<FeeRebateDisplay rebateAmount={-200000n} />);

    const rebateEl = screen.getByTestId("rebate-amount");
    expect(rebateEl.textContent).toContain("-");
    expect(rebateEl.textContent).toContain("0.20");
  });

  it("renders fee amount row when feeAmount is provided", () => {
    render(<FeeRebateDisplay feeAmount={100000n} />);

    const feeEl = screen.getByTestId("fee-amount");
    expect(feeEl).toBeTruthy();
    // 100000 micro-USD = $0.10
    expect(feeEl.textContent).toContain("0.10");
  });

  it("renders both rebate and fee rows when both are provided", () => {
    render(<FeeRebateDisplay rebateAmount={300000n} feeAmount={50000n} />);

    expect(screen.getByTestId("rebate-amount")).toBeTruthy();
    expect(screen.getByTestId("fee-amount")).toBeTruthy();
  });

  it("shows zero rebate as positive with $0.00", () => {
    render(<FeeRebateDisplay rebateAmount={0n} />);

    const rebateEl = screen.getByTestId("rebate-amount");
    expect(rebateEl.textContent).toContain("+");
    expect(rebateEl.textContent).toContain("0.00");
  });
});
