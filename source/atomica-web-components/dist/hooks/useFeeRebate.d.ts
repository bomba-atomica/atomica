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
 * Compute fee and rebate for the connected user after auction settlement.
 *
 * - Queries `get_settlement()` for clearing price and winner.
 * - Loads the user's bid price from localStorage.
 * - Computes rebate = bidPrice - clearingPrice.
 * - Fee is always 0 in Demo phase (no fee mechanism).
 *
 * Returns `ready: false` until settlement data and bid price are both available.
 */
export declare function useFeeRebate(sellerAddress: string | null | undefined, bidderAddress: string | null | undefined): FeeRebateResult;
//# sourceMappingURL=useFeeRebate.d.ts.map