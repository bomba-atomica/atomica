import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from "react";
export function Step4Proof({ proof, loading, error, onGenerate }) {
    // Auto-generate on mount
    useEffect(() => {
        if (!proof && !loading && !error) {
            onGenerate();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    if (proof) {
        return (_jsxs("div", { className: "flex flex-col gap-3", children: [_jsx("p", { className: "text-sm text-zinc-400", children: "Storage proof generated." }), _jsxs("div", { className: "rounded border border-zinc-800 bg-zinc-950/60 p-3 text-xs font-mono text-zinc-400 flex flex-col gap-1", children: [_jsxs("div", { children: [_jsx("span", { className: "text-zinc-600", children: "Block:" }), " ", proof.blockNumber] }), _jsxs("div", { children: [_jsx("span", { className: "text-zinc-600", children: "Amount:" }), " ", (Number(proof.storageValue) / 1e18).toFixed(4), " FETH"] }), _jsxs("div", { children: [_jsx("span", { className: "text-zinc-600", children: "Proof nodes:" }), " ", proof.accountProof.length, " account / ", proof.storageProof.length, " ", "storage"] }), _jsxs("div", { className: "truncate", children: [_jsx("span", { className: "text-zinc-600", children: "State root:" }), " ", proof.stateRoot.slice(0, 18), "\u2026"] })] })] }));
    }
    return (_jsxs("div", { className: "flex flex-col gap-4", children: [_jsx("p", { className: "text-sm text-zinc-400", children: "Generating Ethereum storage proof for your lock\u2026" }), !error && (_jsxs("div", { className: "flex items-center gap-3 rounded border border-zinc-800 bg-zinc-950/60 p-3", children: [_jsx("div", { className: "w-4 h-4 border-2 border-zinc-500 border-t-zinc-200 rounded-full animate-spin flex-shrink-0" }), _jsx("span", { className: "text-sm text-zinc-400", children: "Generating proof\u2026" })] })), error && (_jsxs("div", { className: "flex flex-col gap-2", children: [_jsx("p", { className: "text-xs text-red-400 font-mono break-all", children: error }), _jsx("button", { onClick: onGenerate, disabled: loading, className: "w-full py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold transition-colors", children: "Retry" })] }))] }));
}
//# sourceMappingURL=Step4Proof.js.map