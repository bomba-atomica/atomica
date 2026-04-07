import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { ethers } from "ethers";
import { submitBid } from "@atomica/aptos-docker-testnet/browser";
import * as ibe from "@atomica/state-proof-verifier/ibe";
import { useWallet } from "../context/WalletContext";
import { saveBidPrice } from "../storage/bidStorage";
export function AuctionBidder() {
    const { account } = useWallet();
    const [sellerAddr, setSellerAddr] = useState("");
    const [bidAmount, setBidAmount] = useState("110");
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null);
    const handleBid = async () => {
        if (!account)
            return;
        setLoading(true);
        setStatus("Encrypting Bid...");
        try {
            // 1. Encrypt Bid (IBE)
            // Identity = Auction ID (here we use Seller Address as ID for simplicity in Demo)
            const identityBytes = ethers.getBytes(sellerAddr);
            // Generate dummy MPK for demo purposes (real encryption logic handles point generation)
            const { mpk } = await ibe.generateSystemParameters();
            const payload = new TextEncoder().encode(bidAmount);
            const { u, v } = await ibe.encrypt(mpk, identityBytes, payload);
            // 2. Submit
            setStatus("Please sign the transaction...");
            const amountBn = BigInt(bidAmount);
            const pendingTx = await submitBid(account, sellerAddr, amountBn, u, v);
            // Persist bid price in localStorage for post-settlement rebate computation
            saveBidPrice(sellerAddr, account, amountBn);
            // Access hash safely (type assertion if needed)
            const hash = pendingTx.hash || "submitted";
            setStatus(`Bid Submitted! Tx: ${hash}`);
        }
        catch (error) {
            console.error(error);
            setStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "bg-zinc-900 p-6 rounded-lg border border-zinc-800", children: [_jsx("h2", { className: "text-xl font-bold mb-4 text-zinc-300", children: "Buy" }), _jsxs("div", { className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "Auction/Seller Address" }), _jsx("input", { "data-testid": "seller-address-input", type: "text", value: sellerAddr, onChange: (e) => setSellerAddr(e.target.value), className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 text-xs font-mono border border-zinc-700 focus:outline-none focus:border-zinc-500", placeholder: "0x..." })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "Bid Amount (USD)" }), _jsx("input", { "data-testid": "bid-amount-input", type: "number", value: bidAmount, onChange: (e) => setBidAmount(e.target.value), className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500" })] }), _jsx("button", { "data-testid": "submit-bid-button", onClick: handleBid, disabled: loading, className: `w-full py-2 rounded font-bold transition-colors ${loading
                            ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
                            : "bg-zinc-100 hover:bg-white text-zinc-900"}`, children: loading ? "Processing..." : "Submit Encrypted Bid" }), status && (_jsx("div", { "data-testid": "bid-status", className: "mt-4 text-sm font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800", children: status }))] })] }));
}
//# sourceMappingURL=AuctionBidder.js.map