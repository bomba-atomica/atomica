export interface BidHistoryEntry {
    auctionId: string;
    clearingPrice: bigint;
    settledAt: number;
    bids?: Array<{
        address: string;
        price: bigint;
        won: boolean;
    }>;
}
interface Props {
    entries?: BidHistoryEntry[];
}
export declare function BidHistory({ entries }: Props): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=BidHistory.d.ts.map