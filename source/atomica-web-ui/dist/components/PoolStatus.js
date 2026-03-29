import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * PoolStatus — Auction pool metrics from both chains.
 *
 * Shows total FakeETH locked on Ethereum, lock receipts proven on Aptos,
 * and flags divergence (ETH > Receipts = pending proofs; Receipts > ETH = anomaly).
 *
 * Note: Aptos receipt count is stubbed at 0 until I-D4 infrastructure lands.
 */
import { ethers } from "ethers";
import { useAuctionPoolTotals } from "../hooks/useAuctionPoolTotals";
export function PoolStatus() {
    const { totalLockedEth, totalReceipts, loading, error } = useAuctionPoolTotals();
    const ethFormatted = ethers.formatEther(totalLockedEth);
    // Divergence: ETH locked but no receipt = proof pending
    // Receipts > ETH locked = anomaly (should never happen)
    const hasDivergence = totalLockedEth > 0n && totalReceipts === 0;
    return (_jsxs("div", { className: "bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3", children: [_jsx("p", { className: "text-xs uppercase tracking-wider text-zinc-500", children: "Pool Status" }), loading ? (_jsx("p", { className: "text-xs text-zinc-600", children: "Loading\u2026" })) : error ? (_jsx("p", { className: "text-xs text-red-400 font-mono break-all", children: error })) : (_jsxs("div", { className: "flex flex-col gap-2", children: [_jsxs("div", { className: "flex justify-between text-sm", children: [_jsx("span", { className: "text-zinc-500", children: "ETH locked" }), _jsxs("span", { className: "text-zinc-200 font-mono", children: [ethFormatted, " FETH"] })] }), _jsxs("div", { className: "flex justify-between text-sm", children: [_jsx("span", { className: "text-zinc-500", children: "Receipts on Aptos" }), _jsxs("span", { className: "text-zinc-400 font-mono", children: [totalReceipts, _jsx("span", { className: "ml-1 text-xs text-zinc-600", children: "(pending infra)" })] })] }), hasDivergence && (_jsx("div", { className: "mt-1 rounded border border-amber-900/60 bg-amber-950/20 px-2 py-1.5 text-xs text-amber-400", children: "ETH locked but no receipts proven \u2014 proofs may be pending." }))] }))] }));
}
//# sourceMappingURL=PoolStatus.js.map