import { useState, useEffect, useCallback } from "react";
import {
  isSettled,
  getSettlement,
  submitClaim,
  getFakeEthBalance,
} from "../lib/aptos/payloads";
import { getDerivedAddress } from "../lib/aptos/siwe";
import { useWallet } from "../context/WalletContext";

interface Props {
  sellerAddress: string;
}

/**
 * ClaimButton — Demo-phase winner payout via direct `fake_eth::mint`.
 *
 * On mount, queries `get_settlement(sellerAddress)` to determine the winner.
 * Compares the winner against the current user's derived Aptos address.
 * If the current user is the winner, enables the Claim button which calls
 * `fake_eth::mint` via SIWE to self-mint the clearing price as FakeETH.
 *
 * Reclaim is not applicable in Demo phase (no bidder collateral on Aptos side).
 */
export function ClaimButton({ sellerAddress }: Props) {
  const { account } = useWallet();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const [isWinner, setIsWinner] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [clearingPrice, setClearingPrice] = useState<bigint | null>(null);
  const [claimedAmount, setClaimedAmount] = useState<bigint | null>(null);

  // Check settlement state on mount
  useEffect(() => {
    let cancelled = false;

    async function checkSettlement() {
      try {
        const s = await isSettled(sellerAddress);
        if (cancelled) return;

        if (!s) {
          setSettled(false);
          setStatus("Auction not yet settled");
          return;
        }

        setSettled(true);
        const result = await getSettlement(sellerAddress);
        if (cancelled) return;

        setClearingPrice(result.clearingPrice);

        if (!account) {
          setIsWinner(false);
          return;
        }

        // Derive the current user's Aptos address and compare to winner
        const derived = await getDerivedAddress(account.toLowerCase());
        if (cancelled) return;

        const derivedStr = derived.toString().toLowerCase();
        const winnerStr = result.winner.toLowerCase();

        if (winnerStr === derivedStr) {
          setIsWinner(true);
        } else {
          setIsWinner(false);
          setStatus("You are not the auction winner");
        }
      } catch {
        // View function may fail if auction doesn't exist — ignore
      }
    }

    checkSettlement();
    return () => {
      cancelled = true;
    };
  }, [sellerAddress, account]);

  const handleClaim = useCallback(async () => {
    if (!account || !clearingPrice) return;
    setLoading(true);
    setStatus("Claiming\u2026");
    try {
      // Read balance before claim
      const derived = await getDerivedAddress(account.toLowerCase());
      let balanceBefore = 0n;
      try {
        balanceBefore = await getFakeEthBalance(derived.toString());
      } catch {
        // Account may not have a FakeETH store yet
      }

      // Submit the claim (self-mint via SIWE)
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

  const claimDisabled = loading || !settled || !isWinner || claimed || !account;

  return (
    <div className="flex flex-col gap-2">
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
