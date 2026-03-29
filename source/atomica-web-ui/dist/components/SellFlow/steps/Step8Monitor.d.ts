interface Props {
    amount?: bigint;
    minPrice?: bigint;
    auctionEndTime?: number;
    unlockTime?: number;
    onCancelAndUnlock: () => Promise<void>;
    loading: boolean;
    error?: string;
}
export declare function Step8Monitor({ amount, minPrice, auctionEndTime, unlockTime, onCancelAndUnlock, loading, error, }: Props): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=Step8Monitor.d.ts.map