import { useState, useEffect } from "react";
import { getWindowDeadlineUs } from "@atomica/sdk/aptos";
import { SettleButton } from "../../SettleButton";
// SCOUT(#236) REMOVE: ClaimButton import; import the open step and ReleaseButton.
import { ClaimButton } from "../../ClaimButton";
import { BidHistory } from "../../BidHistory";
import { useBidHistory } from "../../../hooks/useBidHistory";

interface Props {
  amount?: bigint;
  auctionEndTime?: number;
  unlockTime?: number;
  /** @deprecated v0 Beta — use windowId + pairBcs instead */
  sellerAddress?: string | null;
  /** v0 Beta: auction window ID (from auction::current_window_id) */
  windowId?: bigint | null;
  /** v0 Beta: BCS-encoded Pair struct */
  pairBcs?: Uint8Array | null;
  onCancelAndUnlock: () => Promise<void>;
  loading: boolean;
  error?: string;
}

function useCountdown(endTime?: number) {
  const [remaining, setRemaining] = useState<number>(0);

  useEffect(() => {
    if (!endTime) return;

    const update = () => {
      const now = Math.floor(Date.now() / 1000);
      setRemaining(Math.max(0, endTime - now));
    };

    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [endTime]);

  return remaining;
}

/**
 * The window timelock deadline in unix seconds, read from the chain
 * (`auction::window_deadline_us`). Without a window id, or until the view
 * answers, it is `fallback`.
 */
function useWindowDeadline(windowId?: bigint | null, fallback?: number) {
  const [deadline, setDeadline] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (windowId === undefined || windowId === null) return;
    let cancelled = false;
    getWindowDeadlineUs(windowId)
      .then((us) => {
        if (!cancelled) setDeadline(Number(us / 1_000_000n));
      })
      .catch(() => {
        // The window has no timelock yet: keep the fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [windowId]);

  return deadline ?? fallback;
}

function useIsUnlocked(unlockTime?: number) {
  const [isUnlocked, setIsUnlocked] = useState(() => {
    if (!unlockTime || unlockTime <= 0) return false;
    const now = Math.floor(Date.now() / 1000);
    return now >= unlockTime;
  });

  useEffect(() => {
    if (!unlockTime || unlockTime <= 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsUnlocked(false);
      return;
    }

    const check = () => {
      const now = Math.floor(Date.now() / 1000);
      setIsUnlocked(now >= unlockTime);
    };

    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [unlockTime]);

  return isUnlocked;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "Ended";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function Step8Monitor({
  amount,
  auctionEndTime,
  unlockTime,
  sellerAddress,
  windowId,
  pairBcs,
  onCancelAndUnlock,
  loading,
  error,
}: Props) {
  // The countdown ends at the chain's window timelock deadline.
  const endTime = useWindowDeadline(windowId, auctionEndTime);
  const remaining = useCountdown(endTime);
  const canUnlock = useIsUnlocked(unlockTime);
  // SCOUT(#236) EDIT: the badge says Settled as soon as the local clock ends; drive open, settle and release from chain state.
  const ended = remaining === 0 && endTime !== undefined;
  const { entries: bidHistoryEntries, recordSettlement } = useBidHistory(
    sellerAddress ?? null,
  );

  const amountFormatted = amount
    ? (Number(amount) / 1e18).toFixed(4) + " FETH"
    : "—";
  // SCOUT(#217) EDIT: price display divides by 1e6.

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border border-zinc-800 bg-zinc-950/60 p-4 flex flex-col gap-3">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Locked amount</span>
          <span className="text-zinc-200 font-mono">{amountFormatted}</span>
        </div>
        {sellerAddress && (
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Seller address</span>
            <span
              data-testid="auction-seller-address"
              className="text-zinc-200 font-mono text-xs truncate max-w-[180px]"
              title={sellerAddress}
            >
              {sellerAddress}
            </span>
          </div>
        )}
        <div className="h-px bg-zinc-800" />
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Auction closes in</span>
          <span
            data-testid="auction-countdown"
            className={`font-mono ${ended ? "text-zinc-500" : "text-zinc-200"}`}
          >
            {endTime ? formatDuration(remaining) : "—"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Status</span>
          <span
            data-testid="auction-status-badge"
            className={`text-xs px-2 py-0.5 rounded ${
              ended ? "bg-zinc-700 text-zinc-400" : "bg-zinc-800 text-zinc-300"
            }`}
          >
            {ended ? "Settled" : "Active"}
          </span>
        </div>
      </div>

      {/* SCOUT(#236) EDIT: SellFlow passes no windowId and no pairBcs, so this never renders in the sell flow; add the open step before settle. */}
      {ended && windowId != null && pairBcs != null && (
        <SettleButton
          windowId={windowId}
          pairBcs={pairBcs}
          auctionEndTime={auctionEndTime}
          onSettled={(wid, cp) => recordSettlement(wid.toString(), cp)}
        />
      )}

      {/* SCOUT(#236) REMOVE: ClaimButton; mount ReleaseButton here. */}
      {ended && windowId != null && pairBcs != null && (
        <ClaimButton
          windowId={windowId}
          pairBcs={pairBcs}
          sellerAddress={sellerAddress ?? undefined}
        />
      )}

      {/* Bid History — always visible in monitoring step */}
      <div className="mt-2">
        <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">
          Settlement History
        </h3>
        <BidHistory entries={bidHistoryEntries} />
      </div>

      {canUnlock && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-zinc-500">
            Your lock period has expired. You may cancel and reclaim your
            tokens.
          </p>
          <button
            onClick={onCancelAndUnlock}
            disabled={loading}
            className={`w-full py-2 rounded text-sm font-semibold border transition-colors ${
              loading
                ? "bg-zinc-900 border-zinc-800 text-zinc-600 cursor-not-allowed"
                : "bg-transparent border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-300"
            }`}
          >
            {loading ? "Unlocking…" : "Cancel & Unlock"}
          </button>
          {error && (
            <p className="text-xs text-red-400 font-mono break-all">{error}</p>
          )}
        </div>
      )}
    </div>
  );
}
