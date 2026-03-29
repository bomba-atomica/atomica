import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { useEffect } from "react";
export function Step7Auction({ loading, error, amount, minPrice, unlockTime: _unlockTime, onCreateAuction, }) {
    // Auto-create on mount
    useEffect(() => {
        if (!loading && !error) {
            onCreateAuction();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const amountFormatted = amount
        ? (Number(amount) / 1e18).toFixed(4) + " FETH"
        : "…";
    const priceFormatted = minPrice
        ? "$" + (Number(minPrice) / 1e6).toFixed(2)
        : "…";
    return (_jsxs("div", { className: "flex flex-col gap-4", children: [_jsxs("p", { className: "text-sm text-zinc-400", children: ["Creating auction for ", amountFormatted, " with min price ", priceFormatted, ". Sign the SIWE message in MetaMask."] }), !error && (_jsxs("div", { className: "flex items-center gap-3 rounded border border-zinc-800 bg-zinc-950/60 p-3", children: [_jsx("div", { className: "w-4 h-4 border-2 border-zinc-500 border-t-zinc-200 rounded-full animate-spin flex-shrink-0" }), _jsx("span", { className: "text-sm text-zinc-400", children: loading ? "Creating auction…" : "Preparing…" })] })), error && (_jsxs("div", { className: "flex flex-col gap-2", children: [_jsx("p", { className: "text-xs text-red-400 font-mono break-all", children: error }), _jsx("button", { onClick: onCreateAuction, disabled: loading, className: "w-full py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold transition-colors", children: "Retry" })] }))] }));
}
//# sourceMappingURL=Step7Auction.js.map