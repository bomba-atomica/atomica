import { useState } from "react";
import { ethers } from "ethers";
import { submitCreateAuction } from "../lib/aptos";
import * as ibe from "../lib/ibe";

interface AuctionCreatorProps {
  account: string;
}

export function AuctionCreator({ account }: AuctionCreatorProps) {
  const [amount, setAmount] = useState("0.1");
  const [minPrice, setMinPrice] = useState("100");
  const [duration, setDuration] = useState("3600"); // 1 hour
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleCreateAuction = async () => {
    setLoading(true);
    setStatus("Generating IBE keys...");
    try {
      // 1. Generate MPK (Master Public Key) for this auction
      const { mpk } = await ibe.generateSystemParameters();

      // 2. Submit Transaction
      setStatus("Please sign the transaction in MetaMask...");

      // Convert inputs
      const amountWei = ethers.parseEther(amount);
      const minPriceWei = BigInt(minPrice);
      const durationSec = BigInt(duration);

      const pendingTx = await submitCreateAuction(
        account,
        amountWei,
        minPriceWei,
        durationSec,
        mpk,
      );

      const hash = (pendingTx as any).hash || "submitted";
      setStatus(`Auction Created! Tx: ${hash}`);
    } catch (error: any) {
      console.error(error);
      setStatus(`Error: ${error.message || "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
      <h2 className="text-xl font-bold mb-4 text-zinc-500">
        2. Create Auction
      </h2>
      <div className="space-y-4">
        <div>
          <label className="block text-zinc-500 text-sm mb-1">ETH Amount</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="block text-zinc-500 text-sm mb-1">
            Min Price (USD)
          </label>
          <input
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="block text-zinc-500 text-sm mb-1">
            Duration (seconds)
          </label>
          <input
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <button
          onClick={handleCreateAuction}
          disabled={loading}
          className={`w-full py-2 rounded font-bold transition-colors ${loading
              ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
              : "bg-zinc-100 hover:bg-white text-zinc-900"
            }`}
        >
          {loading ? "Processing..." : "Create Auction"}
        </button>
        {status && (
          <div className="mt-4 text-sm font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
