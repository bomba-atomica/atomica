export interface UpcomingAuction {
    name: string;
    /** The UTC wall-clock label, e.g. "07:45 UTC" */
    utcLabel: string;
    /** Absolute Date of the next occurrence of this window */
    startsAt: Date;
}
/**
 * Computes the next two upcoming auction windows relative to `now`.
 * Each window recurs daily; we always return the two soonest, in order.
 */
export declare function getUpcomingAuctions(now: Date): [UpcomingAuction, UpcomingAuction];
//# sourceMappingURL=auctionUtils.d.ts.map