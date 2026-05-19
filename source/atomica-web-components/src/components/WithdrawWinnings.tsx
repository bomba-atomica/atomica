/**
 * WithdrawWinnings — Settlement payout status for winning bids.
 *
 * Displays the settlement state for the provided events.  The push path is
 * handled by the trusted relayer via `BLSVerifierTestnet::authorizeSettlement`
 * (see bridge.ts).  Settlement.sol does not implement a winner-initiated pull
 * path — winners see their balance increase after the relayer settles.
 *
 * Risk 3 decision (from scout #111): Option B — read-only status display.
 *
 * @see docs/architecture/v0-architecture.md §3 — Cross-Chain Settlement
 * @see atomica-sdk/src/settlement/bridge.ts — submitSettlement (relayer-side)
 */

import type { AuctionSettledEvent } from "@atomica/sdk/settlement/bridge";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface WithdrawWinningsProps {
  /** Settled events from the BLS relayer for display. */
  events: AuctionSettledEvent[];
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * WithdrawWinnings displays payout status after the relayer settles the auction.
 *
 * Settlement follows a push path: the relayer calls `authorizeSettlement` on
 * BLSVerifierTestnet and winners receive their payout automatically.
 * No user-initiated action is required.
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
                winner(s), clearing price {ev.clearingPrice.toString()}
              </span>
              <p className="mt-1 text-emerald-600">
                Settlement pushed by relayer — payout complete.
              </p>
            </div>
          ))}
        </div>
      )}

      <p
        data-testid="withdraw-winnings-push-notice"
        className="text-xs text-zinc-600"
      >
        Winnings are distributed automatically by the relayer. No action
        required.
      </p>
    </div>
  );
}
