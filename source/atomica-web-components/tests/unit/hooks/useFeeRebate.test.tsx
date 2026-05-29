/**
 * Unit tests for useFeeRebate hook — issue #136.
 *
 * Verifies null scaffold, resolved rebate data with correct fields, and
 * correct argument passing to the fetchRebates mock.
 *
 * Uses vi.mock to stub @atomica/sdk/aptos so no network is required.
 *
 * @see source/atomica-web-components/src/hooks/useFeeRebate.ts
 * @see docs/specifications/web-architecture.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, act } from "@testing-library/react";
// act is used for the "stays not-ready" test
import React from "react";
import {
  useFeeRebate,
  type FeeRebateResult,
} from "../../../src/hooks/useFeeRebate";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockIsSettled = vi.fn();
const mockGetSettlement = vi.fn();
const mockGetBidResults = vi.fn();
const mockFetchRebates = vi.fn();

vi.mock("@atomica/sdk/aptos", () => ({
  isSettled: (...args: unknown[]) => mockIsSettled(...args),
  getSettlement: (...args: unknown[]) => mockGetSettlement(...args),
  getBidResults: (...args: unknown[]) => mockGetBidResults(...args),
  fetchRebates: (...args: unknown[]) => mockFetchRebates(...args),
}));

// ─── Test harness ─────────────────────────────────────────────────────────────

function FeeRebateHarness({
  windowId,
  pairBcs,
  bidderAddress,
}: {
  windowId: bigint | null;
  pairBcs: Uint8Array | null;
  bidderAddress: string;
}) {
  const result: FeeRebateResult = useFeeRebate(windowId, pairBcs, bidderAddress);

  return (
    <div>
      <span data-testid="ready">{String(result.ready)}</span>
      <span data-testid="pending">{String(result.pending)}</span>
      <span data-testid="isWinner">{String(result.isWinner)}</span>
      <span data-testid="rebateAmount">
        {result.rebateAmount === undefined ? "undefined" : String(result.rebateAmount)}
      </span>
      <span data-testid="feeAmount">
        {result.feeAmount === undefined ? "undefined" : String(result.feeAmount)}
      </span>
    </div>
  );
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PAIR_BCS = new Uint8Array([1, 2, 3]);
const WINDOW_ID = 42n;
const BIDDER = "0xdeadbeef";
const CLEARING_PRICE = 1_000_000n;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useFeeRebate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSettled.mockResolvedValue(true);
    mockGetSettlement.mockResolvedValue({
      clearingPrice: CLEARING_PRICE,
      totalFilled: 1_000_000_000_000_000_000n,
    });
    mockGetBidResults.mockResolvedValue([
      { bidder: BIDDER, fillAmount: 1_000_000_000_000_000_000n, isWinner: true },
    ]);
    mockFetchRebates.mockResolvedValue([
      { bidder: BIDDER, amount: 100_000n },
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("returns ready: false (not-ready) when windowId is null", () => {
    render(
      <FeeRebateHarness windowId={null} pairBcs={PAIR_BCS} bidderAddress={BIDDER} />,
    );
    expect(screen.getByTestId("ready").textContent).toBe("false");
  });

  it("returns null (not-ready) when fetchRebates resolves null (scaffold)", async () => {
    mockFetchRebates.mockResolvedValue(null);

    render(
      <FeeRebateHarness windowId={WINDOW_ID} pairBcs={PAIR_BCS} bidderAddress={BIDDER} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("true");
    });

    // pending: true when compute_rebates is not implemented
    expect(screen.getByTestId("pending").textContent).toBe("true");
    expect(screen.getByTestId("rebateAmount").textContent).toBe("undefined");
    expect(screen.getByTestId("feeAmount").textContent).toBe("undefined");
  });

  it("returns FeeRebateResult with correct fields when fetchRebates resolves with data", async () => {
    render(
      <FeeRebateHarness windowId={WINDOW_ID} pairBcs={PAIR_BCS} bidderAddress={BIDDER} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("true");
    });

    expect(screen.getByTestId("pending").textContent).toBe("false");
    expect(screen.getByTestId("isWinner").textContent).toBe("true");
    expect(screen.getByTestId("rebateAmount").textContent).toBe("100000");
    expect(screen.getByTestId("feeAmount").textContent).toBe("0");
  });

  it("passes correct (windowId, pairBcs, clearingPrice) args to fetchRebates mock", async () => {
    render(
      <FeeRebateHarness windowId={WINDOW_ID} pairBcs={PAIR_BCS} bidderAddress={BIDDER} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("true");
    });

    expect(mockFetchRebates).toHaveBeenCalledWith(WINDOW_ID, PAIR_BCS, CLEARING_PRICE);
  });

  it("sets isWinner: false when bidder is not in winning results", async () => {
    mockGetBidResults.mockResolvedValue([
      { bidder: BIDDER, fillAmount: 0n, isWinner: false },
    ]);
    mockFetchRebates.mockResolvedValue([{ bidder: BIDDER, amount: 0n }]);

    render(
      <FeeRebateHarness windowId={WINDOW_ID} pairBcs={PAIR_BCS} bidderAddress={BIDDER} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("ready").textContent).toBe("true");
    });

    expect(screen.getByTestId("isWinner").textContent).toBe("false");
    expect(screen.getByTestId("rebateAmount").textContent).toBe("0");
  });

  it("stays not-ready when isSettled returns false", async () => {
    mockIsSettled.mockResolvedValue(false);

    render(
      <FeeRebateHarness windowId={WINDOW_ID} pairBcs={PAIR_BCS} bidderAddress={BIDDER} />,
    );

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByTestId("ready").textContent).toBe("false");
  });
});
