/**
 * Result returned by {@link useFeeRebate}.
 *
 * @see docs/specifications/prd.md
 */
export interface FeeRebateResult {
    /** Whether we have enough data to display fee/rebate. */
    ready: boolean;
    /** True when the current user is the auction winner. */
    isWinner: boolean;
    /** Rebate in USD micro-units (bid - clearing price). Undefined when not winner or not ready. */
    rebateAmount: bigint | undefined;
    /** Fee in USD micro-units. Always 0 in Demo phase. */
    feeAmount: bigint | undefined;
}
/**
 * Compute fee and rebate for the connected user after auction settlement (v0 Beta).
 *
 * - Queries `auction::get_settlement(windowId, pairBcs)` for clearing price.
 * - Loads the user's bid price from localStorage (keyed by windowId string).
 * - Computes rebate = bidPrice - clearingPrice.
 * - Fee is always 0 in Demo/Phase-3a (no fee mechanism yet).
 * - Per-winner determination is deferred to Phase 3b (#86b) when collateral
 *   verification is implemented.
 *
 * Returns `ready: false` until settlement data and bid price are both available.
 *
 * v0 Beta breaking change: parameters are now `(windowId, pairBcs)` instead of
 * `(sellerAddress)`. The `isWinner` field is always false until Phase 3b.
 *
 * @param windowId    - Auction window ID (from current_window_id or stored)
 * @param pairBcs     - BCS-encoded Pair struct
 * @param bidderAddress - Connected bidder address
 * @returns {@link FeeRebateResult} — `ready` is `false` until data is available
 * @see docs/architecture/v0-architecture.md §2
 */
export declare function useFeeRebate(windowId: bigint | null | undefined, pairBcs: Uint8Array | null | undefined, bidderAddress: string | null | undefined): FeeRebateResult;
//# sourceMappingURL=useFeeRebate.d.ts.map