/**
 * PoolStatus — Auction pool metrics from both chains.
 *
 * Shows total FakeETH locked on Ethereum, lock receipts proven on Aptos,
 * and flags divergence (ETH > Receipts = pending proofs; Receipts > ETH = anomaly).
 *
 * Note: Aptos receipt count is stubbed at 0 until I-D4 infrastructure lands.
 */

import { ethers } from "ethers";
import { useAuctionPoolTotals } from "../hooks/useAuctionPoolTotals";

export function PoolStatus() {
  const { totalLockedEth, totalReceipts, loading, error } =
    useAuctionPoolTotals();

  const ethFormatted = ethers.formatEther(totalLockedEth);

  // Divergence: ETH locked but no receipt = proof pending
  // Receipts > ETH locked = anomaly (should never happen)
  const hasDivergence = totalLockedEth > 0n && totalReceipts === 0;

  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-lg p-4 flex flex-col gap-3">
      <p className="text-xs uppercase tracking-wider text-zinc-500">
        Pool Status
      </p>

      {loading ? (
        <p className="text-xs text-zinc-600">Loading…</p>
      ) : error ? (
        <p className="text-xs text-red-400 font-mono break-all">{error}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">ETH locked</span>
            <span className="text-zinc-200 font-mono">{ethFormatted} FETH</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Receipts on Aptos</span>
            <span className="text-zinc-400 font-mono">
              {totalReceipts}
              <span className="ml-1 text-xs text-zinc-600">
                (pending infra)
              </span>
            </span>
          </div>

          {hasDivergence && (
            <div className="mt-1 rounded border border-amber-900/60 bg-amber-950/20 px-2 py-1.5 text-xs text-amber-400">
              ETH locked but no receipts proven — proofs may be pending.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
