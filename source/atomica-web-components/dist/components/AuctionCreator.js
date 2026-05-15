import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { ethers } from "ethers";
import { submitCreateAuction } from "@atomica/sdk/aptos";
import * as ibe from "@atomica/state-proof-verifier/ibe";
import { useWallet } from "../context/WalletContext";
/**
 * UI panel for creating a new sealed-bid auction on Aptos (v0 Beta).
 *
 * Generates an IBE Master Public Key, collects the LockBox `lock_id`,
 * window ID, pair BCS bytes, and minimum price from the seller, then calls
 * `auction::create_auction` via the SIWE-authenticated Aptos transaction flow.
 * The seller's Ethereum lock receipt is consumed by the contract to prove
 * asset escrow.
 *
 * v0 Beta breaking change from Demo phase: `create_auction` now takes
 * `(window_id, pair_bcs, lock_id, min_price, mpk_bytes)` instead of
 * `(lock_id, min_price, duration, mpk_bytes)`.
 *
 * Requires {@link WalletContext} to be mounted above this component.
 *
 * @see docs/architecture/v0-architecture.md#§2-auction-mechanism-v01-beta
 */
export function AuctionCreator() {
    const { account } = useWallet();
    const [lockIdHex, setLockIdHex] = useState("");
    const [windowId, setWindowId] = useState("0");
    const [pairBcsHex, setPairBcsHex] = useState("");
    const [minPrice, setMinPrice] = useState("100");
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null);
    const handleCreateAuction = async () => {
        if (!account)
            return;
        setLoading(true);
        setStatus("Generating IBE keys...");
        try {
            // 1. Generate MPK (Master Public Key) for this auction window
            const { mpk } = await ibe.generateSystemParameters();
            // 2. Submit Transaction
            setStatus("Please sign the transaction in MetaMask...");
            // Convert inputs
            const lockId = ethers.getBytes(lockIdHex || "0x" + "00".repeat(32));
            const windowIdBn = BigInt(windowId);
            // pairBcs: BCS-encoded Pair struct; demo uses empty bytes (scaffold body aborts anyway)
            const pairBcs = pairBcsHex
                ? ethers.getBytes(pairBcsHex)
                : new Uint8Array(0);
            const minPriceBn = BigInt(minPrice);
            const pendingTx = await submitCreateAuction(account, windowIdBn, pairBcs, lockId, minPriceBn, mpk);
            const hash = pendingTx.hash || "submitted";
            setStatus(`Auction Created! Tx: ${hash}`);
        }
        catch (error) {
            console.error(error);
            setStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "bg-zinc-900 p-6 rounded-lg border border-zinc-800", children: [_jsx("h2", { className: "text-xl font-bold mb-4 text-zinc-300", children: "Sell" }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "Window ID" }), _jsx("input", { type: "number", value: windowId, onChange: (e) => setWindowId(e.target.value), className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "Pair BCS (0x hex, optional)" }), _jsx("input", { type: "text", value: pairBcsHex, onChange: (e) => setPairBcsHex(e.target.value), placeholder: "0x... (leave empty for default)", className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 font-mono text-xs" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "Lock ID (0x hex from proof step)" }), _jsx("input", { type: "text", value: lockIdHex, onChange: (e) => setLockIdHex(e.target.value), placeholder: "0x...", className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 font-mono text-xs" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "Min Price (USD)" }), _jsx("input", { type: "number", value: minPrice, onChange: (e) => setMinPrice(e.target.value), className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500" })] }), _jsx("button", { onClick: handleCreateAuction, disabled: loading, className: `w-full py-2 rounded font-bold transition-colors ${loading
                            ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
                            : "bg-zinc-100 hover:bg-white text-zinc-900"}`, children: loading ? "Processing..." : "Create Auction" }), status && (_jsx("div", { className: "mt-4 text-sm font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800", children: status }))] })] }));
}
//# sourceMappingURL=AuctionCreator.js.map