/**
 * @file useBidHistory.test.tsx
 * @description Unit tests for the useBidHistory hook.
 *
 * Covers:
 *   - Returns empty array when no wallet
 *   - Returns empty array when no prior entries
 *   - Records a settlement and returns it
 *   - Deduplicates by seller address (auctionId)
 *   - Returns entries sorted newest-first
 *   - Entries persist to localStorage
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { useState, useCallback } from "react";
import { useBidHistory } from "../src/hooks/useBidHistory";

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  // Clear all bid-history keys
  const keys = Object.keys(localStorage).filter((k) =>
    k.startsWith("bid-history-"),
  );
  keys.forEach((k) => localStorage.removeItem(k));
});

// ── Test harness ──────────────────────────────────────────────────────────────

/**
 * Renders the hook and exposes its state and actions via data-testid.
 */
function TestHarness({ walletAddress }: { walletAddress: string | null }) {
  const { entries, recordSettlement } = useBidHistory(walletAddress);

  return (
    <div>
      <div data-testid="entry-count">{entries.length}</div>
      <div data-testid="entries-json">
        {JSON.stringify(
          entries.map((e) => ({
            auctionId: e.auctionId,
            clearingPrice: e.clearingPrice.toString(),
            settledAt: e.settledAt,
          })),
        )}
      </div>
      <button
        data-testid="record-btn"
        onClick={() => recordSettlement("0xseller1", 100_000_000n)}
      />
      <button
        data-testid="record-btn-2"
        onClick={() => recordSettlement("0xseller2", 200_000_000n)}
      />
      <button
        data-testid="record-dup"
        onClick={() => recordSettlement("0xseller1", 999n)}
      />
    </div>
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useBidHistory", () => {
  it("returns empty entries when walletAddress is null", () => {
    render(<TestHarness walletAddress={null} />);
    expect(screen.getByTestId("entry-count").textContent).toBe("0");
  });

  it("returns empty entries when no prior settlements exist", () => {
    render(<TestHarness walletAddress="0xwallet1" />);
    expect(screen.getByTestId("entry-count").textContent).toBe("0");
  });

  it("records a settlement and shows one entry", async () => {
    render(<TestHarness walletAddress="0xwallet1" />);

    // Click record button
    screen.getByTestId("record-btn").click();

    // Wait for re-render
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.getByTestId("entry-count").textContent).toBe("1");
    const entries = JSON.parse(
      screen.getByTestId("entries-json").textContent!,
    );
    expect(entries[0].auctionId).toBe("0xseller1");
    expect(entries[0].clearingPrice).toBe("100000000");
  });

  it("deduplicates by seller address", async () => {
    render(<TestHarness walletAddress="0xwallet1" />);

    screen.getByTestId("record-btn").click();
    await new Promise((r) => setTimeout(r, 50));

    // Try to record the same seller again
    screen.getByTestId("record-dup").click();
    await new Promise((r) => setTimeout(r, 50));

    expect(screen.getByTestId("entry-count").textContent).toBe("1");
  });

  it("returns entries sorted newest-first", async () => {
    render(<TestHarness walletAddress="0xwallet1" />);

    screen.getByTestId("record-btn").click();
    await new Promise((r) => setTimeout(r, 100));

    screen.getByTestId("record-btn-2").click();
    await new Promise((r) => setTimeout(r, 100));

    expect(screen.getByTestId("entry-count").textContent).toBe("2");
    const entries = JSON.parse(
      screen.getByTestId("entries-json").textContent!,
    );
    // Newest (seller2, recorded second) should be first
    expect(entries[0].auctionId).toBe("0xseller2");
    expect(entries[1].auctionId).toBe("0xseller1");
  });

  it("persists entries to localStorage", async () => {
    render(<TestHarness walletAddress="0xwallet1" />);

    screen.getByTestId("record-btn").click();
    await new Promise((r) => setTimeout(r, 50));

    const raw = localStorage.getItem("bid-history-0xwallet1");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].auctionId).toBe("0xseller1");
  });
});
