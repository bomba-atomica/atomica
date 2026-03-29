import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect } from "react";
export function Step5Submit({ loading, error, onSubmit }) {
    // Auto-submit on mount
    useEffect(() => {
        if (!loading && !error) {
            onSubmit();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (_jsxs("div", { className: "flex flex-col gap-4", children: [_jsx("p", { className: "text-sm text-zinc-400", children: "Submitting proof to Atomica. Sign the SIWE message in MetaMask." }), !error && (_jsxs("div", { className: "flex items-center gap-3 rounded border border-zinc-800 bg-zinc-950/60 p-3", children: [_jsx("div", { className: "w-4 h-4 border-2 border-zinc-500 border-t-zinc-200 rounded-full animate-spin flex-shrink-0" }), _jsx("span", { className: "text-sm text-zinc-400", children: loading ? "Submitting…" : "Preparing…" })] })), error && (_jsxs("div", { className: "flex flex-col gap-2", children: [_jsx("p", { className: "text-xs text-red-400 font-mono break-all", children: error }), _jsx("button", { onClick: onSubmit, disabled: loading, className: "w-full py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold transition-colors", children: "Retry" })] }))] }));
}
//# sourceMappingURL=Step5Submit.js.map