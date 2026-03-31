/**
 * useBidHistory — persistent bid history from localStorage
 *
 * Records settled auctions keyed by wallet address. When a settlement is
 * observed (via SettleButton or polling), callers invoke `recordSettlement`
 * with the seller address and clearing price. The hook persists entries to
 * localStorage so they survive page reloads.
 *
 * Entries are returned sorted newest-first by `settledAt` timestamp.
 */

import { useState, useCallback } from "react";
import type { BidHistoryEntry } from "../components/BidHistory";

// ── Persistence helpers ──────────────────────────────────────────────────────

function storageKey(walletAddress: string): string {
  return `bid-history-${walletAddress.toLowerCase()}`;
}

/** Serialisable form — bigint cannot be JSON.stringified directly. */
interface PersistedEntry {
  auctionId: string;
  clearingPrice: string; // bigint as decimal string
  settledAt: number;
}

function loadEntries(walletAddress: string): BidHistoryEntry[] {
  try {
    const raw = localStorage.getItem(storageKey(walletAddress));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PersistedEntry[];
    return parsed.map((e) => ({
      auctionId: e.auctionId,
      clearingPrice: BigInt(e.clearingPrice),
      settledAt: e.settledAt,
    }));
  } catch {
    return [];
  }
}

function saveEntries(walletAddress: string, entries: BidHistoryEntry[]): void {
  try {
    const serialisable: PersistedEntry[] = entries.map((e) => ({
      auctionId: e.auctionId,
      clearingPrice: e.clearingPrice.toString(),
      settledAt: e.settledAt,
    }));
    localStorage.setItem(
      storageKey(walletAddress),
      JSON.stringify(serialisable),
    );
  } catch {
    // quota exceeded — ignore
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export interface UseBidHistoryResult {
  entries: BidHistoryEntry[];
  /** Record a newly settled auction. Deduplicates by auctionId (seller address). */
  recordSettlement: (sellerAddress: string, clearingPrice: bigint) => void;
}

export function useBidHistory(
  walletAddress: string | null,
): UseBidHistoryResult {
  const [entries, setEntries] = useState<BidHistoryEntry[]>(() => {
    if (!walletAddress) return [];
    return sortNewestFirst(loadEntries(walletAddress));
  });

  const recordSettlement = useCallback(
    (sellerAddress: string, clearingPrice: bigint) => {
      if (!walletAddress) return;

      setEntries((prev) => {
        // Deduplicate — don't add if we already have this seller
        if (prev.some((e) => e.auctionId === sellerAddress)) return prev;

        const newEntry: BidHistoryEntry = {
          auctionId: sellerAddress,
          clearingPrice,
          settledAt: Math.floor(Date.now() / 1000),
        };

        const updated = sortNewestFirst([newEntry, ...prev]);
        saveEntries(walletAddress, updated);
        return updated;
      });
    },
    [walletAddress],
  );

  return { entries, recordSettlement };
}

function sortNewestFirst(entries: BidHistoryEntry[]): BidHistoryEntry[] {
  return [...entries].sort((a, b) => b.settledAt - a.settledAt);
}
