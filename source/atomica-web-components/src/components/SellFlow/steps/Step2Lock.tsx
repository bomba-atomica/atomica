import { useState } from "react";
import { ethers } from "ethers";

interface Props {
  onLock: (amount: bigint) => Promise<void>;
  fakeEthBalance?: bigint;
  loading: boolean;
  error?: string;
  /** Minimum seller lock in FakeETH wei; below it Aptos refuses the lock */
  minSellerLockAmount?: bigint;
}

/** Wei of the typed amount, or null when the text is not a FakeETH amount. */
function parseAmount(text: string): bigint | null {
  try {
    return ethers.parseEther(text || "0");
  } catch {
    return null;
  }
}

export function Step2Lock({
  onLock,
  fakeEthBalance,
  loading,
  error,
  minSellerLockAmount,
}: Props) {
  const [amount, setAmount] = useState("1.0");

  // Below the minimum seller lock, Aptos refuses the lock after Ethereum took
  // it, so the button stays disabled.
  const typedWei = parseAmount(amount);
  const belowMinimum =
    minSellerLockAmount !== undefined &&
    (typedWei === null || typedWei < minSellerLockAmount);

  const handleLock = () => {
    const amountWei = ethers.parseEther(amount || "0");
    onLock(amountWei);
  };

  const maxAmount = fakeEthBalance
    ? (Number(fakeEthBalance) / 1e18).toFixed(4)
    : "0";

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-400">
        Lock your FakeETH in the Ethereum LockBox. You'll need to confirm two
        MetaMask transactions: approve and lock.
      </p>

      <div className="flex flex-col gap-3">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Amount to lock (FETH)
            {fakeEthBalance !== undefined && (
              <span className="ml-2 text-zinc-600">max {maxAmount}</span>
            )}
            {minSellerLockAmount !== undefined && (
              <span
                data-testid="min-seller-lock"
                className="ml-2 text-zinc-600"
              >
                min {ethers.formatEther(minSellerLockAmount)}
              </span>
            )}
          </label>
          <input
            data-testid="lock-amount-input"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="0.1"
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 text-sm"
          />
        </div>
      </div>

      <button
        data-testid="approve-lock-button"
        onClick={handleLock}
        disabled={loading || belowMinimum}
        className={`w-full py-2 rounded font-semibold transition-colors ${
          loading || belowMinimum
            ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
            : "bg-zinc-100 hover:bg-white text-zinc-900"
        }`}
      >
        {loading ? "Waiting for MetaMask…" : "Approve & Lock"}
      </button>

      {error && (
        <p
          data-testid="lock-error"
          className="text-xs text-red-400 font-mono break-all"
        >
          {error}
        </p>
      )}
    </div>
  );
}
