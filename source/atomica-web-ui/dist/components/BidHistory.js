import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function formatUsd(amount) {
    return (Number(amount) / 1e6).toFixed(2);
}
function formatTimestamp(ts) {
    return new Date(ts * 1000).toLocaleString();
}
export function BidHistory({ entries = [] }) {
    return (_jsx("div", { "data-testid": "bid-history-table", className: "rounded border border-zinc-800 overflow-hidden", children: _jsxs("table", { className: "w-full text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "border-b border-zinc-800 bg-zinc-900", children: [_jsx("th", { className: "text-left py-2 px-3 text-xs font-semibold text-zinc-500", children: "Auction ID" }), _jsx("th", { className: "text-right py-2 px-3 text-xs font-semibold text-zinc-500", children: "Clearing Price" }), _jsx("th", { className: "text-right py-2 px-3 text-xs font-semibold text-zinc-500", children: "Settled At" })] }) }), _jsxs("tbody", { children: [entries.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: 3, className: "text-center py-4 text-xs text-zinc-600", children: "No auctions yet" }) })), entries.map((entry) => (_jsxs("tr", { "data-testid": "bid-history-row", className: "border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors", children: [_jsx("td", { className: "py-2 px-3 font-mono text-xs text-zinc-400 truncate max-w-[120px]", children: entry.auctionId }), _jsxs("td", { className: "py-2 px-3 text-right font-mono text-xs text-zinc-200", children: ["$", formatUsd(entry.clearingPrice)] }), _jsx("td", { className: "py-2 px-3 text-right text-xs text-zinc-500", children: formatTimestamp(entry.settledAt) })] }, entry.auctionId)))] })] }) }));
}
//# sourceMappingURL=BidHistory.js.map