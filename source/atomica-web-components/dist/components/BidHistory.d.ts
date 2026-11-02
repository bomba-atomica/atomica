/**
 * A single auction entry in the bid history table.
 *
 * Populated by {@link useBidHistory} and stored in localStorage so it
 * survives page reloads.
 */
export interface BidHistoryEntry {
    /** Seller address used as the auction identifier. */
    auctionId: string;
    /** Clearing price in USD micro-units (6 decimals). */
    clearingPrice: bigint;
    /** Unix timestamp (seconds) when the auction was settled. */
    settledAt: number;
    /** Optional per-bid breakdown (address, price, won flag). */
    bids?: Array<{
        address: string;
        price: bigint;
        won: boolean;
    }>;
}
/**
 * Props for {@link BidHistory}.
 *
 * @see docs/specifications/prd.md
 */
interface Props {
    /** Sorted (newest-first) bid history entries to render. */
    entries?: BidHistoryEntry[];
}
/**
 * Table displaying the user's settled auction history.
 *
 * Renders one row per {@link BidHistoryEntry} with auction ID, clearing
 * price (formatted as USD), and settlement timestamp. Shows an empty-state
 * message when `entries` is empty.
 *
 * @see docs/specifications/prd.md
 */
export declare function BidHistory({ entries }: Props): import("react").JSX.Element;
export {};
//# sourceMappingURL=BidHistory.d.ts.map