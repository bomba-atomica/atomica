import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { aptos } from "@atomica/aptos-docker-testnet/browser";
import { getEthereumProvider } from "@atomica/sdk/ethereum";
import { useNetworkConfig } from "../network/network-config-state";
export function NetworkStatus() {
    const { host } = useNetworkConfig();
    const [aptosBlock, setAptosBlock] = useState("0");
    const [ethBlock, setEthBlock] = useState("0");
    useEffect(() => {
        const baseDelayMs = 3000;
        const maxDelayMs = 30000;
        let cancelled = false;
        let retryCount = 0;
        let timeout = null;
        const fetchStatus = async () => {
            let failed = false;
            try {
                const ledger = await aptos.getLedgerInfo();
                setAptosBlock(ledger.block_height);
            }
            catch {
                failed = true;
            }
            try {
                const blockNumber = await getEthereumProvider().getBlockNumber();
                setEthBlock(String(blockNumber));
            }
            catch {
                failed = true;
            }
            retryCount = failed ? retryCount + 1 : 0;
            const nextDelay = failed
                ? Math.min(baseDelayMs * 2 ** retryCount, maxDelayMs)
                : baseDelayMs;
            if (!cancelled) {
                timeout = setTimeout(() => void fetchStatus(), nextDelay);
            }
        };
        void fetchStatus();
        return () => {
            cancelled = true;
            if (timeout) {
                clearTimeout(timeout);
            }
        };
    }, [host]);
    return (_jsxs("div", { className: "text-zinc-500 font-mono text-sm border border-zinc-900 rounded px-3 py-2 bg-zinc-900/50 flex items-center gap-4", children: [_jsxs("div", { children: [_jsx("span", { className: "text-zinc-600 mr-1", children: "ETH" }), _jsx("span", { className: "text-zinc-300", children: ethBlock })] }), _jsx("div", { className: "w-px h-3 bg-zinc-800" }), _jsxs("div", { children: [_jsx("span", { className: "text-zinc-600 mr-1", children: "APT" }), _jsx("span", { className: "text-zinc-300", children: aptosBlock })] })] }));
}
//# sourceMappingURL=NetworkStatus.js.map