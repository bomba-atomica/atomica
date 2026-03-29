import { useEffect } from "react";
import type { LockedBalanceProof } from "../../../lib/ethereum/proofs/generator";

interface Props {
  proof?: LockedBalanceProof;
  loading: boolean;
  error?: string;
  onGenerate: () => Promise<void>;
}

export function Step4Proof({ proof, loading, error, onGenerate }: Props) {
  // Auto-generate on mount
  useEffect(() => {
    if (!proof && !loading && !error) {
      onGenerate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (proof) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-zinc-400">Storage proof generated.</p>
        <div
          data-testid="proof-ready"
          className="rounded border border-zinc-800 bg-zinc-950/60 p-3 text-xs font-mono text-zinc-400 flex flex-col gap-1"
        >
          <div>
            <span className="text-zinc-600">Block:</span> {proof.blockNumber}
          </div>
          <div>
            <span className="text-zinc-600">Amount:</span>{" "}
            {(Number(proof.storageValue) / 1e18).toFixed(4)} FETH
          </div>
          <div>
            <span className="text-zinc-600">Proof nodes:</span>{" "}
            {proof.accountProof.length} account / {proof.storageProof.length}{" "}
            storage
          </div>
          <div className="truncate">
            <span className="text-zinc-600">State root:</span>{" "}
            {proof.stateRoot.slice(0, 18)}…
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-400">
        Generating Ethereum storage proof for your lock…
      </p>

      {!error && (
        <div
          data-testid="proof-spinner"
          className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-950/60 p-3"
        >
          <div className="w-4 h-4 border-2 border-zinc-500 border-t-zinc-200 rounded-full animate-spin flex-shrink-0" />
          <span className="text-sm text-zinc-400">Generating proof…</span>
        </div>
      )}

      {error && (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-red-400 font-mono break-all">{error}</p>
          <button
            onClick={onGenerate}
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
