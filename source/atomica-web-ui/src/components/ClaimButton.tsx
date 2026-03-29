import { useState } from "react";

interface Props {
  onClaim: () => Promise<void>;
  onReclaim: () => Promise<void>;
  isWinner?: boolean;
  disabled?: boolean;
}

export function ClaimButton({ onClaim, onReclaim, isWinner, disabled }: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleClaim = async () => {
    setLoading(true);
    setStatus("Claiming…");
    try {
      await onClaim();
      setStatus("Claimed");
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReclaim = async () => {
    setLoading(true);
    setStatus("Reclaiming…");
    try {
      await onReclaim();
      setStatus("Reclaimed");
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          data-testid="claim-button"
          onClick={handleClaim}
          disabled={loading || disabled || !isWinner}
          className={`flex-1 py-2 rounded font-semibold text-sm transition-colors ${
            loading || disabled || !isWinner
              ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
              : "bg-zinc-100 hover:bg-white text-zinc-900"
          }`}
        >
          Claim
        </button>
        <button
          data-testid="reclaim-button"
          onClick={handleReclaim}
          disabled={loading || disabled || isWinner}
          className={`flex-1 py-2 rounded font-semibold text-sm transition-colors ${
            loading || disabled || isWinner
              ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
              : "bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
          }`}
        >
          Reclaim
        </button>
      </div>
      {status && (
        <div className="text-xs font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800">
          {status}
        </div>
      )}
    </div>
  );
}
