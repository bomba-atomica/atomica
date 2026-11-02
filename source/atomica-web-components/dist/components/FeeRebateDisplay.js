import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function formatUsd(amount) {
    const abs = amount < 0n ? -amount : amount;
    return (Number(abs) / 1e6).toFixed(2);
}
/**
 * Displays the post-settlement fee and rebate for the connected bidder.
 *
 * Renders two rows — Rebate and Fee — using amounts in USD micro-units
 * (6 decimals). Omits a row when its value is `undefined`. In the Demo
 * phase the fee is always 0; the rebate is `bidPrice - clearingPrice`.
 *
 * Driven by {@link useFeeRebate} in the parent component.
 *
 * @see docs/specifications/prd.md
 */
export function FeeRebateDisplay({ rebateAmount, feeAmount }) {
    return (_jsxs("div", { className: "flex flex-col gap-2 rounded border border-zinc-800 bg-zinc-950/60 p-3 text-sm", children: [rebateAmount !== undefined && (_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-zinc-500", children: "Rebate" }), _jsxs("span", { "data-testid": "rebate-amount", className: rebateAmount >= 0n
                            ? "text-green-400 font-mono"
                            : "text-red-400 font-mono", children: [rebateAmount >= 0n ? "+" : "-", "$", formatUsd(rebateAmount)] })] })), feeAmount !== undefined && (_jsxs("div", { className: "flex justify-between", children: [_jsx("span", { className: "text-zinc-500", children: "Fee" }), _jsxs("span", { "data-testid": "fee-amount", className: feeAmount <= 0n
                            ? "text-zinc-400 font-mono"
                            : "text-red-400 font-mono", children: [feeAmount > 0n ? "-" : "+", "$", formatUsd(feeAmount)] })] }))] }));
}
//# sourceMappingURL=FeeRebateDisplay.js.map