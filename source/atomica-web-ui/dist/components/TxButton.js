import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { prepareNativeTransaction, simulateNativeTransaction, submitPreparedTransaction, } from "@atomica/aptos-docker-testnet/browser";
import { ChevronDownIcon, XCircleIcon, CheckCircleIcon, } from "@heroicons/react/24/solid";
/**
 * TxButton
 *
 * A comprehensive transaction submission button that manages the full transaction lifecycle
 * for Aptos interactions. It offers two modes of operation:
 *
 * 1. **Standard Flow** (Primary Button):
 *    - **Simulate**: First prepares and simulates the transaction to estimate gas and verify success.
 *    - **Review**: Displays simulation results (gas used, status).
 *    - **Submit**: Allows the user to confirm and submit the transaction after simulation.
 *
 * 2. **Skip & Submit Flow** (Dropdown Menu):
 *    - Accessed via the chevron dropdown.
 *    - **Skip Simulation**: Bypasses the simulation phase entirely.
 *    - **Direct Submit**: Immediately prepares and submits the transaction.
 *    - Useful for cases where simulation is unreliable or speed is prioritized.
 *
 * The component handles all internal states (idle, preparing, simulating, ready, submitting, success, error)
 * and provides visual feedback for each stage.
 */
export function TxButton({ label, accountAddress, prepareTransaction, onSuccess, className = "", disabled = false, }) {
    const [phase, setPhase] = useState("idle");
    const [error, setError] = useState(null);
    const [simulationDetails, setSimulationDetails] = useState(null);
    const [preparedTx, setPreparedTx] = useState(null);
    const [showDropdown, setShowDropdown] = useState(false);
    const handleSimulate = async () => {
        try {
            setPhase("preparing");
            setError(null);
            const payloadOrPromise = prepareTransaction();
            const payload = payloadOrPromise instanceof Promise
                ? await payloadOrPromise
                : payloadOrPromise;
            const prepared = await prepareNativeTransaction(accountAddress, payload);
            setPreparedTx(prepared);
            setPhase("simulating");
            const result = await simulateNativeTransaction(prepared);
            setSimulationDetails({
                gasUsed: result.gas_used,
                success: result.success,
                vmStatus: result.vm_status,
            });
            if (result.success) {
                setPhase("ready");
            }
            else {
                setPhase("error");
                setError(`Simulation Failed: ${result.vm_status}`);
            }
        }
        catch (e) {
            setPhase("error");
            setError(e instanceof Error ? e.message : "Simulation error");
            console.error(e);
        }
    };
    const handleSubmit = async () => {
        if (!preparedTx)
            return;
        try {
            setPhase("submitting");
            const pendingTx = await submitPreparedTransaction(preparedTx);
            setPhase("success");
            onSuccess(pendingTx.hash);
            // Reset after success? Maybe let parent handle or keep success state
            setTimeout(() => {
                setPhase("idle");
                setPreparedTx(null);
                setSimulationDetails(null);
            }, 3000);
        }
        catch (e) {
            setPhase("error");
            setError(e instanceof Error ? e.message : "Submission error");
        }
    };
    const handleSkipAndSubmit = async () => {
        setShowDropdown(false);
        try {
            setPhase("preparing"); // skip simulation but still need to prepare
            setError(null);
            const payloadOrPromise = prepareTransaction();
            const payload = payloadOrPromise instanceof Promise
                ? await payloadOrPromise
                : payloadOrPromise;
            // If we already have preparedTx (e.g. from failed simulation), use it?
            // Safest to re-prepare if we are "skipping" to ensure fresh state, or use prepareNativeTransaction directly
            setPhase("submitting"); // Go straight to submitting (prepare is implicit in submitNativeTransaction or manual)
            // We can use submitNativeTransaction wrapper which handles prepare -> submit internally if we didn't prepare yet
            // But we want to ensure we SKIP simulation
            // Let's prepare then submit directly
            const prepared = await prepareNativeTransaction(accountAddress, payload);
            const pendingTx = await submitPreparedTransaction(prepared);
            setPhase("success");
            onSuccess(pendingTx.hash);
            setTimeout(() => {
                setPhase("idle");
                setPreparedTx(null);
            }, 3000);
        }
        catch (e) {
            setPhase("error");
            setError(e instanceof Error ? e.message : "Submission error");
        }
    };
    const getMainButtonAction = () => {
        if (phase === "idle" || phase === "error")
            return handleSimulate;
        if (phase === "ready")
            return handleSubmit;
        return () => { };
    };
    const getMainButtonText = () => {
        switch (phase) {
            case "idle":
                return `Simulate ${label}`;
            case "preparing":
                return "Preparing...";
            case "simulating":
                return "Simulating...";
            case "ready":
                return `Submit ${label}`;
            case "submitting":
                return "Submitting...";
            case "success":
                return "Success";
            case "error":
                return "Retry Simulation";
        }
    };
    const isBusy = phase === "preparing" || phase === "simulating" || phase === "submitting";
    return (_jsxs("div", { className: `relative inline-flex flex-col items-start ${className}`, children: [_jsxs("div", { className: "flex w-full", children: [_jsx("button", { "data-testid": "tx-button-main", onClick: getMainButtonAction(), disabled: disabled || isBusy || phase === "success", className: `
            flex-grow px-4 py-2 font-bold rounded-l-md transition-colors border-r border-zinc-900/10
            ${phase === "error"
                            ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                            : phase === "success"
                                ? "bg-zinc-800 text-zinc-400"
                                : phase === "ready"
                                    ? "bg-zinc-100 text-zinc-950 hover:bg-white"
                                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"}
            ${disabled || isBusy ? "opacity-50 cursor-not-allowed" : ""}
          `, children: _jsxs("div", { className: "flex items-center justify-center gap-2", children: [isBusy && (_jsxs("svg", { className: "animate-spin h-4 w-4 text-zinc-400", xmlns: "http://www.w3.org/2000/svg", fill: "none", viewBox: "0 0 24 24", children: [_jsx("circle", { className: "opacity-25", cx: "12", cy: "12", r: "10", stroke: "currentColor", strokeWidth: "4" }), _jsx("path", { className: "opacity-75", fill: "currentColor", d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" })] })), getMainButtonText()] }) }), _jsxs("div", { className: "relative", children: [_jsx("button", { "data-testid": "tx-button-dropdown", onClick: () => !isBusy && setShowDropdown(!showDropdown), disabled: disabled || isBusy, className: `
                h-full px-2 rounded-r-md transition-colors
                ${phase === "error"
                                    ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                                    : phase === "success"
                                        ? "bg-zinc-800 text-zinc-400"
                                        : phase === "ready"
                                            ? "bg-zinc-100 text-zinc-950 hover:bg-white"
                                            : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"}
                ${disabled || isBusy ? "opacity-50 cursor-not-allowed" : ""}
            `, children: _jsx(ChevronDownIcon, { className: "w-5 h-5 opacity-70" }) }), showDropdown && (_jsx("div", { className: "absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-md shadow-xl z-50", children: _jsx("div", { className: "py-1", children: _jsx("button", { "data-testid": "tx-button-skip-submit", onClick: handleSkipAndSubmit, className: "block w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800", children: "Skip & Submit" }) }) }))] })] }), (phase === "ready" || phase === "error") && simulationDetails && (_jsxs("div", { className: `mt-2 text-xs flex items-center gap-1 ${phase === "error" ? "text-zinc-500" : "text-zinc-500"}`, children: [phase === "error" ? (_jsx(XCircleIcon, { className: "w-4 h-4" })) : (_jsx(CheckCircleIcon, { className: "w-4 h-4" })), _jsxs("span", { className: "font-mono", children: ["Gas: ", simulationDetails.gasUsed] })] })), error && !simulationDetails && (_jsx("div", { className: "mt-2 text-xs text-zinc-500 max-w-[200px] break-words font-mono", children: error }))] }));
}
//# sourceMappingURL=TxButton.js.map