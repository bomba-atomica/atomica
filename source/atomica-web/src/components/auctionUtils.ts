/**
 * The two canonical auction windows, per docs/specifications/auction-timing.md.
 * All times are UTC. Names from the naming section of that document.
 */
const AUCTION_WINDOWS = [
    { name: "Euro-Asia Bridge", utcHour: 7, utcMinute: 45 },
    { name: "Atlantic / Americas Bridge", utcHour: 16, utcMinute: 15 },
] as const;

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
export function getUpcomingAuctions(
    now: Date,
): [UpcomingAuction, UpcomingAuction] {
    // For each window, find the next occurrence (today or tomorrow if already passed)
    const candidates = AUCTION_WINDOWS.map(({ name, utcHour, utcMinute }) => {
        const d = new Date(
            Date.UTC(
                now.getUTCFullYear(),
                now.getUTCMonth(),
                now.getUTCDate(),
                utcHour,
                utcMinute,
                0,
                0,
            ),
        );
        // If this window already passed today, roll to tomorrow
        if (d <= now) {
            d.setUTCDate(d.getUTCDate() + 1);
        }
        const pad = (n: number) => String(n).padStart(2, "0");
        return {
            name,
            utcLabel: `${pad(utcHour)}:${pad(utcMinute)} UTC`,
            startsAt: d,
        };
    });

    // Sort ascending by time so [0] is the very next auction
    candidates.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    return [candidates[0], candidates[1]];
}
