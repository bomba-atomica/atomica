import { useState } from "react";
import { ethers } from "ethers";

interface Props {
  onLock: (amount: bigint) => Promise<void>;
  fakeEthBalance?: bigint;
  loading: boolean;
  error?: string;
}

export function Step2Lock({ onLock, fakeEthBalance, loading, error }: Props) {
  const [amount, setAmount] = useState("1.0");

  // SCOUT(#218) EDIT: refuse an amount below the minimum seller lock here, before the Ethereum lock.
  const handleLock = () => {
    const amountWei = ethers.parseEther(amount || "0");
    // SCOUT(#217) EDIT: price parsed as micro-dollars (parseUnits with 6 decimals); the unit is whole USD through parsePrice, while the field exists.
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

        {/* SCOUT(#217) EDIT: price input in whole USD, while it exists. */}
      </div>

      <button
        data-testid="approve-lock-button"
        onClick={handleLock}
        disabled={loading}
        className={`w-full py-2 rounded font-semibold transition-colors ${
          loading
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
