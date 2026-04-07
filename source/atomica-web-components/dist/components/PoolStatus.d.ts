/**
 * PoolStatus — Auction pool metrics from both chains.
 *
 * Shows total FakeETH locked on Ethereum, lock receipts proven on Aptos,
 * and flags divergence (ETH > Receipts = pending proofs; Receipts > ETH = anomaly).
 *
 * Aptos receipt count is fetched live via lock_receipt::get_receipt_count.
 */
export declare function PoolStatus(): import("react/jsx-runtime").JSX.Element;
//# sourceMappingURL=PoolStatus.d.ts.map