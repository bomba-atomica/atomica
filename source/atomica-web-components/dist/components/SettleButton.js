import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from "react";
import { submitSettle, isSettled, getSettlement } from "@atomica/sdk/aptos";
import { useWallet } from "../context/WalletContext";
/**
 * SettleButton — calls `auction::settle` on-chain (v0 Beta global-registry).
 *
 * Displays the settlement outcome (clearing price and total filled) after
 * the window closes.
 *
 * v0 Beta breaking change from Demo phase: `settle` now takes
 * `(window_id, pair_bcs)` instead of `(seller_addr)`. The view functions
 * `is_settled` and `get_settlement` are also window-keyed.
 *
 * The button is disabled when:
 * - the connected wallet is missing
 * - the auction window has not yet ended (current time <= auctionEndTime)
 * - the window is already settled on-chain
 * - a transaction is in flight
 *
 * @see docs/architecture/v0-architecture.md#§2-auction-mechanism-v01-beta
 */
export function SettleButton({ windowId, pairBcs, auctionEndTime, onSettled, }) {
    const { account } = useWallet();
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null);
    const [settled, setSettled] = useState(false);
    const [clearingPrice, setClearingPrice] = useState(null);
    const [totalFilled, setTotalFilled] = useState(null);
    const [auctionEnded, setAuctionEnded] = useState(false);
    // Poll whether auction window time has passed
    useEffect(() => {
        if (!auctionEndTime)
            return;
        const check = () => {
            const now = Math.floor(Date.now() / 1000);
            setAuctionEnded(now > auctionEndTime);
        };
        check();
        const id = setInterval(check, 1000);
        return () => clearInterval(id);
    }, [auctionEndTime]);
    // Check initial settled state
    useEffect(() => {
        let cancelled = false;
        async function check() {
            try {
                const s = await isSettled(windowId, pairBcs);
                if (cancelled)
                    return;
                setSettled(s);
                if (s) {
                    const result = await getSettlement(windowId, pairBcs);
                    if (cancelled)
                        return;
                    setClearingPrice(result.clearingPrice);
                    setTotalFilled(result.totalFilled);
                    setStatus("Already Settled");
                    onSettled?.(windowId, result.clearingPrice);
                }
            }
            catch {
                // View function may fail if registry or window doesn't exist yet — ignore
            }
        }
        check();
        return () => {
            cancelled = true;
        };
    }, [windowId, pairBcs, onSettled]);
    const handleSettle = useCallback(async () => {
        if (!account)
            return;
        setLoading(true);
        setStatus("Settling auction…");
        try {
            await submitSettle(account, windowId, pairBcs);
            // Query settlement result
            const result = await getSettlement(windowId, pairBcs);
            setClearingPrice(result.clearingPrice);
            setTotalFilled(result.totalFilled);
            setSettled(true);
            setStatus("Settled");
            onSettled?.(windowId, result.clearingPrice);
        }
        catch (e) {
            const msg = e instanceof Error ? e.message : "Unknown error";
            if (msg.includes("E_AUCTION_NOT_ENDED") || msg.includes("abort 3")) {
                setStatus("Error: Auction window has not ended yet");
            }
            else if (msg.includes("E_ALREADY_SETTLED") || msg.includes("abort 5")) {
                setStatus("Error: Auction already settled");
            }
            else if (msg.includes("E_NOT_IMPLEMENTED") || msg.includes("abort 99")) {
                setStatus("Error: Settlement not yet implemented (Phase 3a scaffold)");
            }
            else {
                setStatus(`Error: ${msg}`);
            }
        }
        finally {
            setLoading(false);
        }
    }, [account, windowId, pairBcs, onSettled]);
    const disabled = loading || settled || !auctionEnded || !account;
    return (_jsxs("div", { className: "flex flex-col gap-2", children: [_jsx("button", { "data-testid": "settle-button", onClick: handleSettle, disabled: disabled, className: `w-full py-2 rounded font-semibold text-sm transition-colors ${disabled
                    ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
                    : "bg-zinc-100 hover:bg-white text-zinc-900"}`, children: loading
                    ? "Settling…"
                    : settled
                        ? "Already Settled"
                        : "Settle Auction" }), status && (_jsx("div", { "data-testid": "settle-status", className: "text-xs font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800", children: status })), settled && clearingPrice !== null && (_jsxs("div", { "data-testid": "settle-result", className: "text-xs font-mono p-2 bg-zinc-950 rounded border border-zinc-800 flex flex-col gap-1", children: [_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-zinc-500", children: "Clearing price" }), _jsx("span", { "data-testid": "settle-clearing-price", className: "text-zinc-300", children: `$${(Number(clearingPrice) / 1e6).toFixed(2)}` })] }), totalFilled !== null && (_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-zinc-500", children: "Total filled" }), _jsx("span", { "data-testid": "settle-total-filled", className: "text-zinc-300", children: `${(Number(totalFilled) / 1e18).toFixed(4)} ETH` })] }))] }))] }));
}
//# sourceMappingURL=SettleButton.js.map