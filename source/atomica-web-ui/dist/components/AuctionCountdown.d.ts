interface AuctionCountdownProps {
    startsAt: Date;
    /** Optional extra className on the root element */
    className?: string;
}
/**
 * Live countdown to a specific auction start time.
 * Ticks every second via setInterval.
 */
export declare function AuctionCountdown({ startsAt, className, }: AuctionCountdownProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=AuctionCountdown.d.ts.map