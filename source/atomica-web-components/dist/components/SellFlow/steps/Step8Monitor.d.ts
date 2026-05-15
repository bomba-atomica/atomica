interface Props {
    amount?: bigint;
    minPrice?: bigint;
    auctionEndTime?: number;
    unlockTime?: number;
    /** @deprecated v0 Beta — use windowId + pairBcs instead */
    sellerAddress?: string | null;
    /** v0 Beta: auction window ID (from auction::current_window_id) */
    windowId?: bigint | null;
    /** v0 Beta: BCS-encoded Pair struct */
    pairBcs?: Uint8Array | null;
    onCancelAndUnlock: () => Promise<void>;
    loading: boolean;
    error?: string;
}
export declare function Step8Monitor({ amount, minPrice, auctionEndTime, unlockTime, sellerAddress, windowId, pairBcs, onCancelAndUnlock, loading, error, }: Props): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Step8Monitor.d.ts.map