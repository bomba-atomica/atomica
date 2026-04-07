import { useState, useEffect } from "react";
import { getSettlement, isSettled } from "@atomica/sdk/aptos";
import { loadBidPrice } from "../storage/bidStorage";

export interface FeeRebateResult {
  /** Whether we have enough data to display fee/rebate. */
  ready: boolean;
  /** True when the current user is the auction winner. */
  isWinner: boolean;
  /** Rebate in USD micro-units (bid - clearing price). Undefined when not winner or not ready. */
  rebateAmount: bigint | undefined;
  /** Fee in USD micro-units. Always 0 in Demo phase. */
  feeAmount: bigint | undefined;
}

/**
 * Compute fee and rebate for the connected user after auction settlement.
 *
 * - Queries `get_settlement()` for clearing price and winner.
 * - Loads the user's bid price from localStorage.
 * - Computes rebate = bidPrice - clearingPrice.
 * - Fee is always 0 in Demo phase (no fee mechanism).
 *
 * Returns `ready: false` until settlement data and bid price are both available.
 */
export function useFeeRebate(
  sellerAddress: string | null | undefined,
  bidderAddress: string | null | undefined,
): FeeRebateResult {
  const [result, setResult] = useState<FeeRebateResult>({
    ready: false,
    isWinner: false,
    rebateAmount: undefined,
    feeAmount: undefined,
  });

  useEffect(() => {
    if (!sellerAddress || !bidderAddress) return;

    let cancelled = false;

    async function compute() {
      try {
        const settled = await isSettled(sellerAddress!);
        if (cancelled || !settled) return;

        const settlement = await getSettlement(sellerAddress!);
        if (cancelled) return;

        const winnerNorm = settlement.winner.toLowerCase();
        const bidderNorm = bidderAddress!.toLowerCase();
        const userIsWinner = winnerNorm === bidderNorm;

        const bidPrice = loadBidPrice(sellerAddress!, bidderAddress!);

        if (!userIsWinner) {
          // Not the winner — show fee=0, rebate hidden
          setResult({
            ready: true,
            isWinner: false,
            rebateAmount: undefined,
            feeAmount: 0n,
          });
          return;
        }

        if (bidPrice === null) {
          // Winner but no stored bid price — can't compute rebate
          setResult({
            ready: true,
            isWinner: true,
            rebateAmount: undefined,
            feeAmount: 0n,
          });
          return;
        }

        const rebate = bidPrice - settlement.clearingPrice;
        setResult({
          ready: true,
          isWinner: true,
          rebateAmount: rebate >= 0n ? rebate : 0n,
          feeAmount: 0n,
        });
      } catch {
        // Settlement not available yet — stay not-ready
      }
    }

    compute();

    return () => {
      cancelled = true;
    };
  }, [sellerAddress, bidderAddress]);

  return result;
}
