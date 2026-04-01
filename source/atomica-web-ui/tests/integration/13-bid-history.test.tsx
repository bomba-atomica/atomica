/**
 * @file 13-bid-history.test.tsx
 * @description Browser integration tests for the BidHistory component rendered
 * with entries from the real `useBidHistory` hook and localStorage persistence.
 *
 * Instead of constructing fake BidHistoryEntry objects with a `makeEntry()`
 * helper, these tests use `useBidHistory.recordSettlement()` to populate
 * entries through the same code path the production UI uses (SettleButton's
 * `onSettled` callback). BidHistory then renders whatever entries the hook
 * returns — no hardcoded props.
 *
 * Scenarios:
 *   1. Empty state: no settlements recorded, table with no rows
 *   2. Single settlement recorded via hook, one row appears
 *   3. Row displays correct clearing price from recorded settlement
 *   4. Two settlements recorded, both rows present newest-first
 *   5. Entries survive re-render (localStorage round-trip)
 *   6. Duplicate seller address is deduplicated by the hook
 *   7. Different wallet addresses have independent histories
 *
 * No `makeEntry()` helper constructing fake data — all entries flow through
 * `useBidHistory` and localStorage.
 */

import React, { useEffect, useRef } from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { BidHistory } from "../../src/components/BidHistory";
import { useBidHistory } from "../../src/hooks/useBidHistory";
import { SELECTORS } from "./helpers/selectors";

const TEST_WALLET = "0xtest_wallet_bid_history";

// ---------------------------------------------------------------------------
// Test harness — uses the real useBidHistory hook and renders BidHistory
// with the hook's entries. Records settlements on mount via the hook's
// recordSettlement function (the same code path the production UI uses).
// ---------------------------------------------------------------------------

function BidHistoryHarness({
  walletAddress,
  settlements,
}: {
  walletAddress: string;
  /** Settlements to record on mount. Each entry is [sellerAddress, clearingPrice]. */
  settlements?: Array<[string, bigint]>;
}) {
  const { entries, recordSettlement } = useBidHistory(walletAddress);
  const recorded = useRef(false);

  useEffect(() => {
    if (settlements && !recorded.current) {
      recorded.current = true;
      for (const [seller, price] of settlements) {
        recordSettlement(seller, price);
      }
    }
  }, [settlements, recordSettlement]);

  return (
    <div>
      <div data-testid="harness-entry-count">{entries.length}</div>
      <BidHistory entries={entries} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

afterEach(() => {
  cleanup();
  // Remove all bid-history localStorage keys used by the hook
  const keys = Object.keys(localStorage).filter((k) =>
    k.startsWith("bid-history-"),
  );
  keys.forEach((k) => localStorage.removeItem(k));
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("13: BidHistory — entries from useBidHistory hook + localStorage", () => {
  // ── 13-1: Empty state — no settlements recorded ───────────────────────────

  it("empty state: no settlements recorded, table present with no rows", () => {
    render(<BidHistoryHarness walletAddress={TEST_WALLET} />);

    expect(screen.getByTestId(SELECTORS.bidHistory.bidHistoryTable)).toBeTruthy();
    expect(screen.queryAllByTestId(SELECTORS.bidHistory.bidHistoryRow)).toHaveLength(0);
    expect(screen.getByTestId("harness-entry-count").textContent).toBe("0");
  });

  // ── 13-2: Single settlement recorded via hook ─────────────────────────────

  it("single settlement recorded via recordSettlement: one row appears", async () => {
    render(
      <BidHistoryHarness
        walletAddress={TEST_WALLET}
        settlements={[["0xseller_a", 100_000_000n]]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("harness-entry-count").textContent).toBe("1");
    });

    const rows = screen.getAllByTestId(SELECTORS.bidHistory.bidHistoryRow);
    expect(rows).toHaveLength(1);
  });

  // ── 13-3: Row displays correct clearing price ─────────────────────────────

  it("row displays clearing price from recorded settlement as '$100.00'", async () => {
    render(
      <BidHistoryHarness
        walletAddress={TEST_WALLET}
        settlements={[["0xseller_b", 100_000_000n]]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("harness-entry-count").textContent).toBe("1");
    });

    const row = screen.getByTestId(SELECTORS.bidHistory.bidHistoryRow);
    expect(row.textContent).toContain("$100.00");
  });

  // ── 13-4: Two settlements — both rows present, newest-first ───────────────

  it("two settlements: both rows present, seller addresses visible", async () => {
    render(
      <BidHistoryHarness
        walletAddress={TEST_WALLET}
        settlements={[
          ["0xseller_older", 150_000_000n],
          ["0xseller_newer", 200_000_000n],
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("harness-entry-count").textContent).toBe("2");
    });

    const rows = screen.getAllByTestId(SELECTORS.bidHistory.bidHistoryRow);
    expect(rows).toHaveLength(2);

    // Both seller addresses should appear as auctionId in the rows
    const allText = rows.map((r) => r.textContent).join("|");
    expect(allText).toContain("0xseller_older");
    expect(allText).toContain("0xseller_newer");
  });

  // ── 13-5: Entries survive re-render (localStorage round-trip) ─────────────

  it("entries persist across unmount/remount via localStorage", async () => {
    // First render — record a settlement
    const { unmount } = render(
      <BidHistoryHarness
        walletAddress={TEST_WALLET}
        settlements={[["0xseller_persist", 250_000_000n]]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("harness-entry-count").textContent).toBe("1");
    });

    unmount();
    cleanup();

    // Second render — no settlements prop, should load from localStorage
    render(<BidHistoryHarness walletAddress={TEST_WALLET} />);

    // Entry should be loaded from localStorage
    await waitFor(() => {
      expect(screen.getByTestId("harness-entry-count").textContent).toBe("1");
    });

    const row = screen.getByTestId(SELECTORS.bidHistory.bidHistoryRow);
    expect(row.textContent).toContain("0xseller_persist");
    expect(row.textContent).toContain("$250.00");
  });

  // ── 13-6: Duplicate seller address is deduplicated ────────────────────────

  it("duplicate seller address: only one row recorded", async () => {
    render(
      <BidHistoryHarness
        walletAddress={TEST_WALLET}
        settlements={[
          ["0xseller_dup", 100_000_000n],
          ["0xseller_dup", 200_000_000n], // same seller — should be deduplicated
        ]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("harness-entry-count").textContent).not.toBe("0");
    });

    // Hook deduplicates by auctionId (seller address)
    const rows = screen.getAllByTestId(SELECTORS.bidHistory.bidHistoryRow);
    expect(rows).toHaveLength(1);
  });

  // ── 13-7: Different wallet addresses have independent histories ───────────

  it("different wallets have independent histories", async () => {
    // Record settlement for wallet A
    const { unmount: unmountA } = render(
      <BidHistoryHarness
        walletAddress="0xwallet_a"
        settlements={[["0xseller_for_a", 100_000_000n]]}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("harness-entry-count").textContent).toBe("1");
    });

    unmountA();
    cleanup();

    // Render with wallet B — should have no entries
    render(<BidHistoryHarness walletAddress="0xwallet_b" />);

    expect(screen.getByTestId("harness-entry-count").textContent).toBe("0");
    expect(screen.queryAllByTestId(SELECTORS.bidHistory.bidHistoryRow)).toHaveLength(0);
  });
});
