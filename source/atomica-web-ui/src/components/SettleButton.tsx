import { useState } from "react";

interface Props {
  auctionId?: string;
  onSettle: () => Promise<void>;
  disabled?: boolean;
}

export function SettleButton({
  auctionId: _auctionId,
  onSettle,
  disabled,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleSettle = async () => {
    setLoading(true);
    setStatus("Settling auction…");
    try {
      await onSettle();
      setStatus("Settled");
    } catch (e: unknown) {
      setStatus(`Error: ${e instanceof Error ? e.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        data-testid="settle-button"
        onClick={handleSettle}
        disabled={loading || disabled}
        className={`w-full py-2 rounded font-semibold text-sm transition-colors ${
          loading || disabled
            ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
            : "bg-zinc-100 hover:bg-white text-zinc-900"
        }`}
      >
        {loading ? "Settling…" : "Settle Auction"}
      </button>
      {status && (
        <div
          data-testid="settle-status"
          className="text-xs font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800"
        >
          {status}
        </div>
      )}
    </div>
  );
}
