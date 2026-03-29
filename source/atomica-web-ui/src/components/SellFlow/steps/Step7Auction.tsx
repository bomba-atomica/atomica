import { useEffect } from "react";

interface Props {
  loading: boolean;
  error?: string;
  amount?: bigint;
  minPrice?: bigint;
  unlockTime?: number;
  txHash?: string;
  onCreateAuction: () => Promise<void>;
}

export function Step7Auction({
  loading,
  error,
  amount,
  minPrice,
  unlockTime: _unlockTime,
  txHash,
  onCreateAuction,
}: Props) {
  // Auto-create on mount
  useEffect(() => {
    if (!loading && !error) {
      onCreateAuction();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const amountFormatted = amount
    ? (Number(amount) / 1e18).toFixed(4) + " FETH"
    : "…";
  const priceFormatted = minPrice
    ? "$" + (Number(minPrice) / 1e6).toFixed(2)
    : "…";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-400">
        Creating auction for {amountFormatted} with min price {priceFormatted}.
        Sign the SIWE message in MetaMask.
      </p>

      {!error && (
        <div
          data-testid="auction-spinner"
          className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-950/60 p-3"
        >
          <div className="w-4 h-4 border-2 border-zinc-500 border-t-zinc-200 rounded-full animate-spin flex-shrink-0" />
          <span className="text-sm text-zinc-400">
            {loading ? "Creating auction…" : "Preparing…"}
          </span>
        </div>
      )}

      {txHash && (
        <div
          data-testid="auction-tx-hash"
          className="text-xs text-zinc-600 font-mono break-all"
        >
          Tx: {txHash}
        </div>
      )}

      {error && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-red-400 font-mono break-all">{error}</p>
          <button
            onClick={onCreateAuction}
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
