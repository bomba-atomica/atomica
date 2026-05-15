interface Props {
    /**
     * v0 Beta: auction window ID
     * @see docs/architecture/v0-architecture.md §2.2
     */
    windowId: bigint;
    /**
     * v0 Beta: BCS-encoded Pair struct
     * @see docs/architecture/v0-architecture.md §2.4
     */
    pairBcs: Uint8Array;
    /**
     * @deprecated Used for display only. Pass the Aptos seller address
     * for UI labelling while the per-winner path is deferred to Phase 3b.
     */
    sellerAddress?: string;
}
/**
 * ClaimButton — Phase 3a scaffold for winner payout.
 *
 * On mount, queries `get_settlement(windowId, pairBcs)` to check settlement
 * state and clearing price. Per-winner determination (checking whether the
 * current user is the clearing winner) is deferred to Phase 3b (#86b) when
 * bidder collateral verification is implemented.
 *
 * In Phase 3a the Claim button is shown but always disabled (scaffold body
 * aborts with E_NOT_IMPLEMENTED in the Move contract).
 *
 * v0 Beta breaking change: `isSettled` and `getSettlement` now take
 * `(windowId, pairBcs)` instead of `(sellerAddress)`. The `winner` field
 * is removed from `getSettlement` return value.
 *
 * @see docs/architecture/v0-architecture.md#§2-auction-mechanism-v01-beta
 */
export declare function ClaimButton({ windowId, pairBcs, sellerAddress }: Props): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=ClaimButton.d.ts.map