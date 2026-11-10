interface Props {
    loading: boolean;
    error?: string;
    amount?: bigint;
    minPrice?: bigint;
    unlockTime?: number;
    txHash?: string;
    onCreateAuction: () => Promise<void>;
}
export declare function Step7Auction({ loading, error, amount, minPrice, unlockTime: _unlockTime, txHash, onCreateAuction, }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=Step7Auction.d.ts.map