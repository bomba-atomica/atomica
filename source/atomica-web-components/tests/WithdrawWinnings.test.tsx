/**
 * Unit tests for WithdrawWinnings component — Phase 3d (#89).
 *
 * Verifies:
 *   1. Button renders disabled and shows empty-event message when events=[].
 *   2. Button is enabled when events are provided.
 *   3. Clicking the button triggers submitSettlement; shows scaffold notice
 *      when it throws NOT_IMPLEMENTED.
 *   4. onSuccess callback is invoked when submitSettlement resolves.
 *
 * Uses vi.mock to stub @atomica/sdk/settlement/bridge.
 *
 * @see docs/architecture/v0-architecture.md §3 — Cross-Chain Settlement
 * @see #89 — Phase 3d scaffold
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import type { AuctionSettledEvent, Pair } from "@atomica/sdk/settlement/bridge";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockSubmitSettlement = vi.fn();

vi.mock("@atomica/sdk/settlement/bridge", () => ({
  queryAuctionSettledEvents: vi.fn().mockRejectedValue(
    new Error("NOT_IMPLEMENTED: queryAuctionSettledEvents — implement in #89"),
  ),
  submitSettlement: (...args: unknown[]) => mockSubmitSettlement(...args),
}));

import { WithdrawWinnings } from "../src/components/WithdrawWinnings";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PAIR: Pair = {
  baseChain: "ethereum",
  baseToken: "FakeETH",
  quoteChain: "aptos",
  quoteToken: "FakeUSD",
};

const MOCK_EVENT: AuctionSettledEvent = {
  windowId: 1n,
  pair: PAIR,
  clearingPrice: 1000n,
  totalFilled: 5_000_000_000_000_000_000n,
  winnerCount: 1n,
  lockIds: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("WithdrawWinnings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: simulate NOT_IMPLEMENTED (scaffold state)
    mockSubmitSettlement.mockRejectedValue(
      new Error("NOT_IMPLEMENTED: submitSettlement — implement in #89"),
    );
  });

  afterEach(() => {
    cleanup();
  });

  it("renders the container with testid", () => {
    render(<WithdrawWinnings events={[]} />);
    expect(screen.getByTestId("withdraw-winnings")).toBeTruthy();
  });

  it("renders button disabled and shows empty message when events=[]", () => {
    render(<WithdrawWinnings events={[]} />);
    const button = screen.getByTestId("withdraw-winnings-button");
    expect(button.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/No settled events to withdraw/)).toBeTruthy();
  });

  it("renders button enabled when events are provided", () => {
    render(<WithdrawWinnings events={[MOCK_EVENT]} />);
    const button = screen.getByTestId("withdraw-winnings-button");
    expect(button.hasAttribute("disabled")).toBe(false);
  });

  it("shows NOT_IMPLEMENTED scaffold notice after clicking when bridge stub throws", async () => {
    render(<WithdrawWinnings events={[MOCK_EVENT]} />);
    const button = screen.getByTestId("withdraw-winnings-button");

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByTestId("withdraw-winnings-not-implemented")).toBeTruthy();
    });

    const notice = screen.getByTestId("withdraw-winnings-not-implemented");
    expect(notice.textContent).toContain("not yet available");
  });

  it("button is disabled after NOT_IMPLEMENTED is shown", async () => {
    render(<WithdrawWinnings events={[MOCK_EVENT]} />);
    fireEvent.click(screen.getByTestId("withdraw-winnings-button"));

    await waitFor(() => {
      expect(screen.getByTestId("withdraw-winnings-not-implemented")).toBeTruthy();
    });

    expect(screen.getByTestId("withdraw-winnings-button").hasAttribute("disabled")).toBe(true);
  });

  it("shows success state and calls onSuccess when submitSettlement resolves", async () => {
    const TX_HASH = "0xdeadbeef";
    mockSubmitSettlement.mockResolvedValue(TX_HASH);
    const onSuccess = vi.fn();

    render(<WithdrawWinnings events={[MOCK_EVENT]} onSuccess={onSuccess} />);
    fireEvent.click(screen.getByTestId("withdraw-winnings-button"));

    await waitFor(() => {
      expect(screen.getByTestId("withdraw-winnings-success")).toBeTruthy();
    });

    expect(screen.getByTestId("withdraw-winnings-success").textContent).toContain(TX_HASH);
    expect(onSuccess).toHaveBeenCalledWith(TX_HASH);
  });

  it("shows error state when submitSettlement rejects with a non-NOT_IMPLEMENTED error", async () => {
    mockSubmitSettlement.mockRejectedValue(new Error("network timeout"));

    render(<WithdrawWinnings events={[MOCK_EVENT]} />);
    fireEvent.click(screen.getByTestId("withdraw-winnings-button"));

    await waitFor(() => {
      expect(screen.getByTestId("withdraw-winnings-error")).toBeTruthy();
    });

    expect(screen.getByTestId("withdraw-winnings-error").textContent).toContain(
      "network timeout",
    );
  });
});
