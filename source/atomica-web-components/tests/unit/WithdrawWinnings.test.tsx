/**
 * Unit tests for WithdrawWinnings component — issues #113 and #195.
 *
 * WithdrawWinnings is a read-only status display that shows settlement payout
 * state. No relayer pushes payouts: any wallet carries the validator-signed
 * outcome proof to the LockBox, and an unproven lock goes home by reclaim.
 *
 * Verifies:
 *   1. Component renders with correct testid.
 *   2. Shows "no events" message when events=[].
 *   3. Displays settled event details when events are provided.
 *   4. Always shows the payout notice, which names no relayer.
 *
 * @see docs/architecture/v0-architecture.md §3 — Cross-Chain Settlement
 * @see source/atomica-sdk/src/settlement/bridge.ts
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { AuctionSettledEvent, Pair } from "@atomica/sdk/settlement/bridge";

import { WithdrawWinnings } from "../../src/components/WithdrawWinnings";

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

describe("WithdrawWinnings (read-only status display)", () => {
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
    // clearing price, whole USD per whole base token
    expect(content).toContain("clearing price $1000");
  });

  it("always shows the payout notice: a carried proof, never a relayer", () => {
    render(<WithdrawWinnings events={[]} />);
    const notice = screen.getByTestId(
      "withdraw-winnings-push-notice",
    ).textContent;
    expect(notice).toContain("outcome proof");
    expect(notice).not.toMatch(/relayer/i);
  });

  it("shows push-notice even when events are present", () => {
    render(<WithdrawWinnings events={[MOCK_EVENT]} />);
    expect(screen.getByTestId("withdraw-winnings-push-notice")).toBeTruthy();
  });
});
