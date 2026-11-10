import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { ethers } from "ethers";
import { submitBid } from "@atomica/sdk/aptos";
import { approveFakeUsd, lockFakeUsd } from "@atomica/sdk/ethereum";
import { useWallet } from "../context/WalletContext";
import { saveBidPrice } from "../storage/bidStorage";
export function AuctionBidder() {
    const { account } = useWallet();
    // ── Step state ─────────────────────────────────────────────────────────────
    const [bidStep, setBidStep] = useState("lock-collateral");
    // ── Step 1: Lock FakeUSD collateral ───────────────────────────────────────
    const [collateralAmount, setCollateralAmount] = useState("500");
    const [lockLoading, setLockLoading] = useState(false);
    const [lockStatus, setLockStatus] = useState(null);
    // ── Step 2: Submit encrypted bid ──────────────────────────────────────────
    const [windowId, setWindowId] = useState("0");
    const [ciphertextHex, setCiphertextHex] = useState("");
    const [commitmentHex, setCommitmentHex] = useState("");
    const [quantity, setQuantity] = useState("1");
    const [pairBcsHex, setPairBcsHex] = useState("");
    const [collateralLockIdHex, setCollateralLockIdHex] = useState("");
    const [bidAmount, setBidAmount] = useState("110");
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null);
    // ── Step 1 handler: approve + lock FakeUSD ────────────────────────────────
    const handleLockCollateral = async () => {
        if (!account)
            return;
        setLockLoading(true);
        setLockStatus("Waiting for MetaMask — Approve FakeUSD...");
        try {
            const provider = new ethers.BrowserProvider(window.ethereum);
            const amountWei = ethers.parseUnits(collateralAmount || "0", 6); // FakeUSD uses 6 decimals
            // 1. Approve LockBox to spend FakeUSD.
            await approveFakeUsd(provider, amountWei);
            setLockStatus("Approved. Waiting for MetaMask — Lock FakeUSD...");
            // 2. Lock FakeUSD in LockBox as collateral margin.
            const lockReceipt = await lockFakeUsd(provider, amountWei);
            // In the full proof-generation flow the lock ID is derived from the
            // TokensLocked event via a state proof (same as the FakeETH seller path).
            // For this Phase 3b scaffold we pre-fill the field with the transaction
            // hash as a placeholder so the flow compiles end-to-end.  The user can
            // override the field before submitting the bid.
            const placeholder = lockReceipt.hash ?? lockReceipt.blockHash ?? "";
            setCollateralLockIdHex(placeholder);
            setLockStatus(`FakeUSD locked! Tx: ${lockReceipt.hash ?? "confirmed"}. Proceed to submit bid.`);
            setBidStep("submit-bid");
        }
        catch (error) {
            console.error(error);
            setLockStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
        finally {
            setLockLoading(false);
        }
    };
    // ── Step 2 handler: encrypt + submit bid ──────────────────────────────────
    const handleBid = async () => {
        if (!account)
            return;
        setLoading(true);
        setStatus("Preparing bid...");
        try {
            const windowIdBn = BigInt(windowId);
            const toBytes = (hex) => new Uint8Array((hex.replace(/^0x/, "").match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)));
            const ciphertext = toBytes(ciphertextHex);
            const commitment = toBytes(commitmentHex);
            if (ciphertext.length === 0) {
                throw new Error("Enter the V2 bid ciphertext (hex).");
            }
            if (commitment.length !== 32) {
                throw new Error("The commitment must be 32 bytes (64 hex characters).");
            }
            // Prepare sealed-bid arguments
            const pairBcs = pairBcsHex
                ? new Uint8Array((pairBcsHex.replace(/^0x/, "").match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)))
                : new Uint8Array(0);
            const collateralLockId = collateralLockIdHex
                ? new Uint8Array((collateralLockIdHex.replace(/^0x/, "").match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)))
                : new Uint8Array(32); // placeholder: 32 zero bytes
            // Submit
            setStatus("Please sign the transaction...");
            const pendingTx = await submitBid(account, windowIdBn, pairBcs, ciphertext, commitment, collateralLockId, BigInt(quantity));
            // Persist bid price in localStorage for post-settlement rebate computation
            // Key: windowId (string) used as auction identifier in this v0 shape
            saveBidPrice(windowId, account, BigInt(bidAmount));
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
    return (_jsxs("div", { className: "bg-zinc-900 p-6 rounded-lg border border-zinc-800", children: [_jsx("h2", { className: "text-xl font-bold mb-4 text-zinc-300", children: "Buy" }), _jsxs("div", { className: "flex gap-2 mb-5", children: [_jsx("span", { "data-testid": "step-indicator-lock", className: `text-xs px-2 py-0.5 rounded ${bidStep === "lock-collateral"
                            ? "bg-zinc-100 text-zinc-900 font-bold"
                            : "bg-zinc-800 text-zinc-500"}`, children: "1. Lock FakeUSD" }), _jsx("span", { "data-testid": "step-indicator-bid", className: `text-xs px-2 py-0.5 rounded ${bidStep === "submit-bid"
                            ? "bg-zinc-100 text-zinc-900 font-bold"
                            : "bg-zinc-800 text-zinc-500"}`, children: "2. Submit Bid" })] }), bidStep === "lock-collateral" && (_jsxs("div", { "data-testid": "lock-collateral-step", className: "space-y-4", children: [_jsx("p", { className: "text-sm text-zinc-400", children: "Lock FakeUSD in the Ethereum LockBox as collateral margin. You'll need to confirm two MetaMask transactions: approve and lock." }), _jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "Collateral Amount (FakeUSD)" }), _jsx("input", { "data-testid": "collateral-amount-input", type: "number", value: collateralAmount, onChange: (e) => setCollateralAmount(e.target.value), min: "0", step: "10", className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500" })] }), _jsx("button", { "data-testid": "approve-lock-usd-button", onClick: handleLockCollateral, disabled: lockLoading, className: `w-full py-2 rounded font-bold transition-colors ${lockLoading
                            ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
                            : "bg-zinc-100 hover:bg-white text-zinc-900"}`, children: lockLoading ? "Waiting for MetaMask..." : "Approve & Lock FakeUSD" }), lockStatus && (_jsx("div", { "data-testid": "lock-status", className: "mt-2 text-sm font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800", children: lockStatus })), _jsx("button", { "data-testid": "skip-to-bid-button", onClick: () => setBidStep("submit-bid"), className: "w-full py-1.5 rounded text-xs font-semibold border border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors", children: "Skip (enter Collateral Lock ID manually)" })] })), bidStep === "submit-bid" && (_jsxs("div", { "data-testid": "submit-bid-step", className: "space-y-4", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "Window ID" }), _jsx("input", { "data-testid": "window-id-input", type: "number", value: windowId, onChange: (e) => setWindowId(e.target.value), className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "V2 bid ciphertext (0x hex)" }), _jsx("input", { "data-testid": "bid-ciphertext-input", type: "text", value: ciphertextHex, onChange: (e) => setCiphertextHex(e.target.value), className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 text-xs font-mono border border-zinc-700 focus:outline-none focus:border-zinc-500", placeholder: "0x... BCS(vk, U, nonce, C, sig)" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "Price commitment (0x hex, 32 bytes)" }), _jsx("input", { "data-testid": "bid-commitment-input", type: "text", value: commitmentHex, onChange: (e) => setCommitmentHex(e.target.value), className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 text-xs font-mono border border-zinc-700 focus:outline-none focus:border-zinc-500", placeholder: "0x..." })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "Quantity (wei of FakeETH)" }), _jsx("input", { "data-testid": "bid-quantity-input", type: "number", value: quantity, onChange: (e) => setQuantity(e.target.value), className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "Pair BCS (0x hex, optional)" }), _jsx("input", { type: "text", value: pairBcsHex, onChange: (e) => setPairBcsHex(e.target.value), placeholder: "0x... (leave empty for default)", className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 text-xs font-mono border border-zinc-700 focus:outline-none focus:border-zinc-500" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "Collateral Lock ID (0x hex)" }), _jsx("input", { "data-testid": "collateral-lock-id-input", type: "text", value: collateralLockIdHex, onChange: (e) => setCollateralLockIdHex(e.target.value), className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 text-xs font-mono border border-zinc-700 focus:outline-none focus:border-zinc-500", placeholder: "0x... (pre-filled from Step 1)" })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-zinc-500 text-sm mb-1", children: "Bid Amount (USD)" }), _jsx("input", { "data-testid": "bid-amount-input", type: "number", value: bidAmount, onChange: (e) => setBidAmount(e.target.value), className: "w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500" })] }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { "data-testid": "back-to-lock-button", onClick: () => setBidStep("lock-collateral"), className: "py-2 px-4 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm transition-colors", children: "Back" }), _jsx("button", { "data-testid": "submit-bid-button", onClick: handleBid, disabled: loading, className: `flex-1 py-2 rounded font-bold transition-colors ${loading
                                    ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
                                    : "bg-zinc-100 hover:bg-white text-zinc-900"}`, children: loading ? "Processing..." : "Submit Encrypted Bid" })] }), status && (_jsx("div", { "data-testid": "bid-status", className: "mt-4 text-sm font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800", children: status }))] }))] }));
}
//# sourceMappingURL=AuctionBidder.js.map