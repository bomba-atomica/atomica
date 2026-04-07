/**
 * useAuctionPoolTotals — Poll both chains for auction pool metrics.
 *
 * Ethereum side: sums all TokensLocked events from LockBox (real).
 * Aptos side:    total lock receipt count via lock_receipt::get_receipt_count view function.
 *
 * Refreshes every 30 seconds.
 */

import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { getTotalLockedEth } from "@atomica/sdk/ethereum";
import { getChainConfig } from "@atomica/sdk/chain-config";
import { aptos, CONTRACT_ADDR } from "@atomica/sdk/aptos";

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
 * Calls the `lock_receipt::get_receipt_count<Ethereum, FakeETH>()` view function
 * which returns the total number of lock receipts registered for Ethereum/FakeETH.
 * Falls back to 0 if the Aptos node is unreachable.
 */
async function getTotalReceipts(): Promise<number> {
  try {
    const result = await aptos.view({
      payload: {
        function: `${CONTRACT_ADDR}::lock_receipt::get_receipt_count`,
        typeArguments: [
          `${CONTRACT_ADDR}::lock_receipt::Ethereum`,
          `${CONTRACT_ADDR}::lock_receipt::FakeETH`,
        ],
        functionArguments: [],
      },
    });
    return Number(result[0]);
  } catch {
    // Aptos node unreachable or module not deployed — fall back to 0.
    return 0;
  }
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
