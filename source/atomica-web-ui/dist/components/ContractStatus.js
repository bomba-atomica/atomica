import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useContractStatus } from "../context/ContractStatusContext";
const STATUS_COLORS = {
    loading: "text-amber-400",
    ready: "text-emerald-400",
    missing: "text-rose-400",
};
const STATUS_LABELS = {
    ready: "deployed",
    loading: "checking…",
    missing: "unavailable",
};
function ChainStatus({ chain, status, }) {
    return (_jsxs("div", { className: "flex items-center gap-1", children: [_jsx("span", { className: "text-zinc-600", children: chain }), _jsx("span", { className: `font-mono text-xs ${STATUS_COLORS[status]}`, children: STATUS_LABELS[status] })] }));
}
export function ContractStatus() {
    const { evmStatus, aptosStatus } = useContractStatus();
    return (_jsxs("div", { className: "text-zinc-500 font-mono text-sm border border-zinc-900 rounded px-3 py-2 bg-zinc-900/50 flex items-center gap-4", children: [_jsx(ChainStatus, { chain: "ETH", status: evmStatus }), _jsx("div", { className: "w-px h-3 bg-zinc-800" }), _jsx(ChainStatus, { chain: "APT", status: aptosStatus })] }));
}
//# sourceMappingURL=ContractStatus.js.map