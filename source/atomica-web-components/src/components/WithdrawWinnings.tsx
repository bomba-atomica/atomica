/**
 * WithdrawWinnings — Settlement payout status for settled windows.
 *
 * Read-only. Nothing pushes payouts: after a window settles, any wallet
 * carries its validator-signed `AuctionOutcome` to the LockBox and releases
 * each lock per its leaf (UnwindButton, "Carry Outcome and Release Locks").
 * A lock whose outcome is never proven goes home by reclaim after its
 * deadline (ReclaimLockButton). There is no relayer.
 *
 * @see docs/architecture/v0-architecture.md §3 — Cross-Chain Settlement
 * @see atomica-sdk/src/settlement/outcome-carrier.ts
 */

import type { AuctionSettledEvent } from "@atomica/sdk/settlement/bridge";
import { formatPrice } from "@atomica/sdk";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface WithdrawWinningsProps {
  /** AuctionSettled events read from Aptos (see SettlementStatus). */
  events: AuctionSettledEvent[];
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * WithdrawWinnings lists settled windows and says how their payouts reach
 * Ethereum: by an outcome proof that anyone carries, never by a relayer.
 */
export function WithdrawWinnings({ events }: WithdrawWinningsProps) {
  return (
    <div
      data-testid="withdraw-winnings"
      className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3"
    >
      <p className="text-xs uppercase tracking-wider text-zinc-500">
        Settlement Payout
      </p>

      {events.length === 0 ? (
        <p
          data-testid="withdraw-winnings-no-events"
          className="text-xs text-zinc-600"
        >
          No settled events to display.
        </p>
      ) : (
        <div
          data-testid="withdraw-winnings-events"
          className="flex flex-col gap-2"
        >
          {events.map((ev, i) => (
            <div
              key={i}
              className="rounded border border-emerald-900/40 bg-emerald-950/20 px-2 py-1.5 text-xs text-emerald-400"
            >
              <span className="font-mono">
                Window {ev.windowId.toString()} — {ev.winnerCount.toString()}{" "}
                winner(s), clearing price {formatPrice(ev.clearingPrice)}
              </span>
              <p className="mt-1 text-emerald-600">
                Settled on Aptos. Carry the outcome to Ethereum to release the
                locks.
              </p>
            </div>
          ))}
        </div>
      )}

      <p
        data-testid="withdraw-winnings-push-notice"
        className="text-xs text-zinc-600"
      >
        Payouts reach Ethereum when any wallet carries the validator-signed
        outcome proof to the LockBox. A lock with no proven outcome returns to
        its depositor after its deadline.
      </p>
    </div>
  );
}
