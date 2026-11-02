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
import type { BidHistoryEntry } from "../components/BidHistory";
/**
 * Return value of {@link useBidHistory}.
 *
 * @see docs/specifications/prd.md
 */
export interface UseBidHistoryResult {
    /** Sorted (newest-first) list of settled auction entries for the wallet. */
    entries: BidHistoryEntry[];
    /** Record a newly settled auction. Deduplicates by auctionId (seller address). */
    recordSettlement: (sellerAddress: string, clearingPrice: bigint) => void;
}
/**
 * Persistent bid history hook keyed by wallet address.
 *
 * Loads entries from localStorage on mount and persists new entries via
 * `recordSettlement`. Entries are sorted newest-first by `settledAt`.
 *
 * @param walletAddress - The connected wallet address (lowercase Ethereum hex). Pass `null` when disconnected.
 * @returns `{ entries, recordSettlement }` — see {@link UseBidHistoryResult}
 * @see docs/specifications/prd.md
 */
export declare function useBidHistory(walletAddress: string | null): UseBidHistoryResult;
//# sourceMappingURL=useBidHistory.d.ts.map