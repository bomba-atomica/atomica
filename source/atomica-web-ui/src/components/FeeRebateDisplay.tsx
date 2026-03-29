interface Props {
  /** Rebate amount in USD micro-units (6 decimals). Positive = rebate. */
  rebateAmount?: bigint;
  /** Fee amount in USD micro-units (6 decimals). Positive = fee charged. */
  feeAmount?: bigint;
}

function formatUsd(amount: bigint): string {
  const abs = amount < 0n ? -amount : amount;
  return (Number(abs) / 1e6).toFixed(2);
}

export function FeeRebateDisplay({ rebateAmount, feeAmount }: Props) {
  return (
    <div className="flex flex-col gap-2 rounded border border-zinc-800 bg-zinc-950/60 p-3 text-sm">
      {rebateAmount !== undefined && (
        <div className="flex justify-between">
          <span className="text-zinc-500">Rebate</span>
          <span
            data-testid="rebate-amount"
            className={rebateAmount >= 0n ? "text-green-400 font-mono" : "text-red-400 font-mono"}
          >
            {rebateAmount >= 0n ? "+" : "-"}${formatUsd(rebateAmount)}
          </span>
        </div>
      )}
      {feeAmount !== undefined && (
        <div className="flex justify-between">
          <span className="text-zinc-500">Fee</span>
          <span
            data-testid="fee-amount"
            className={feeAmount <= 0n ? "text-zinc-400 font-mono" : "text-red-400 font-mono"}
          >
            {feeAmount > 0n ? "-" : "+"}${formatUsd(feeAmount)}
          </span>
        </div>
      )}
    </div>
  );
}
