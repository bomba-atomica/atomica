interface Props {
  txHash?: string;
  lockBlock?: number;
}

export function Step3Confirm({ txHash, lockBlock }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-400">
        Waiting for your lock transaction to be included in a block…
      </p>

      <div
        data-testid="confirm-spinner"
        className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-950/60 p-3"
      >
        <div className="w-4 h-4 border-2 border-zinc-500 border-t-zinc-200 rounded-full animate-spin flex-shrink-0" />
        <div className="text-sm text-zinc-400">
          {lockBlock ? (
            <span>
              Locked at block{" "}
              <span className="text-zinc-200 font-mono">{lockBlock}</span> —
              confirming…
            </span>
          ) : (
            <span>Waiting for block inclusion…</span>
          )}
        </div>
      </div>

      {txHash && (
        <div data-testid="confirm-tx-hash" className="text-xs text-zinc-600 font-mono break-all">
          Tx: {txHash}
        </div>
      )}
    </div>
  );
}
