import { useState, useEffect } from "react";

interface Props {
  amount?: bigint;
  minPrice?: bigint;
  auctionEndTime?: number;
  unlockTime?: number;
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
  minPrice,
  auctionEndTime,
  unlockTime,
  onCancelAndUnlock,
  loading,
  error,
}: Props) {
  const remaining = useCountdown(auctionEndTime);
  const canUnlock = useIsUnlocked(unlockTime);
  const ended = remaining === 0 && auctionEndTime !== undefined;

  const amountFormatted = amount
    ? (Number(amount) / 1e18).toFixed(4) + " FETH"
    : "—";
  const priceFormatted = minPrice
    ? "$" + (Number(minPrice) / 1e6).toFixed(2)
    : "—";

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded border border-zinc-800 bg-zinc-950/60 p-4 flex flex-col gap-3">
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Locked amount</span>
          <span className="text-zinc-200 font-mono">{amountFormatted}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Min price</span>
          <span className="text-zinc-200 font-mono">{priceFormatted}</span>
        </div>
        <div className="h-px bg-zinc-800" />
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Auction closes in</span>
          <span
            className={`font-mono ${ended ? "text-zinc-500" : "text-zinc-200"}`}
          >
            {auctionEndTime ? formatDuration(remaining) : "—"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-zinc-500">Status</span>
          <span
            className={`text-xs px-2 py-0.5 rounded ${
              ended ? "bg-zinc-700 text-zinc-400" : "bg-zinc-800 text-zinc-300"
            }`}
          >
            {ended ? "Settled" : "Active"}
          </span>
        </div>
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
