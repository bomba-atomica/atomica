import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { SettleButton } from "../../SettleButton";
import { ClaimButton } from "../../ClaimButton";
function useCountdown(endTime) {
    const [remaining, setRemaining] = useState(0);
    useEffect(() => {
        if (!endTime)
            return;
        const update = () => {
            const now = Math.floor(Date.now() / 1000);
            setRemaining(Math.max(0, endTime - now));
        };
        update();
        const id = setInterval(update, 1000);
        return () => clearInterval(id);
    }, [endTime]);
    return remaining;
}
function useIsUnlocked(unlockTime) {
    const [isUnlocked, setIsUnlocked] = useState(() => {
        if (!unlockTime || unlockTime <= 0)
            return false;
        const now = Math.floor(Date.now() / 1000);
        return now >= unlockTime;
    });
    useEffect(() => {
        if (!unlockTime || unlockTime <= 0) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsUnlocked(false);
            return;
        }
        const check = () => {
            const now = Math.floor(Date.now() / 1000);
            setIsUnlocked(now >= unlockTime);
        };
        check();
        const id = setInterval(check, 1000);
        return () => clearInterval(id);
    }, [unlockTime]);
    return isUnlocked;
}
function formatDuration(seconds) {
    if (seconds <= 0)
        return "Ended";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0)
        return `${h}h ${m}m ${s}s`;
    if (m > 0)
        return `${m}m ${s}s`;
    return `${s}s`;
}
export function Step8Monitor({ amount, minPrice, auctionEndTime, unlockTime, sellerAddress, onCancelAndUnlock, loading, error, }) {
    const remaining = useCountdown(auctionEndTime);
    const canUnlock = useIsUnlocked(unlockTime);
    const ended = remaining === 0 && auctionEndTime !== undefined;
    const amountFormatted = amount
        ? (Number(amount) / 1e18).toFixed(4) + " FETH"
        : "—";
    const priceFormatted = minPrice
        ? "$" + (Number(minPrice) / 1e6).toFixed(2)
        : "—";
    return (_jsxs("div", { className: "flex flex-col gap-4", children: [_jsxs("div", { className: "rounded border border-zinc-800 bg-zinc-950/60 p-4 flex flex-col gap-3", children: [_jsxs("div", { className: "flex justify-between text-sm", children: [_jsx("span", { className: "text-zinc-500", children: "Locked amount" }), _jsx("span", { className: "text-zinc-200 font-mono", children: amountFormatted })] }), _jsxs("div", { className: "flex justify-between text-sm", children: [_jsx("span", { className: "text-zinc-500", children: "Min price" }), _jsx("span", { className: "text-zinc-200 font-mono", children: priceFormatted })] }), sellerAddress && (_jsxs("div", { className: "flex justify-between text-sm", children: [_jsx("span", { className: "text-zinc-500", children: "Seller address" }), _jsx("span", { "data-testid": "auction-seller-address", className: "text-zinc-200 font-mono text-xs truncate max-w-[180px]", title: sellerAddress, children: sellerAddress })] })), _jsx("div", { className: "h-px bg-zinc-800" }), _jsxs("div", { className: "flex justify-between text-sm", children: [_jsx("span", { className: "text-zinc-500", children: "Auction closes in" }), _jsx("span", { "data-testid": "auction-countdown", className: `font-mono ${ended ? "text-zinc-500" : "text-zinc-200"}`, children: auctionEndTime ? formatDuration(remaining) : "—" })] }), _jsxs("div", { className: "flex justify-between text-sm", children: [_jsx("span", { className: "text-zinc-500", children: "Status" }), _jsx("span", { "data-testid": "auction-status-badge", className: `text-xs px-2 py-0.5 rounded ${ended ? "bg-zinc-700 text-zinc-400" : "bg-zinc-800 text-zinc-300"}`, children: ended ? "Settled" : "Active" })] })] }), ended && sellerAddress && (_jsx(SettleButton, { sellerAddress: sellerAddress, auctionEndTime: auctionEndTime })), ended && sellerAddress && (_jsx(ClaimButton, { sellerAddress: sellerAddress })), canUnlock && (_jsxs("div", { className: "flex flex-col gap-2", children: [_jsx("p", { className: "text-xs text-zinc-500", children: "Your lock period has expired. You may cancel and reclaim your tokens." }), _jsx("button", { onClick: onCancelAndUnlock, disabled: loading, className: `w-full py-2 rounded text-sm font-semibold border transition-colors ${loading
                            ? "bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed"
                            : "bg-transparent border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"}`, children: loading ? "Unlocking…" : "Cancel & Unlock" }), error && (_jsx("p", { className: "text-xs text-red-400 font-mono break-all", children: error }))] }))] }));
}
//# sourceMappingURL=Step8Monitor.js.map