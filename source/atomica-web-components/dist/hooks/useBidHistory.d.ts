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
export interface UseBidHistoryResult {
    entries: BidHistoryEntry[];
    /** Record a newly settled auction. Deduplicates by auctionId (seller address). */
    recordSettlement: (sellerAddress: string, clearingPrice: bigint) => void;
}
export declare function useBidHistory(walletAddress: string | null): UseBidHistoryResult;
//# sourceMappingURL=useBidHistory.d.ts.map