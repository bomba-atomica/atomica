import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
export function SettleButton({ auctionId: _auctionId, onSettle, disabled, }) {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null);
    const handleSettle = async () => {
        setLoading(true);
        setStatus("Settling auction…");
        try {
            await onSettle();
            setStatus("Settled");
        }
        catch (e) {
            setStatus(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "flex flex-col gap-2", children: [_jsx("button", { "data-testid": "settle-button", onClick: handleSettle, disabled: loading || disabled, className: `w-full py-2 rounded font-semibold text-sm transition-colors ${loading || disabled
                    ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
                    : "bg-zinc-100 hover:bg-white text-zinc-900"}`, children: loading ? "Settling…" : "Settle Auction" }), status && (_jsx("div", { "data-testid": "settle-status", className: "text-xs font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800", children: status }))] }));
}
//# sourceMappingURL=SettleButton.js.map