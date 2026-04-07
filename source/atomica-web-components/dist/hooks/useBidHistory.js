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
// ── Persistence helpers ──────────────────────────────────────────────────────
function storageKey(walletAddress) {
    return `bid-history-${walletAddress.toLowerCase()}`;
}
function loadEntries(walletAddress) {
    try {
        const raw = localStorage.getItem(storageKey(walletAddress));
        if (!raw)
            return [];
        const parsed = JSON.parse(raw);
        return parsed.map((e) => ({
            auctionId: e.auctionId,
            clearingPrice: BigInt(e.clearingPrice),
            settledAt: e.settledAt,
        }));
    }
    catch {
        return [];
    }
}
function saveEntries(walletAddress, entries) {
    try {
        const serialisable = entries.map((e) => ({
            auctionId: e.auctionId,
            clearingPrice: e.clearingPrice.toString(),
            settledAt: e.settledAt,
        }));
        localStorage.setItem(storageKey(walletAddress), JSON.stringify(serialisable));
    }
    catch {
        // quota exceeded — ignore
    }
}
export function useBidHistory(walletAddress) {
    const [entries, setEntries] = useState(() => {
        if (!walletAddress)
            return [];
        return sortNewestFirst(loadEntries(walletAddress));
    });
    const recordSettlement = useCallback((sellerAddress, clearingPrice) => {
        if (!walletAddress)
            return;
        setEntries((prev) => {
            // Deduplicate — don't add if we already have this seller
            if (prev.some((e) => e.auctionId === sellerAddress))
                return prev;
            const newEntry = {
                auctionId: sellerAddress,
                clearingPrice,
                settledAt: Math.floor(Date.now() / 1000),
            };
            const updated = sortNewestFirst([newEntry, ...prev]);
            saveEntries(walletAddress, updated);
            return updated;
        });
    }, [walletAddress]);
    return { entries, recordSettlement };
}
function sortNewestFirst(entries) {
    return [...entries].sort((a, b) => b.settledAt - a.settledAt);
}
//# sourceMappingURL=useBidHistory.js.map