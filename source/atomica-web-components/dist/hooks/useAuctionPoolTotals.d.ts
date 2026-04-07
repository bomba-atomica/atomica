/**
 * useAuctionPoolTotals — Poll both chains for auction pool metrics.
 *
 * Ethereum side: sums all TokensLocked events from LockBox (real).
 * Aptos side:    total lock receipt count (stub — infrastructure pending, I-D4).
 *
 * Refreshes every 30 seconds.
 */
export interface AuctionPoolTotals {
    /** Total FakeETH locked across all users in LockBox (wei) */
    totalLockedEth: bigint;
    /** Total lock receipts proven on Aptos */
    totalReceipts: number;
    loading: boolean;
    error?: string;
}
export declare function useAuctionPoolTotals(): AuctionPoolTotals;
//# sourceMappingURL=useAuctionPoolTotals.d.ts.map