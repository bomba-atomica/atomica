import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { requestAPT } from "@atomica/aptos-docker-testnet/browser";
import { requestEthTokens } from "../lib/ethereum/transaction";
import { useWallet } from "../context/WalletContext";
import { useBalances } from "../context/BalancesContext";
import { useContractStatus } from "../context/ContractStatusContext";
export function Faucet() {
    const { account } = useWallet();
    const { refresh } = useBalances();
    const { aptosAlive, evmAlive, evmStatus } = useContractStatus();
    const aptosReady = aptosAlive === true;
    const evmReady = evmAlive === true && evmStatus === "ready";
    // Schedule a burst of balance refreshes after a faucet call so the UI
    // reflects the confirmed state without depending on chain-specific tx watchers.
    const scheduleRefreshBurst = () => {
        for (const delay of [500, 1500, 4000]) {
            setTimeout(() => void refresh(), delay);
        }
    };
    const [loadingAPT, setLoadingAPT] = useState(false);
    const [loadingEthTokens, setLoadingEthTokens] = useState(false);
    const [aptTxHash, setAptTxHash] = useState(null);
    const [ethTxHash, setEthTxHash] = useState(null);
    const [usdTxHash, setUsdTxHash] = useState(null);
    const [ethTokensError, setEthTokensError] = useState(null);
    const handleRequestAPT = async () => {
        if (!account)
            return;
        setLoadingAPT(true);
        setAptTxHash(null);
        try {
            const result = await requestAPT(account);
            setAptTxHash(result.hash);
            scheduleRefreshBurst();
        }
        catch (e) {
            console.error("APT request failed:", e);
            alert("Failed to request APT: " + e);
        }
        finally {
            setLoadingAPT(false);
        }
    };
    function extractErrorMessage(e) {
        if (e instanceof Error)
            return e.message;
        if (e !== null && typeof e === "object") {
            const obj = e;
            if (typeof obj.message === "string")
                return obj.message;
            if (typeof obj.reason === "string")
                return obj.reason;
            return JSON.stringify(obj);
        }
        return String(e);
    }
    const handleMintEthTokens = async () => {
        if (!account)
            return;
        setLoadingEthTokens(true);
        setEthTxHash(null);
        setUsdTxHash(null);
        setEthTokensError(null);
        try {
            const result = await requestEthTokens(account);
            setEthTxHash(result.ethTxHash);
            setUsdTxHash(result.usdTxHash);
            scheduleRefreshBurst();
        }
        catch (e) {
            setEthTokensError(extractErrorMessage(e));
            console.error("Ethereum token faucet failed:", e);
        }
        finally {
            setLoadingEthTokens(false);
        }
    };
    return (_jsxs("div", { className: "bg-zinc-900 p-6 rounded-lg border border-zinc-800", children: [_jsx("p", { className: "text-zinc-500 mb-6 text-sm", children: "Get tokens to interact with the auction demo." }), _jsxs("div", { className: "mb-4 p-4 bg-zinc-950/50 border border-zinc-900 rounded", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("h3", { className: "text-sm font-semibold text-zinc-400", children: "APT (Gas Tokens)" }), aptTxHash && (_jsx("span", { className: "text-xs text-zinc-500", children: "\u2713 Completed" }))] }), _jsx("p", { className: "text-xs text-zinc-600 mb-3", children: "APT tokens pay for transaction fees on Aptos (funded by the demo API)." }), _jsx("button", { onClick: handleRequestAPT, disabled: !aptosReady || loadingAPT || !!aptTxHash, className: `w-full py-2 px-4 rounded font-medium text-sm transition-colors ${!aptosReady || loadingAPT || !!aptTxHash
                            ? "bg-zinc-800 cursor-not-allowed text-zinc-600"
                            : "bg-zinc-100 hover:bg-white text-zinc-900"}`, children: loadingAPT
                            ? "Requesting APT..."
                            : aptTxHash
                                ? "APT Received"
                                : "Request APT" }), aptTxHash && (_jsx("div", { className: "mt-2 p-2 bg-zinc-900 text-zinc-400 rounded text-xs break-all font-mono border border-zinc-800", children: "Success! APT tokens added to your account" }))] }), _jsxs("div", { className: "mb-4 p-4 bg-zinc-950/50 border border-zinc-900 rounded", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("h3", { className: "text-sm font-semibold text-zinc-400", children: "Test Tokens (Ethereum)" }), ethTxHash && usdTxHash && (_jsx("span", { className: "text-xs text-zinc-500", children: "\u2713 Completed" }))] }), _jsx("p", { className: "text-xs text-zinc-600 mb-3", children: "10 FakeETH and 10,000 FakeUSD sent to your address (funded by the demo API)." }), _jsx("button", { "data-testid": "faucet-eth-button", onClick: handleMintEthTokens, disabled: !evmReady || loadingEthTokens || (!!ethTxHash && !!usdTxHash), className: `w-full py-2 px-4 rounded font-medium text-sm transition-colors ${!evmReady || loadingEthTokens || (!!ethTxHash && !!usdTxHash)
                            ? "bg-zinc-800 cursor-not-allowed text-zinc-600"
                            : "bg-zinc-100 hover:bg-white text-zinc-900"}`, children: loadingEthTokens
                            ? "Requesting tokens..."
                            : ethTxHash && usdTxHash
                                ? "Tokens Received"
                                : "Request ETH Tokens" }), ethTxHash && usdTxHash && (_jsx("div", { "data-testid": "faucet-status", className: "mt-2 p-2 bg-zinc-900 text-zinc-400 rounded text-xs break-all font-mono border border-zinc-800", children: "Success! 10 FakeETH and 10,000 FakeUSD added to your account" })), ethTokensError && (_jsx("div", { "data-testid": "faucet-status", className: "mt-2 text-[10px] text-zinc-500 break-words font-mono", children: ethTokensError }))] }), _jsx("div", { className: "mt-4 pt-4 border-t border-zinc-800", children: _jsxs("div", { className: "text-xs text-zinc-500", children: [aptTxHash && !ethTxHash && !usdTxHash && (_jsx("p", { children: "APT received. Now mint test tokens on Ethereum." })), ethTxHash && usdTxHash && (_jsx("p", { className: "text-zinc-400", children: "All setup complete! You can now create or bid on auctions." }))] }) })] }));
}
//# sourceMappingURL=Faucet.js.map