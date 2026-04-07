/**
 * Persist and retrieve the user's bid price in localStorage.
 *
 * Key format: `atomica:bid:<sellerAddr>:<bidderAddr>` → bid price in USD
 * micro-units (bigint serialised as decimal string).
 */
/** Save the bid price after a successful `submit_bid`. */
export declare function saveBidPrice(sellerAddr: string, bidderAddr: string, amountUsd: bigint): void;
/** Retrieve a previously saved bid price, or `null` if none exists. */
export declare function loadBidPrice(sellerAddr: string, bidderAddr: string): bigint | null;
/** Remove a stored bid price (e.g. after claim). */
export declare function clearBidPrice(sellerAddr: string, bidderAddr: string): void;
//# sourceMappingURL=bidStorage.d.ts.map