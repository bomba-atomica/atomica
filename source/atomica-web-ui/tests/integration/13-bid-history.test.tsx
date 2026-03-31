/**
 * @file 13-bid-history.test.tsx
 * @description Browser integration tests for the BidHistory component.
 *
 * Covers post-settlement bid history display scenarios:
 *   - Empty state renders the table with no rows
 *   - History row added after an auction cycle
 *   - Row contains correct clearing price and auction ID
 *   - Multiple auctions: both rows present
 *   - Multiple auctions: order matches the order of the entries prop
 *     (newest-first ordering is the responsibility of the caller — the component
 *      renders entries in the order they are supplied)
 *   - BidHistoryEntry.bids optional field is tolerated even if not yet rendered
 *
 * Tests run against the stub component from issue #41. The stub renders a table
 * with data-testid="bid-history-table" and one data-testid="bid-history-row" per
 * entry. Expandable bid details are a planned future enhancement and are not
 * asserted here — tests are designed to remain valid once that feature lands.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { BidHistory } from "../../src/components/BidHistory";
import type { BidHistoryEntry } from "../../src/components/BidHistory";
import { SELECTORS } from "./helpers/selectors";

afterEach(() => {
  cleanup();
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal BidHistoryEntry with sensible defaults. */
function makeEntry(overrides: Partial<BidHistoryEntry> = {}): BidHistoryEntry {
  return {
    auctionId: "0xabc123",
    clearingPrice: 100_000_000n, // $100.00
    settledAt: Math.floor(Date.now() / 1000) - 60, // 1 minute ago
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("13: BidHistory — auction history rows, ordering", () => {
  // ── 13-1: Empty state renders table with no rows ──────────────────────────

  it("empty state: bid-history-table is present and contains no rows", () => {
    render(<BidHistory />);

    expect(screen.getByTestId(SELECTORS.bidHistory.bidHistoryTable)).toBeTruthy();
    expect(screen.queryAllByTestId(SELECTORS.bidHistory.bidHistoryRow)).toHaveLength(0);
  });

  // ── 13-2: Empty array prop also renders table with no rows ────────────────

  it("entries=[]: bid-history-table present, no bid-history-row elements", () => {
    render(<BidHistory entries={[]} />);

    expect(screen.getByTestId(SELECTORS.bidHistory.bidHistoryTable)).toBeTruthy();
    expect(screen.queryAllByTestId(SELECTORS.bidHistory.bidHistoryRow)).toHaveLength(0);
  });

  // ── 13-3: Row appears after auction cycle ─────────────────────────────────

  it("single entry: one bid-history-row is present", () => {
    render(<BidHistory entries={[makeEntry()]} />);

    const rows = screen.getAllByTestId(SELECTORS.bidHistory.bidHistoryRow);
    expect(rows).toHaveLength(1);
  });

  // ── 13-4: Row shows correct clearing price ────────────────────────────────

  it("single entry: clearing price is shown as '$100.00'", () => {
    render(
      <BidHistory entries={[makeEntry({ clearingPrice: 100_000_000n })]} />,
    );

    const row = screen.getByTestId(SELECTORS.bidHistory.bidHistoryRow);
    expect(row.textContent).toContain("$100.00");
  });

  // ── 13-5: Row shows the auction ID ────────────────────────────────────────

  it("single entry: auction ID text is present in the row", () => {
    const auctionId = "0xdeadbeef11223344";
    render(
      <BidHistory entries={[makeEntry({ auctionId })]} />,
    );

    const row = screen.getByTestId(SELECTORS.bidHistory.bidHistoryRow);
    // The stub truncates via CSS but text content is still full
    expect(row.textContent).toContain(auctionId);
  });

  // ── 13-6: Multiple auctions — both rows present ───────────────────────────

  it("two entries: two bid-history-row elements are present", () => {
    const entries: BidHistoryEntry[] = [
      makeEntry({ auctionId: "0xaaa", clearingPrice: 200_000_000n }),
      makeEntry({ auctionId: "0xbbb", clearingPrice: 150_000_000n }),
    ];
    render(<BidHistory entries={entries} />);

    const rows = screen.getAllByTestId(SELECTORS.bidHistory.bidHistoryRow);
    expect(rows).toHaveLength(2);
  });

  // ── 13-7: Multiple auctions — newest-first ordering ──────────────────────
  //
  // The component renders entries in the order they are supplied.  Callers
  // are responsible for sorting newest-first before passing to BidHistory.
  // This test verifies that rendering order matches the prop order.

  it("two entries newest-first: first row matches the newer auction", () => {
    const newerTs = Math.floor(Date.now() / 1000) - 30;  // 30 s ago
    const olderTs = Math.floor(Date.now() / 1000) - 120; // 2 min ago

    const entries: BidHistoryEntry[] = [
      makeEntry({ auctionId: "0xnewer", settledAt: newerTs }),
      makeEntry({ auctionId: "0xolder", settledAt: olderTs }),
    ];
    render(<BidHistory entries={entries} />);

    const rows = screen.getAllByTestId(SELECTORS.bidHistory.bidHistoryRow);
    expect(rows[0].textContent).toContain("0xnewer");
    expect(rows[1].textContent).toContain("0xolder");
  });

  // ── 13-8: Entry with bids sub-array renders without crashing ─────────────

  it("entry with optional bids field: renders without crashing", () => {
    const entry: BidHistoryEntry = makeEntry({
      bids: [
        { address: "0x1234", price: 100_000_000n, won: true },
        { address: "0x5678", price: 90_000_000n, won: false },
      ],
    });
    render(<BidHistory entries={[entry]} />);

    expect(screen.getByTestId(SELECTORS.bidHistory.bidHistoryTable)).toBeTruthy();
    expect(screen.getAllByTestId(SELECTORS.bidHistory.bidHistoryRow)).toHaveLength(1);
  });

  // ── 13-9: Many auctions rendered correctly ────────────────────────────────

  it("five entries: all five bid-history-row elements are present", () => {
    const entries: BidHistoryEntry[] = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ auctionId: `0x${i.toString().padStart(4, "0")}` }),
    );
    render(<BidHistory entries={entries} />);

    const rows = screen.getAllByTestId(SELECTORS.bidHistory.bidHistoryRow);
    expect(rows).toHaveLength(5);
  });
});
