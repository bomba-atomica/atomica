import { useState, useEffect } from "react";
import {
  getSettlement,
  isSettled,
  fetchRebates,
  getBidResults,
} from "@atomica/sdk/aptos";

/**
 * Result returned by {@link useFeeRebate}.
 *
 * @see docs/specifications/prd.md
 */
export interface FeeRebateResult {
  /** Whether we have enough data to display fee/rebate. */
  ready: boolean;
  /** True when the current user is the auction winner. */
  isWinner: boolean;
  /**
   * Rebate in USD micro-units from `auction::compute_rebates`.
   * `undefined` when not winner, not ready, or compute_rebates is not yet
   * implemented (E_NOT_IMPLEMENTED abort — "pending" state).
   */
  rebateAmount: bigint | undefined;
  /**
   * Fee in USD micro-units.
   * `undefined` when compute_rebates is not yet implemented ("pending" state).
   * 0n when implemented but no fee applies.
   */
  feeAmount: bigint | undefined;
  /**
   * True when `auction::compute_rebates` returned E_NOT_IMPLEMENTED (99).
   * The UI should show a "pending" indicator in this state.
   */
  pending: boolean;
}

/**
 * Compute fee and rebate for the connected user after auction settlement (v0 Beta).
 *
 * - Queries `auction::get_settlement(windowId, pairBcs)` for clearing price.
 * - Calls `auction::get_bid_results(windowId, pairBcs)` to determine winner status.
 * - Calls `auction::compute_rebates(windowId, pairBcs, clearingPrice)` for rebate.
 * - When `compute_rebates` aborts with E_NOT_IMPLEMENTED (99), sets
 *   `pending: true` and returns `rebateAmount: undefined, feeAmount: undefined`
 *   so the UI can display a "pending" indicator.
 *
 * Returns `ready: false` until settlement data is available.
 *
 * v0 Beta: parameters are `(windowId, pairBcs, bidderAddress)`.
 * `isWinner` is derived from live on-chain bid results (issue #113).
 *
 * @param windowId      - Auction window ID (from current_window_id or stored)
 * @param pairBcs       - BCS-encoded Pair struct
 * @param bidderAddress - Connected bidder address
 * @returns {@link FeeRebateResult} — `ready` is `false` until data is available
 * @see docs/architecture/v0-architecture.md §2 (fee/rebate section)
 */
export function useFeeRebate(
  windowId: bigint | null | undefined,
  pairBcs: Uint8Array | null | undefined,
  bidderAddress: string | null | undefined,
): FeeRebateResult {
  const [result, setResult] = useState<FeeRebateResult>({
    ready: false,
    isWinner: false,
    rebateAmount: undefined,
    feeAmount: undefined,
    pending: false,
  });

  useEffect(() => {
    if (windowId == null || !pairBcs || !bidderAddress) return;

    let cancelled = false;

    async function compute() {
      try {
        const settled = await isSettled(windowId!, pairBcs!);
        if (cancelled || !settled) return;

        const [settlement, bidResults] = await Promise.all([
          getSettlement(windowId!, pairBcs!),
          getBidResults(windowId!, pairBcs!),
        ]);
        if (cancelled) return;

        // Determine if this bidder is a winner from live on-chain bid results.
        const myBid = bidResults.find(
          (b) => b.bidder.toLowerCase() === bidderAddress!.toLowerCase(),
        );
        const isWinner = myBid?.isWinner ?? false;

        // Query compute_rebates — returns null when E_NOT_IMPLEMENTED (scaffold).
        const rebates = await fetchRebates(
          windowId!,
          pairBcs!,
          settlement.clearingPrice,
        );
        if (cancelled) return;

        if (rebates === null) {
          // compute_rebates aborted with E_NOT_IMPLEMENTED — show "pending" state.
          setResult({
            ready: true,
            isWinner,
            rebateAmount: undefined,
            feeAmount: undefined,
            pending: true,
          });
          return;
        }

        // Find this bidder's rebate entry from the typed response.
        const myRebate = rebates.find(
          (r) => r.bidder.toLowerCase() === bidderAddress!.toLowerCase(),
        );

        setResult({
          ready: true,
          isWinner,
          rebateAmount: myRebate?.amount ?? 0n,
          feeAmount: 0n,
          pending: false,
        });
      } catch {
        // Settlement not available yet — stay not-ready
      }
    }

    compute();

    return () => {
      cancelled = true;
    };
  }, [windowId, pairBcs, bidderAddress]);

  return result;
}
