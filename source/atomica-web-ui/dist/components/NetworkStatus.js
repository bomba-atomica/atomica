import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { aptos } from "@atomica/aptos-docker-testnet/browser";
export function NetworkStatus() {
    const [blockHeight, setBlockHeight] = useState("0");
    useEffect(() => {
        const fetchStatus = async () => {
            try {
                const ledger = await aptos.getLedgerInfo();
                setBlockHeight(ledger.block_height);
            }
            catch {
                // Suppress polling errors
            }
        };
        fetchStatus();
        const interval = setInterval(fetchStatus, 3000); // Poll every 3s
        return () => clearInterval(interval);
    }, []);
    return (_jsx("div", { className: "text-zinc-500 font-mono text-sm border border-zinc-900 rounded px-3 py-2 bg-zinc-900/50 flex items-center", children: _jsxs("div", { children: ["Block: ", _jsx("span", { className: "text-zinc-300 ml-2", children: blockHeight })] }) }));
}
//# sourceMappingURL=NetworkStatus.js.map