/**
 * SettlementStatus — Cross-chain settlement state for a given auction window.
 *
 * Polls `queryAuctionSettledEvents` from bridge.ts on a configurable interval
 * and displays settled / pending state for the provided windowId and pair.
 *
 * Wired to live on-chain data via bridge.ts (issue #113).
 *
 * @see docs/architecture/v0-architecture.md §3 — Cross-Chain Settlement
 * @see atomica-sdk/src/settlement/bridge.ts
 */

import { useEffect, useState } from "react";
import {
  queryAuctionSettledEvents,
  type AuctionSettledEvent,
  type BridgeConfig,
  type Pair,
} from "@atomica/sdk/settlement/bridge";

// Safe env access: works in Vite browser builds and Node tests.
const _env =
  (import.meta as { env?: Record<string, string> }).env || process.env || {};

/**
 * Default bridge config derived from Vite environment variables.
 * In production the relayer handles settlement; this is used for read-only
 * event polling in the UI (issue #113 will wire full read path).
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
  // The UI does not have a relayer private key — settlement is relayer-driven.
  // Any call to submitSettlement from the UI will fail with NotTrustedRelayer.
  relayerPrivateKey: "",
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SettlementStatusProps {
  /** Auction window identifier to query. */
  windowId: bigint;
  /** Trading pair descriptor. */
  pair: Pair;
  /** Poll interval in milliseconds. Defaults to 10 000 ms. */
  pollIntervalMs?: number;
}

// ─── Internal state ───────────────────────────────────────────────────────────

type SettlementState =
  | { status: "pending" }
  | { status: "settled"; events: AuctionSettledEvent[] }
  | { status: "error"; message: string };

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * SettlementStatus polls for AuctionSettled events and renders the result.
 *
 * Uses the live `queryAuctionSettledEvents` implementation from bridge.ts (#112).
 * Handles transient errors gracefully and shows an "unavailable" state.
 */
export function SettlementStatus({
  windowId,
  pair,
  pollIntervalMs = 10_000,
}: SettlementStatusProps) {
  const [state, setState] = useState<SettlementState>({ status: "pending" });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const events = await queryAuctionSettledEvents(
          windowId,
          pair,
          DEFAULT_UI_BRIDGE_CONFIG,
        );
        if (!cancelled) {
          setState({ status: "settled", events });
        }
      } catch (err) {
        if (!cancelled) {
          setState({
            status: "error",
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    // Initial fetch
    poll();

    const timer = setInterval(poll, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [windowId, pair, pollIntervalMs]);

  return (
    <div
      data-testid="settlement-status"
      className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3"
    >
      <p className="text-xs uppercase tracking-wider text-zinc-500">
        Settlement Status
      </p>

      {state.status === "pending" && (
        <div data-testid="settlement-status-pending">
          <p className="text-xs text-zinc-600">Checking settlement…</p>
        </div>
      )}

      {state.status === "settled" && (
        <div
          data-testid="settlement-status-settled"
          className="flex flex-col gap-2"
        >
          {state.events.length === 0 ? (
            <p className="text-xs text-zinc-500">
              No settled events for this window.
            </p>
          ) : (
            state.events.map((ev, i) => (
              <div
                key={i}
                className="rounded border border-emerald-900/40 bg-emerald-950/20 px-2 py-1.5 text-xs text-emerald-400"
              >
                <span className="font-mono">
                  Window {ev.windowId.toString()} — {ev.winnerCount.toString()}{" "}
                  winner(s), clearing price {ev.clearingPrice.toString()}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {state.status === "error" && (
        <div
          data-testid="settlement-status-error"
          className="rounded border border-amber-900/60 bg-amber-950/20 px-2 py-1.5 text-xs text-amber-400"
        >
          {state.message}
        </div>
      )}
    </div>
  );
}
