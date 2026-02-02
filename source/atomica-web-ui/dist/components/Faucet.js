import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { requestAPT, getMintFakeEthPayload, getMintFakeUsdPayload, areContractsDeployed, } from "@atomica/aptos-docker-testnet/browser";
import { TxButton } from "./TxButton";
export function Faucet({ account, onMintSuccess, }) {
    const [loadingAPT, setLoadingAPT] = useState(false);
    const [aptTxHash, setAptTxHash] = useState(null);
    const [ethTxHash, setEthTxHash] = useState(null);
    const [usdTxHash, setUsdTxHash] = useState(null);
    const [contractsDeployed, setContractsDeployed] = useState(false);
    // Check if contracts are deployed
    useEffect(() => {
        const checkContracts = async () => {
            const deployed = await areContractsDeployed();
            setContractsDeployed(deployed);
        };
        checkContracts();
        // Poll every 5 seconds to detect when contracts are deployed
        const interval = setInterval(checkContracts, 5000);
        return () => clearInterval(interval);
    }, []);
    const handleRequestAPT = async () => {
        if (!account)
            return;
        setLoadingAPT(true);
        setAptTxHash(null);
        try {
            const result = await requestAPT(account);
            setAptTxHash(result.hash);
            onMintSuccess?.();
        }
        catch (e) {
            console.error("APT request failed:", e);
            alert("Failed to request APT: " + e);
        }
        finally {
            setLoadingAPT(false);
        }
    };
    const handleMintSuccess = (hash, type) => {
        if (type === "eth") {
            setEthTxHash(hash);
        }
        else {
            setUsdTxHash(hash);
        }
        // Wait for transaction to be indexed before refreshing balances
        setTimeout(() => {
            onMintSuccess?.();
        }, 1500);
    };
    return (_jsxs("div", { className: "bg-zinc-900 p-6 rounded-lg border border-zinc-800", children: [_jsx("h2", { className: "text-xl font-bold mb-4 text-zinc-300", children: "1. Get Testnet Funds" }), _jsx("p", { className: "text-zinc-500 mb-6 text-sm", children: "Get tokens to interact with the auction demo." }), _jsxs("div", { className: "mb-4 p-4 bg-zinc-950/50 border border-zinc-900 rounded", children: [_jsxs("div", { className: "flex items-center justify-between mb-2", children: [_jsx("h3", { className: "text-sm font-semibold text-zinc-400", children: "Step 1a: Request APT (Gas Tokens)" }), aptTxHash && (_jsx("span", { className: "text-xs text-zinc-500", children: "\u2713 Completed" }))] }), _jsx("p", { className: "text-xs text-zinc-600 mb-3", children: "APT tokens are used to pay for transaction gas fees on Aptos." }), _jsx("button", { onClick: handleRequestAPT, disabled: loadingAPT || !!aptTxHash, className: `w-full py-2 px-4 rounded font-medium text-sm transition-colors ${loadingAPT || !!aptTxHash
                            ? "bg-zinc-800 cursor-not-allowed text-zinc-600"
                            : "bg-zinc-100 hover:bg-white text-zinc-900"}`, children: loadingAPT
                            ? "Requesting APT..."
                            : aptTxHash
                                ? "APT Received"
                                : "Request APT" }), aptTxHash && (_jsx("div", { className: "mt-2 p-2 bg-zinc-900 text-zinc-400 rounded text-xs break-all font-mono border border-zinc-800", children: "Success! APT tokens added to your account" }))] }), _jsxs("div", { className: "mb-4 p-4 bg-zinc-950/50 border border-zinc-900 rounded", children: [_jsx("div", { className: "flex items-center justify-between mb-2", children: _jsx("h3", { className: "text-sm font-semibold text-zinc-400", children: "Step 1b: Request Test Tokens" }) }), !contractsDeployed ? (_jsx("div", { className: "text-xs text-zinc-500 mb-3 animate-pulse", children: "\u23F3 Waiting for contracts to be deployed..." })) : (_jsx("p", { className: "text-xs text-zinc-600 mb-3", children: "Mint FAKEETH and FAKEUSD separately for testing." })), _jsxs("div", { className: "grid grid-cols-2 gap-4", children: [_jsxs("div", { children: [_jsx(TxButton, { label: "10 ETH", accountAddress: account, prepareTransaction: () => getMintFakeEthPayload(), onSuccess: (hash) => handleMintSuccess(hash, "eth"), disabled: !contractsDeployed, className: "w-full" }), ethTxHash && (_jsxs("div", { className: "mt-1 text-[10px] text-zinc-500 break-all font-mono", children: ["Tx: ", ethTxHash.slice(0, 10), "..."] }))] }), _jsxs("div", { children: [_jsx(TxButton, { label: "10k USD", accountAddress: account, prepareTransaction: () => getMintFakeUsdPayload(), onSuccess: (hash) => handleMintSuccess(hash, "usd"), disabled: !contractsDeployed, className: "w-full" }), usdTxHash && (_jsxs("div", { className: "mt-1 text-[10px] text-zinc-500 break-all font-mono", children: ["Tx: ", usdTxHash.slice(0, 10), "..."] }))] })] })] }), _jsx("div", { className: "mt-4 pt-4 border-t border-zinc-800", children: _jsxs("div", { className: "text-xs text-zinc-500", children: [!aptTxHash && !ethTxHash && !usdTxHash && (_jsx("p", { children: "Start by requesting APT tokens above" })), aptTxHash && !ethTxHash && !usdTxHash && contractsDeployed && (_jsx("p", { children: "APT received. Now mint test tokens." })), ethTxHash && usdTxHash && (_jsx("p", { className: "text-zinc-400", children: "All setup complete! You can now create or bid on auctions." }))] }) })] }));
}
//# sourceMappingURL=Faucet.js.map