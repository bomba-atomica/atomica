import { useState } from "react";
import { ethers } from "ethers";

interface Props {
  onLock: (amount: bigint, minPrice: bigint) => Promise<void>;
  fakeEthBalance?: bigint;
  loading: boolean;
  error?: string;
}

export function Step2Lock({ onLock, fakeEthBalance, loading, error }: Props) {
  const [amount, setAmount] = useState("1.0");
  const [minPrice, setMinPrice] = useState("2000");

  const handleLock = () => {
    const amountWei = ethers.parseEther(amount || "0");
    const minPriceWei = ethers.parseUnits(minPrice || "0", 6); // USD with 6 decimals
    onLock(amountWei, minPriceWei);
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
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min="0"
            step="0.1"
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-zinc-500 mb-1">
            Minimum price (USD)
          </label>
          <input
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            min="0"
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 text-sm"
          />
        </div>
      </div>

      <button
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
        <p className="text-xs text-red-400 font-mono break-all">{error}</p>
      )}
    </div>
  );
}
