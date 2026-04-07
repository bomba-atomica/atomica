import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { ethers } from "ethers";
import { submitCreateAuction } from "@atomica/sdk/aptos";
import * as ibe from "@atomica/state-proof-verifier/ibe";
import { useWallet } from "../context/WalletContext";
export function AuctionCreator() {
    const { account } = useWallet();
    const [lockIdHex, setLockIdHex] = useState("");
    const [minPrice, setMinPrice] = useState("100");
    const [duration, setDuration] = useState("3600"); // 1 hour
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null);
    const handleCreateAuction = async () => {
        if (!account)
            return;
        setLoading(true);
        setStatus("Generating IBE keys...");
        try {
            // 1. Generate MPK (Master Public Key) for this auction
            const { mpk } = await ibe.generateSystemParameters();
            // 2. Submit Transaction
            setStatus("Please sign the transaction in MetaMask...");
            // Convert inputs — lockIdHex is a 0x-prefixed hex string from the proof step
            const lockId = ethers.getBytes(lockIdHex || "0x" + "00".repeat(32));
            const minPriceWei = BigInt(minPrice);
            const durationSec = BigInt(duration);
            const pendingTx = await submitCreateAuction(account, lockId, minPriceWei, durationSec, mpk);
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
    return (_jsxs("div", { className: "bg-zinc-900 p-6 rounded-lg border border-zinc-800", children: [_jsx("h2", { className: "text-xl font-bold mb-4 text-zinc-300", children: "Sell" }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "Lock ID (0x hex from proof step)" }), _jsx("input", { type: "text", value: lockIdHex, onChange: (e) => setLockIdHex(e.target.value), placeholder: "0x...", className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 font-mono text-xs" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "Min Price (USD)" }), _jsx("input", { type: "number", value: minPrice, onChange: (e) => setMinPrice(e.target.value), className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "Duration (seconds)" }), _jsx("input", { type: "number", value: duration, onChange: (e) => setDuration(e.target.value), className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500" })] }), _jsx("button", { onClick: handleCreateAuction, disabled: loading, className: `w-full py-2 rounded font-bold transition-colors ${loading
                            ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
                            : "bg-zinc-100 hover:bg-white text-zinc-900"}`, children: loading ? "Processing..." : "Create Auction" }), status && (_jsx("div", { className: "mt-4 text-sm font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800", children: status }))] })] }));
}
//# sourceMappingURL=AuctionCreator.js.map