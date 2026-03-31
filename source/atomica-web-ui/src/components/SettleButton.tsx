import { useState, useEffect, useCallback } from "react";
import { submitSettle, isSettled, getSettlement } from "../lib/aptos/payloads";
import { useWallet } from "../context/WalletContext";

interface Props {
  sellerAddress: string;
  auctionEndTime?: number;
  /** Called when a settlement is observed (either fresh or already settled). */
  onSettled?: (sellerAddress: string, clearingPrice: bigint) => void;
}

/**
 * SettleButton — calls `auction::settle` on-chain and displays the settlement
 * outcome (winner address + clearing price).
 *
 * The button is disabled when:
 * - the connected wallet is missing
 * - the auction has not yet ended (current time <= auctionEndTime)
 * - the auction is already settled on-chain
 * - a transaction is in flight
 */
export function SettleButton({
  sellerAddress,
  auctionEndTime,
  onSettled,
}: Props) {
  const { account } = useWallet();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);
  const [winner, setWinner] = useState<string | null>(null);
  const [clearingPrice, setClearingPrice] = useState<bigint | null>(null);
  const [auctionEnded, setAuctionEnded] = useState(false);

  // Poll whether auction time has passed
  useEffect(() => {
    if (!auctionEndTime) return;
    const check = () => {
      const now = Math.floor(Date.now() / 1000);
      setAuctionEnded(now > auctionEndTime);
    };
    check();
    const id = setInterval(check, 1000);
    return () => clearInterval(id);
  }, [auctionEndTime]);

  // Check initial settled state
  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const s = await isSettled(sellerAddress);
        if (cancelled) return;
        setSettled(s);
        if (s) {
          const result = await getSettlement(sellerAddress);
          if (cancelled) return;
          setWinner(result.winner);
          setClearingPrice(result.clearingPrice);
          setStatus("Already Settled");
          onSettled?.(sellerAddress, result.clearingPrice);
        }
      } catch {
        // View function may fail if auction doesn't exist yet — ignore
      }
    }
    check();
    return () => {
      cancelled = true;
    };
  }, [sellerAddress, onSettled]);

  const handleSettle = useCallback(async () => {
    if (!account) return;
    setLoading(true);
    setStatus("Settling auction\u2026");
    try {
      await submitSettle(account, sellerAddress);

      // Query settlement result
      const result = await getSettlement(sellerAddress);
      setWinner(result.winner);
      setClearingPrice(result.clearingPrice);
      setSettled(true);
      setStatus("Settled");
      onSettled?.(sellerAddress, result.clearingPrice);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      // Surface Move abort codes in a human-readable way
      if (msg.includes("E_AUCTION_NOT_ENDED") || msg.includes("abort 3")) {
        setStatus("Error: Auction has not ended yet");
      } else if (msg.includes("E_ALREADY_SETTLED") || msg.includes("abort 4")) {
        setStatus("Error: Auction already settled");
      } else {
        setStatus(`Error: ${msg}`);
      }
    } finally {
      setLoading(false);
    }
  }, [account, sellerAddress]);

  const disabled = loading || settled || !auctionEnded || !account;

  return (
    <div className="flex flex-col gap-2">
      <button
        data-testid="settle-button"
        onClick={handleSettle}
        disabled={disabled}
        className={`w-full py-2 rounded font-semibold text-sm transition-colors ${
          disabled
            ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
            : "bg-zinc-100 hover:bg-white text-zinc-900"
        }`}
      >
        {loading
          ? "Settling\u2026"
          : settled
            ? "Already Settled"
            : "Settle Auction"}
      </button>
      {status && (
        <div
          data-testid="settle-status"
          className="text-xs font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800"
        >
          {status}
        </div>
      )}
      {settled && winner && (
        <div
          data-testid="settle-result"
          className="text-xs font-mono p-2 bg-zinc-950 rounded border border-zinc-800 flex flex-col gap-1"
        >
          <div className="flex justify-between">
            <span className="text-zinc-500">Winner</span>
            <span
              data-testid="settle-winner"
              className="text-zinc-300 truncate max-w-[200px]"
              title={winner}
            >
              {winner === "0x0" ? "No winner (no valid bids)" : winner}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Clearing price</span>
            <span data-testid="settle-clearing-price" className="text-zinc-300">
              {clearingPrice !== null
                ? `$${(Number(clearingPrice) / 1e6).toFixed(2)}`
                : "\u2014"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
