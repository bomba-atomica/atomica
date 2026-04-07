import { jsx as _jsx } from "react/jsx-runtime";
import { useState, useEffect } from "react";
/** Formats milliseconds remaining as HH:MM:SS */
function formatCountdown(ms) {
    if (ms <= 0)
        return "00:00:00";
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
/**
 * Live countdown to a specific auction start time.
 * Ticks every second via setInterval.
 */
export function AuctionCountdown({ startsAt, className, }) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    const ms = startsAt.getTime() - now.getTime();
    return _jsx("span", { className: className, children: formatCountdown(ms) });
}
//# sourceMappingURL=AuctionCountdown.js.map