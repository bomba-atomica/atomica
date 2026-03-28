/**
 * useAuctionPoolTotals — Poll both chains for auction pool metrics.
 *
 * Ethereum side: sums all TokensLocked events from LockBox (real).
 * Aptos side:    total lock receipt count (stub — infrastructure pending, I-D4).
 *
 * Refreshes every 30 seconds.
 */

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { getTotalLockedEth } from "../lib/ethereum/lockbox";
import { getChainConfig } from "../lib/chain-config";

export interface AuctionPoolTotals {
  /** Total FakeETH locked across all users in LockBox (wei) */
  totalLockedEth: bigint;
  /** Total lock receipts proven on Aptos */
  totalReceipts: number;
  loading: boolean;
  error?: string;
}

/**
 * Fetch total lock receipts from Aptos lock_receipt module.
 *
 * TODO (I-D4): Query lock_receipt view function once the Aptos module exposes
 * a receipt count endpoint. Returns 0 until infrastructure is ready.
 */
async function getTotalReceipts(): Promise<number> {
  // STUB: Aptos infrastructure pending (I-D4).
  // When lock_receipt.move exposes a count view function, query it here via aptos.view().
  return 0;
}

const POLL_INTERVAL_MS = 30_000;

export function useAuctionPoolTotals(): AuctionPoolTotals {
  const [totals, setTotals] = useState<AuctionPoolTotals>({
    totalLockedEth: 0n,
    totalReceipts: 0,
    loading: true,
  });

  const fetchTotals = useCallback(async () => {
    try {
      const config = getChainConfig();
      const provider = new ethers.JsonRpcProvider(config.ethereum.rpcUrl);
      const [totalLockedEth, totalReceipts] = await Promise.all([
        getTotalLockedEth(provider),
        getTotalReceipts(),
      ]);
      setTotals({ totalLockedEth, totalReceipts, loading: false });
    } catch (e: unknown) {
      setTotals((prev) => ({
        ...prev,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  }, []);

  useEffect(() => {
    fetchTotals();
    const id = setInterval(fetchTotals, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchTotals]);

  return totals;
}
