import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
const STEPS = [
    { id: "connect", label: "Connect" },
    { id: "lock", label: "Lock" },
    { id: "confirming", label: "Confirm" },
    { id: "generating-proof", label: "Proof" },
    { id: "submitting-proof", label: "Submit" },
    { id: "creating-auction", label: "Auction" },
    { id: "monitoring", label: "Monitor" },
];
const STEP_ORDER = {
    connect: 0,
    lock: 1,
    confirming: 2,
    "generating-proof": 3,
    "submitting-proof": 4,
    "creating-auction": 5,
    monitoring: 6,
};
export function StepIndicator({ current }) {
    const currentIndex = STEP_ORDER[current];
    return (_jsx("div", { className: "flex items-center gap-0 mb-5", children: STEPS.map((step, i) => {
            const isDone = i < currentIndex;
            const isActive = i === currentIndex;
            const isPending = i > currentIndex;
            return (_jsxs("div", { className: "flex items-center flex-1 min-w-0", children: [_jsxs("div", { className: "flex flex-col items-center flex-shrink-0", children: [_jsx("div", { className: `w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border transition-colors ${isDone
                                    ? "bg-zinc-300 border-zinc-300 text-zinc-900"
                                    : isActive
                                        ? "bg-zinc-100 border-zinc-100 text-zinc-900"
                                        : "bg-transparent border-zinc-700 text-zinc-600"}`, children: isDone ? "✓" : i + 1 }), _jsx("span", { className: `text-[9px] mt-0.5 whitespace-nowrap ${isActive
                                    ? "text-zinc-300"
                                    : isDone
                                        ? "text-zinc-400"
                                        : "text-zinc-600"}`, children: step.label })] }), i < STEPS.length - 1 && (_jsx("div", { className: `h-px flex-1 mx-1 transition-colors ${isPending ? "bg-zinc-800" : "bg-zinc-500"}` }))] }, step.id));
        }) }));
}
//# sourceMappingURL=StepIndicator.js.map