import { useState } from "react";
import {
  prepareNativeTransaction,
  simulateNativeTransaction,
  submitPreparedTransaction,
} from "../lib/aptos";
import type { PreparedTransaction } from "../lib/aptos";
import type { InputGenerateTransactionPayloadData } from "@aptos-labs/ts-sdk";
import {
  ChevronDownIcon,
  XCircleIcon,
  CheckCircleIcon,
} from "@heroicons/react/24/solid";

interface TxButtonProps {
  label: string;
  accountAddress: string; // the eth address
  prepareTransaction: () =>
    | Promise<InputGenerateTransactionPayloadData>
    | InputGenerateTransactionPayloadData;
  onSuccess: (hash: string) => void;
  className?: string;
  disabled?: boolean;
}

type Phase =
  | "idle"
  | "preparing"
  | "simulating"
  | "ready"
  | "submitting"
  | "success"
  | "error";

export function TxButton({
  label,
  accountAddress,
  prepareTransaction,
  onSuccess,
  className = "",
  disabled = false,
}: TxButtonProps) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [simulationDetails, setSimulationDetails] = useState<{
    gasUsed: string;
    success: boolean;
    vmStatus: string;
  } | null>(null);
  const [preparedTx, setPreparedTx] = useState<PreparedTransaction | null>(
    null,
  );
  const [showDropdown, setShowDropdown] = useState(false);

  const handleSimulate = async () => {
    try {
      setPhase("preparing");
      setError(null);

      const payloadOrPromise = prepareTransaction();
      const payload =
        payloadOrPromise instanceof Promise
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
      } else {
        setPhase("error");
        setError(`Simulation Failed: ${result.vm_status}`);
      }
    } catch (e: unknown) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Simulation error");
      console.error(e);
    }
  };

  const handleSubmit = async () => {
    if (!preparedTx) return;
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
    } catch (e: unknown) {
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
      const payload =
        payloadOrPromise instanceof Promise
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
    } catch (e: unknown) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Submission error");
    }
  };

  const getMainButtonAction = () => {
    if (phase === "idle" || phase === "error") return handleSimulate;
    if (phase === "ready") return handleSubmit;
    return () => {};
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

  const isBusy =
    phase === "preparing" || phase === "simulating" || phase === "submitting";

  return (
    <div className={`relative inline-flex flex-col items-start ${className}`}>
      <div className="flex w-full">
        <button
          onClick={getMainButtonAction()}
          disabled={disabled || isBusy || phase === "success"}
          className={`
            flex-grow px-4 py-2 font-bold rounded-l-md transition-colors border-r border-zinc-900/10
            ${
              phase === "error"
                ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                : phase === "success"
                  ? "bg-zinc-800 text-zinc-400"
                  : phase === "ready"
                    ? "bg-zinc-100 text-zinc-950 hover:bg-white"
                    : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
            }
            ${disabled || isBusy ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          <div className="flex items-center justify-center gap-2">
            {isBusy && (
              <svg
                className="animate-spin h-4 w-4 text-zinc-400"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            )}
            {getMainButtonText()}
          </div>
        </button>

        <div className="relative">
          <button
            onClick={() => !isBusy && setShowDropdown(!showDropdown)}
            disabled={disabled || isBusy}
            className={`
                h-full px-2 rounded-r-md transition-colors
                ${
                  phase === "error"
                    ? "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"
                    : phase === "success"
                      ? "bg-zinc-800 text-zinc-400"
                      : phase === "ready"
                        ? "bg-zinc-100 text-zinc-950 hover:bg-white"
                        : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                }
                ${disabled || isBusy ? "opacity-50 cursor-not-allowed" : ""}
            `}
          >
            <ChevronDownIcon className="w-5 h-5 opacity-70" />
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-zinc-900 border border-zinc-800 rounded-md shadow-xl z-50">
              <div className="py-1">
                <button
                  onClick={handleSkipAndSubmit}
                  className="block w-full text-left px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  Skip & Submit
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Simulation Result / Error Details */}
      {(phase === "ready" || phase === "error") && simulationDetails && (
        <div
          className={`mt-2 text-xs flex items-center gap-1 ${phase === "error" ? "text-zinc-500" : "text-zinc-500"}`}
        >
          {phase === "error" ? (
            <XCircleIcon className="w-4 h-4" />
          ) : (
            <CheckCircleIcon className="w-4 h-4" />
          )}
          <span className="font-mono">Gas: {simulationDetails.gasUsed}</span>
        </div>
      )}

      {error && !simulationDetails && (
        <div className="mt-2 text-xs text-zinc-500 max-w-[200px] break-words font-mono">
          {error}
        </div>
      )}
    </div>
  );
}
