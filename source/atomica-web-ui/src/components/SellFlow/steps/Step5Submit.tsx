import { useEffect } from "react";

interface Props {
  loading: boolean;
  error?: string;
  onSubmit: () => Promise<void>;
}

export function Step5Submit({ loading, error, onSubmit }: Props) {
  // Auto-submit on mount
  useEffect(() => {
    if (!loading && !error) {
      onSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-400">
        Submitting proof to Atomica. Sign the SIWE message in MetaMask.
      </p>

      {!error && (
        <div
          data-testid="submit-status"
          className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-950/60 p-3"
        >
          <div className="w-4 h-4 border-2 border-zinc-500 border-t-zinc-200 rounded-full animate-spin flex-shrink-0" />
          <span className="text-sm text-zinc-400">
            {loading ? "Submitting…" : "Preparing…"}
          </span>
        </div>
      )}

      {error && (
        <div className="flex flex-col gap-2">
          <p
            data-testid="submit-status"
            className="text-xs text-red-400 font-mono break-all"
          >
            {error}
          </p>
          <button
            data-testid="submit-proof-button"
            onClick={onSubmit}
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
