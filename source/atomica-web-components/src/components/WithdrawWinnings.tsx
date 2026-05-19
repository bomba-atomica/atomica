/**
 * WithdrawWinnings — Trigger cross-chain settlement for a winning bid.
 *
 * Calls `submitSettlement` from bridge.ts, which forwards to
 * `BLSVerifierTestnet.sol::authorizeSettlement` then `Settlement.sol`.
 *
 * Scaffold: `submitSettlement` throws NOT_IMPLEMENTED until the full
 * bridge.ts implementation lands.  The button is rendered disabled with an
 * explanatory label when the NOT_IMPLEMENTED guard fires.
 *
 * @see docs/architecture/v0-architecture.md §3 — Cross-Chain Settlement
 * @see #89 — Phase 3d scaffold
 * @see atomica-sdk/src/settlement/bridge.ts
 */

import { useState } from "react";
import {
  submitSettlement,
  type AuctionSettledEvent,
  type BridgeConfig,
} from "@atomica/sdk/settlement/bridge";

// Safe env access: works in Vite browser builds and Node tests.
const _env =
  (import.meta as { env?: Record<string, string> }).env || process.env || {};

/**
 * Default bridge config derived from Vite environment variables.
 * The relayer private key is intentionally empty — settlement is relayer-driven.
 * The WithdrawWinnings component will receive NOT_IMPLEMENTED or NotTrustedRelayer
 * unless wired to a proper signer (issue #113).
 */
const DEFAULT_UI_BRIDGE_CONFIG: BridgeConfig = {
  aptosRpcUrl: _env.VITE_APTOS_RPC_URL ?? "http://localhost:8080/v1",
  contractAddress:
    _env.VITE_CONTRACT_ADDRESS ??
    "0x0000000000000000000000000000000000000000000000000000000000000000",
  ethRpcUrl: _env.VITE_ETH_RPC_URL ?? "http://localhost:8545",
  blsVerifierAddress:
    _env.VITE_BLS_VERIFIER_ADDRESS ??
    "0x0000000000000000000000000000000000000000",
  // The UI does not hold the relayer key — this will fail with NotTrustedRelayer.
  // Full settlement pull-path wiring is tracked in issue #113.
  relayerPrivateKey: "",
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface WithdrawWinningsProps {
  /** Settled events to submit for payout. */
  events: AuctionSettledEvent[];
  /** Optional callback invoked with the EVM tx hash after success. */
  onSuccess?: (txHash: string) => void;
}

// ─── Internal state ───────────────────────────────────────────────────────────

type TxState =
  | { phase: "idle" }
  | { phase: "submitting" }
  | { phase: "success"; txHash: string }
  | { phase: "error"; message: string }
  | { phase: "not-implemented" };

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * WithdrawWinnings lets a winner trigger settlement payout.
 *
 * Renders disabled with a scaffold notice when `submitSettlement` throws
 * NOT_IMPLEMENTED.
 */
export function WithdrawWinnings({ events, onSuccess }: WithdrawWinningsProps) {
  const [txState, setTxState] = useState<TxState>({ phase: "idle" });

  const isSubmitting = txState.phase === "submitting";
  const isNotImplemented = txState.phase === "not-implemented";

  async function handleWithdraw() {
    setTxState({ phase: "submitting" });
    try {
      const txHash = await submitSettlement(events, DEFAULT_UI_BRIDGE_CONFIG);
      setTxState({ phase: "success", txHash });
      onSuccess?.(txHash);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("NOT_IMPLEMENTED")) {
        setTxState({ phase: "not-implemented" });
      } else {
        setTxState({ phase: "error", message });
      }
    }
  }

  return (
    <div
      data-testid="withdraw-winnings"
      className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3"
    >
      <p className="text-xs uppercase tracking-wider text-zinc-500">
        Withdraw Winnings
      </p>

      <button
        data-testid="withdraw-winnings-button"
        onClick={handleWithdraw}
        disabled={isSubmitting || isNotImplemented || events.length === 0}
        className={[
          "rounded px-4 py-2 text-sm font-medium transition-colors",
          isSubmitting || isNotImplemented || events.length === 0
            ? "cursor-not-allowed bg-zinc-800 text-zinc-600"
            : "bg-emerald-700 text-white hover:bg-emerald-600",
        ].join(" ")}
      >
        {isSubmitting ? "Submitting…" : "Claim winnings"}
      </button>

      {txState.phase === "not-implemented" && (
        <p
          data-testid="withdraw-winnings-not-implemented"
          className="text-xs text-amber-400"
        >
          Settlement submission not yet available (bridge scaffold — issue #89).
        </p>
      )}

      {txState.phase === "success" && (
        <p
          data-testid="withdraw-winnings-success"
          className="text-xs text-emerald-400 font-mono break-all"
        >
          Settled: {txState.txHash}
        </p>
      )}

      {txState.phase === "error" && (
        <p
          data-testid="withdraw-winnings-error"
          className="text-xs text-rose-400 font-mono break-all"
        >
          {txState.message}
        </p>
      )}

      {events.length === 0 && txState.phase === "idle" && (
        <p className="text-xs text-zinc-600">No settled events to withdraw.</p>
      )}
    </div>
  );
}
