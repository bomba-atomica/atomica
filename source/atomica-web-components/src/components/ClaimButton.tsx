import { useState, useEffect, useCallback } from "react";
import {
  isSettled,
  getSettlement,
  submitClaim,
  getFakeEthBalance,
} from "@atomica/sdk/aptos";
import { getDerivedAddress } from "@atomica/sdk";
import { useWallet } from "../context/WalletContext";

interface Props {
  /**
   * v0 Beta: auction window ID
   * @see docs/architecture/v0-architecture.md §2.2
   */
  windowId: bigint;
  /**
   * v0 Beta: BCS-encoded Pair struct
   * @see docs/architecture/v0-architecture.md §2.4
   */
  pairBcs: Uint8Array;
  /**
   * @deprecated Used for display only. Pass the Aptos seller address
   * for UI labelling while the per-winner path is deferred to Phase 3b.
   */
  sellerAddress?: string;
}

/**
 * ClaimButton — Phase 3a scaffold for winner payout.
 *
 * On mount, queries `get_settlement(windowId, pairBcs)` to check settlement
 * state and clearing price. Per-winner determination (checking whether the
 * current user is the clearing winner) is deferred to Phase 3b (#86b) when
 * bidder collateral verification is implemented.
 *
 * In Phase 3a the Claim button is shown but always disabled (scaffold body
 * aborts with E_NOT_IMPLEMENTED in the Move contract).
 *
 * v0 Beta breaking change: `isSettled` and `getSettlement` now take
 * `(windowId, pairBcs)` instead of `(sellerAddress)`. The `winner` field
 * is removed from `getSettlement` return value.
 *
 * @see docs/architecture/v0-architecture.md#§2-auction-mechanism-v01-beta
 */
export function ClaimButton({ windowId, pairBcs, sellerAddress }: Props) {
  const { account } = useWallet();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [clearingPrice, setClearingPrice] = useState<bigint | null>(null);
  const [claimedAmount, setClaimedAmount] = useState<bigint | null>(null);

  // Check settlement state on mount
  useEffect(() => {
    let cancelled = false;

    async function checkSettlement() {
      try {
        const s = await isSettled(windowId, pairBcs);
        if (cancelled) return;

        if (!s) {
          setSettled(false);
          setStatus("Auction window not yet settled");
          return;
        }

        setSettled(true);
        const result = await getSettlement(windowId, pairBcs);
        if (cancelled) return;
        setClearingPrice(result.clearingPrice);
        // Per-winner determination deferred to Phase 3b (#86b)
        setStatus("Settled — winner determination available in Phase 3b");
      } catch {
        // View function may fail if registry or window doesn't exist — ignore
      }
    }

    checkSettlement();
    return () => {
      cancelled = true;
    };
  }, [windowId, pairBcs, account]);

  const handleClaim = useCallback(async () => {
    if (!account || !clearingPrice) return;
    setLoading(true);
    setStatus("Claiming…");
    try {
      // Read balance before claim
      const derived = await getDerivedAddress(account.toLowerCase());
      let balanceBefore = 0n;
      try {
        balanceBefore = await getFakeEthBalance(derived.toString());
      } catch {
        // Account may not have a FakeETH store yet
      }

      // Submit the claim (self-mint via SIWE) — Demo-phase fallback
      await submitClaim(account, clearingPrice);

      // Read balance after claim
      let balanceAfter = 0n;
      try {
        balanceAfter = await getFakeEthBalance(derived.toString());
      } catch {
        // Shouldn't happen after a successful mint
      }

      const received = balanceAfter - balanceBefore;
      setClaimed(true);
      setClaimedAmount(received);
      setStatus("Claimed");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setStatus(`Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [account, clearingPrice]);

  // Claim disabled in Phase 3a — per-winner check deferred to Phase 3b
  const claimDisabled = loading || !settled || claimed || !account;

  return (
    <div className="flex flex-col gap-2">
      {sellerAddress && (
        <div className="text-xs text-zinc-500 font-mono truncate">
          Seller: {sellerAddress}
        </div>
      )}
      <div className="flex gap-2">
        <button
          data-testid="claim-button"
          onClick={handleClaim}
          disabled={claimDisabled}
          className={`flex-1 py-2 rounded font-semibold text-sm transition-colors ${
            claimDisabled
              ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
              : "bg-zinc-100 hover:bg-white text-zinc-900"
          }`}
        >
          {claimed ? "Claimed" : "Claim"}
        </button>
        <button
          data-testid="reclaim-button"
          disabled={true}
          className="flex-1 py-2 rounded font-semibold text-sm transition-colors bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
        >
          Not applicable (Demo)
        </button>
      </div>
      {status && (
        <div
          data-testid="claim-status"
          className="text-xs font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800"
        >
          {status}
        </div>
      )}
      {claimed && claimedAmount !== null && (
        <div
          data-testid="claim-result"
          className="text-xs font-mono p-2 bg-zinc-950 rounded border border-zinc-800 flex flex-col gap-1"
        >
          <div className="flex justify-between">
            <span className="text-zinc-500">Amount received</span>
            <span data-testid="claim-amount" className="text-zinc-300">
              {(Number(claimedAmount) / 1e8).toFixed(8)} FAKEETH
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
