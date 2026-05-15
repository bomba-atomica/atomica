interface Props {
    windowId: bigint;
    pairBcs: Uint8Array;
    auctionEndTime?: number;
    /** Called when a settlement is observed (either fresh or already settled). */
    onSettled?: (windowId: bigint, clearingPrice: bigint) => void;
}
/**
 * SettleButton — calls `auction::settle` on-chain (v0 Beta global-registry).
 *
 * Displays the settlement outcome (clearing price and total filled) after
 * the window closes.
 *
 * v0 Beta breaking change from Demo phase: `settle` now takes
 * `(window_id, pair_bcs)` instead of `(seller_addr)`. The view functions
 * `is_settled` and `get_settlement` are also window-keyed.
 *
 * The button is disabled when:
 * - the connected wallet is missing
 * - the auction window has not yet ended (current time <= auctionEndTime)
 * - the window is already settled on-chain
 * - a transaction is in flight
 *
 * @see docs/architecture/v0-architecture.md#§2-auction-mechanism-v01-beta
 */
export declare function SettleButton({ windowId, pairBcs, auctionEndTime, onSettled, }: Props): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=SettleButton.d.ts.map