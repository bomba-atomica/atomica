/**
 * Unit tests for WithdrawWinnings component — issue #113.
 *
 * WithdrawWinnings is a read-only status display that shows settlement payout
 * state.  Settlement follows a push path: the BLS relayer calls
 * `authorizeSettlement` on BLSVerifierTestnet; winners receive their payout
 * automatically (Risk 3 decision — Option B, scout #111).
 *
 * Verifies:
 *   1. Component renders with correct testid.
 *   2. Shows "no events" message when events=[].
 *   3. Displays settled event details when events are provided.
 *   4. Always shows the push-notice footer.
 *
 * @see docs/architecture/v0-architecture.md §3 — Cross-Chain Settlement
 * @see source/atomica-sdk/src/settlement/bridge.ts
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AuctionSettledEvent, Pair } from "@atomica/sdk/settlement/bridge";

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
  winnerCount: 2n,
  lockIds: [],
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("WithdrawWinnings (read-only status display — Risk 3 Option B)", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders the container with testid", () => {
    render(<WithdrawWinnings events={[]} />);
    expect(screen.getByTestId("withdraw-winnings")).toBeTruthy();
  });

  it("shows no-events message when events=[]", () => {
    render(<WithdrawWinnings events={[]} />);
    expect(screen.getByTestId("withdraw-winnings-no-events")).toBeTruthy();
    expect(
      screen.getByTestId("withdraw-winnings-no-events").textContent,
    ).toContain("No settled events");
  });

  it("displays settled event details when events are provided", () => {
    render(<WithdrawWinnings events={[MOCK_EVENT]} />);
    expect(screen.getByTestId("withdraw-winnings-events")).toBeTruthy();
    const content = screen.getByTestId("withdraw-winnings-events").textContent;
    // windowId
    expect(content).toContain("1");
    // winnerCount
    expect(content).toContain("2");
    // clearing price
    expect(content).toContain("1000");
  });

  it("always shows push-notice footer", () => {
    render(<WithdrawWinnings events={[]} />);
    expect(screen.getByTestId("withdraw-winnings-push-notice")).toBeTruthy();
    expect(
      screen.getByTestId("withdraw-winnings-push-notice").textContent,
    ).toContain("relayer");
  });

  it("shows push-notice even when events are present", () => {
    render(<WithdrawWinnings events={[MOCK_EVENT]} />);
    expect(screen.getByTestId("withdraw-winnings-push-notice")).toBeTruthy();
  });
});
