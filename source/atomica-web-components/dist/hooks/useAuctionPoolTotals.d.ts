/**
 * useAuctionPoolTotals — Poll both chains for auction pool metrics.
 *
 * Ethereum side: sums all TokensLocked events from LockBox (real).
 * Aptos side:    total lock receipt count via lock_receipt::get_receipt_count view function.
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