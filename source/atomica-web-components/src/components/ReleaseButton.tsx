import { formatUnits } from "ethers";
import { useWallet } from "../context/WalletContext";
import {
  useWindowRelease,
  type WindowLockRelease,
} from "../hooks/useWindowRelease";
import type { WindowReleaseResult } from "@atomica/sdk/settlement/window-release";

/** Props of ReleaseButton. */
export interface ReleaseButtonProps {
  /** Auction window id. */
  windowId: bigint;
  /** Pair bytes of the window key. */
  pairBcs: Uint8Array;
  /** How often to re-read the locks. Defaults to 10 000 ms. */
  pollIntervalMs?: number;
}

const DECIMALS: Record<WindowLockRelease["asset"], number> = {
  FakeETH: 18,
  FakeUSD: 6,
};

function short(hex: string): string {
  return `${hex.slice(0, 10)}…`;
}

function describeResult(result: WindowReleaseResult): string {
  if (result.carry?.status === "unprovable") {
    return `The outcome cannot be proven now (${result.carry.reason}). Each lock goes home by Reclaim after its deadline.`;
  }
  if (result.carry?.status === "stale-light-client") {
    return "The Ethereum light client passed its age limit, so no outcome can be recorded. Each lock goes home by Reclaim after its deadline.";
  }
  const reclaimed = result.reclaimed.length
    ? ` Returned ${result.reclaimed.length} unpayable lock(s) to their depositors.`
    : "";
  return `Released ${result.released.length} lock(s).${reclaimed}`;
}

/**
 * ReleaseButton — the third step of a trade: open, settle, release.
 *
 * Once the window settled on Aptos, Release carries its `AuctionOutcome` to
 * the Ethereum LockBox when LockBox does not hold it yet, then pays out every
 * lock that is still open per its outcome leaf (`releaseByOutcome`). A lock
 * whose leaf is unpayable goes back whole to its depositor
 * (`reclaimUnpayable`). After release the winner holds the seller's FakeETH
 * and the seller holds the winner's FakeUSD on Ethereum.
 *
 * It lists every lock of the window (seller locks, then bid collateral
 * locks) with its asset, its leaf payouts and its LockBox status, and
 * re-reads them after each action. It is disabled when no lock is open.
 * Anyone may press it, so no prop names a seller or a bidder. A stuck or
 * unwound window goes through UnwindButton instead.
 *
 * @see ../hooks/useWindowRelease.ts
 */
export function ReleaseButton({
  windowId,
  pairBcs,
  pollIntervalMs,
}: ReleaseButtonProps) {
  const { account } = useWallet();
  const state = useWindowRelease(windowId, pairBcs, account, pollIntervalMs);
  const anyOpen = state.locks.some((l) => l.status === "open");
  const enabled = !!account && state.settled && anyOpen && !state.releasing;

  let note: string;
  if (state.loading) note = "Reading the window's locks…";
  else if (!state.settled) note = "Release opens once the window settles.";
  else if (state.locks.length === 0) note = "This window holds no locks.";
  else if (state.allReleased) note = "Every lock of this window is closed.";
  else
    note = state.outcomeRecorded
      ? "The outcome is on Ethereum. Release pays each open lock."
      : "Release records the outcome on Ethereum, then pays each open lock.";

  return (
    <div data-testid="release" className="flex flex-col gap-2">
      <button
        data-testid="release-button"
        onClick={() => void state.release()}
        disabled={!enabled}
        className={`w-full py-2 rounded font-semibold text-sm transition-colors ${
          enabled
            ? "bg-zinc-100 hover:bg-white text-zinc-900"
            : "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
        }`}
      >
        {state.releasing ? "Releasing…" : "Release Locks"}
      </button>
      <div data-testid="release-note" className="text-xs text-zinc-500">
        {note}
      </div>
      {state.locks.length > 0 && (
        <ul data-testid="release-locks" className="text-xs font-mono space-y-1">
          {state.locks.map((l) => (
            <li
              key={l.lockId}
              data-testid="release-lock"
              data-lock-id={l.lockId}
              data-status={l.status}
              className="flex flex-col gap-0.5 p-2 bg-zinc-950 rounded border border-zinc-800"
            >
              <span className="flex justify-between">
                <span className="text-zinc-400">
                  {l.asset} {short(l.lockId)}
                  {l.amount !== null &&
                    ` ${formatUnits(l.amount, DECIMALS[l.asset])}`}
                </span>
                <span
                  data-testid="release-lock-status"
                  className="text-zinc-300"
                >
                  {l.status}
                </span>
              </span>
              {l.payouts.map((p, i) => (
                <span key={i} className="text-zinc-500">
                  → {short(p.recipient)}{" "}
                  {formatUnits(p.amount, DECIMALS[l.asset])}
                </span>
              ))}
            </li>
          ))}
        </ul>
      )}
      {state.result && (
        <div
          data-testid="release-status"
          className="text-xs font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800"
        >
          {describeResult(state.result)}
        </div>
      )}
      {state.error && (
        <div data-testid="release-error" className="text-xs text-amber-400">
          {state.error}
        </div>
      )}
    </div>
  );
}
