/**
 * Unit tests for SettlementStatus component — issues #113 and #195.
 *
 * Verifies:
 *   1. Component renders in pending state before the first poll completes.
 *   2. Component shows a live error message when queryAuctionSettledEvents rejects.
 *   3. Component shows settled events when the mock returns data.
 *   4. Component shows empty message when the mock returns zero events.
 *   5. It reads Aptos with no relayer key: only the node URL and package.
 *
 * Uses vi.mock to stub @atomica/sdk/settlement/bridge so no network is required.
 *
 * @see docs/architecture/v0-architecture.md §3 — Cross-Chain Settlement
 * @see source/atomica-sdk/src/settlement/bridge.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import type { AuctionSettledEvent, Pair } from "@atomica/sdk/settlement/bridge";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockQueryAuctionSettledEvents = vi.fn();

vi.mock("@atomica/sdk/settlement/bridge", () => ({
  queryAuctionSettledEvents: (...args: unknown[]) =>
    mockQueryAuctionSettledEvents(...args),
}));

vi.mock("@atomica/sdk/settlement/window-release", () => ({
  defaultAptosNodes: () => ["http://aptos.test/v1"],
}));

vi.mock("@atomica/sdk/chain-config", () => ({
  getChainConfig: () => ({
    ethereum: {},
    aptos: { contractAddress: "0x" + "ab".repeat(32) },
  }),
}));

// Import AFTER vi.mock so the hoisted mock is in place.
import { SettlementStatus } from "../../src/components/SettlementStatus";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PAIR: Pair = {
  baseChain: "ethereum",
  baseToken: "FakeETH",
  quoteChain: "aptos",
  quoteToken: "FakeUSD",
};

const WINDOW_ID = 1n;

// clearingPrice is whole USD per whole base token. The $2000 display case is
// in tests/unit/price-display.test.tsx.
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
    // Default: resolve with no events (live empty response)
    mockQueryAuctionSettledEvents.mockResolvedValue([]);
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

  it("shows live error message when queryAuctionSettledEvents rejects", async () => {
    mockQueryAuctionSettledEvents.mockRejectedValue(
      new Error("network timeout"),
    );

    render(<SettlementStatus windowId={WINDOW_ID} pair={PAIR} />);

    await waitFor(() => {
      expect(screen.getByTestId("settlement-status-error")).toBeTruthy();
    });

    const errorEl = screen.getByTestId("settlement-status-error");
    expect(errorEl.textContent).toContain("network timeout");
  });

  it("shows settled events when the query succeeds with data", async () => {
    mockQueryAuctionSettledEvents.mockResolvedValue([MOCK_EVENT]);

    render(<SettlementStatus windowId={WINDOW_ID} pair={PAIR} />);

    await waitFor(() => {
      expect(screen.getByTestId("settlement-status-settled")).toBeTruthy();
    });

    const settled = screen.getByTestId("settlement-status-settled");
    expect(settled.textContent).toContain("2");
    expect(settled.textContent).toContain("clearing price $1000");
  });

  it("queries Aptos with the SDK node and package, and no relayer key", async () => {
    render(<SettlementStatus windowId={WINDOW_ID} pair={PAIR} />);
    await waitFor(() =>
      expect(mockQueryAuctionSettledEvents).toHaveBeenCalled(),
    );
    expect(mockQueryAuctionSettledEvents.mock.calls[0][2]).toEqual({
      aptosRpcUrl: "http://aptos.test/v1",
      contractAddress: "0x" + "ab".repeat(32),
    });
  });

  it("shows empty message when the query succeeds with zero events", async () => {
    mockQueryAuctionSettledEvents.mockResolvedValue([]);

    render(<SettlementStatus windowId={WINDOW_ID} pair={PAIR} />);

    await waitFor(() => {
      expect(screen.getByTestId("settlement-status-settled")).toBeTruthy();
    });

    expect(
      screen.getByTestId("settlement-status-settled").textContent,
    ).toContain("No settled events");
  });
});
