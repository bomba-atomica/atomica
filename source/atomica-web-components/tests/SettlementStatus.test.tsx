/**
 * Unit tests for SettlementStatus component — Phase 3d (#89).
 *
 * Verifies:
 *   1. Component renders in pending state before the first poll completes.
 *   2. Component shows scaffold notice when queryAuctionSettledEvents throws
 *      NOT_IMPLEMENTED (the default scaffold behaviour).
 *   3. Component shows settled events when the mock returns data.
 *
 * Uses vi.mock to stub @atomica/sdk/settlement/bridge so no network is required.
 *
 * @see docs/architecture/v0-architecture.md §3 — Cross-Chain Settlement
 * @see #89 — Phase 3d scaffold
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import type { AuctionSettledEvent, Pair } from "@atomica/sdk/settlement/bridge";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQueryAuctionSettledEvents = vi.fn();

vi.mock("@atomica/sdk/settlement/bridge", () => ({
  queryAuctionSettledEvents: (...args: unknown[]) =>
    mockQueryAuctionSettledEvents(...args),
  submitSettlement: vi.fn().mockRejectedValue(
    new Error("NOT_IMPLEMENTED: submitSettlement — implement in #89"),
  ),
}));

// Import AFTER vi.mock so the hoisted mock is in place.
import { SettlementStatus } from "../src/components/SettlementStatus";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PAIR: Pair = {
  baseChain: "ethereum",
  baseToken: "FakeETH",
  quoteChain: "aptos",
  quoteToken: "FakeUSD",
};

const WINDOW_ID = 1n;

const MOCK_EVENT: AuctionSettledEvent = {
  windowId: WINDOW_ID,
  pair: PAIR,
  clearingPrice: 1000n,
  totalFilled: 5_000_000_000_000_000_000n,
  winnerCount: 2n,
  lockIds: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SettlementStatus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: simulate NOT_IMPLEMENTED (scaffold state)
    mockQueryAuctionSettledEvents.mockRejectedValue(
      new Error("NOT_IMPLEMENTED: queryAuctionSettledEvents — implement in #89"),
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the container with testid", () => {
    render(<SettlementStatus windowId={WINDOW_ID} pair={PAIR} />);
    expect(screen.getByTestId("settlement-status")).toBeTruthy();
  });

  it("shows pending state initially (before first poll resolves)", () => {
    // Make the mock hang so initial render is always pending
    mockQueryAuctionSettledEvents.mockReturnValue(new Promise(() => {}));

    render(<SettlementStatus windowId={WINDOW_ID} pair={PAIR} />);
    expect(screen.getByTestId("settlement-status-pending")).toBeTruthy();
  });

  it("shows scaffold notice when queryAuctionSettledEvents throws NOT_IMPLEMENTED", async () => {
    render(<SettlementStatus windowId={WINDOW_ID} pair={PAIR} />);

    await waitFor(() => {
      expect(screen.getByTestId("settlement-status-error")).toBeTruthy();
    });

    const errorEl = screen.getByTestId("settlement-status-error");
    expect(errorEl.textContent).toContain("not yet available");
  });

  it("shows settled events when the query succeeds with data", async () => {
    mockQueryAuctionSettledEvents.mockResolvedValue([MOCK_EVENT]);

    render(<SettlementStatus windowId={WINDOW_ID} pair={PAIR} />);

    await waitFor(() => {
      expect(screen.getByTestId("settlement-status-settled")).toBeTruthy();
    });

    const settled = screen.getByTestId("settlement-status-settled");
    expect(settled.textContent).toContain("2");
  });

  it("shows empty message when the query succeeds with zero events", async () => {
    mockQueryAuctionSettledEvents.mockResolvedValue([]);

    render(<SettlementStatus windowId={WINDOW_ID} pair={PAIR} />);

    await waitFor(() => {
      expect(screen.getByTestId("settlement-status-settled")).toBeTruthy();
    });

    expect(screen.getByTestId("settlement-status-settled").textContent).toContain(
      "No settled events",
    );
  });
});
