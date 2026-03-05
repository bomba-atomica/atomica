import { useEffect } from "react";

interface Props {
  loading: boolean;
  error?: string;
  amount?: bigint;
  onMint: () => Promise<void>;
}

export function Step6Mint({ loading, error, amount, onMint }: Props) {
  // Auto-mint on mount
  useEffect(() => {
    if (!loading && !error) {
      onMint();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const amountFormatted = amount
    ? (Number(amount) / 1e18).toFixed(4) + " FETH"
    : "…";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-400">
        Minting {amountFormatted} on Atomica from your lock receipt. Sign the
        SIWE message in MetaMask.
      </p>

      {!error && (
        <div className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-950/60 p-3">
          <div className="w-4 h-4 border-2 border-zinc-500 border-t-zinc-200 rounded-full animate-spin flex-shrink-0" />
          <span className="text-sm text-zinc-400">
            {loading ? "Minting…" : "Preparing…"}
          </span>
        </div>
      )}

      {error && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-red-400 font-mono break-all">{error}</p>
          <button
            onClick={onMint}
            disabled={loading}
            className="w-full py-2 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-semibold transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
