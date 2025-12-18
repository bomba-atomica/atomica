import { useState } from "react";
import { ethers } from "ethers";
import { submitBid } from "../lib/aptos";
import * as ibe from "../lib/ibe";

interface AuctionBidderProps {
  account: string;
}

export function AuctionBidder({ account }: AuctionBidderProps) {
  const [sellerAddr, setSellerAddr] = useState("");
  const [bidAmount, setBidAmount] = useState("110");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleBid = async () => {
    setLoading(true);
    setStatus("Encrypting Bid...");
    try {
      // 1. Encrypt Bid (IBE)
      // Identity = Auction ID (here we use Seller Address as ID for simplicity in Demo)
      const identityBytes = ethers.getBytes(sellerAddr);

      // Generate dummy MPK for demo purposes (real encryption logic handles point generation)
      const { mpk } = await ibe.generateSystemParameters();
      const payload = new TextEncoder().encode(bidAmount);
      const { u, v } = await ibe.encrypt(mpk, identityBytes, payload);

      // 2. Submit
      setStatus("Please sign the transaction...");
      const amountBn = BigInt(bidAmount);

      const pendingTx = await submitBid(account, sellerAddr, amountBn, u, v);

      // Access hash safely (type assertion if needed)
      const hash = (pendingTx as { hash?: string }).hash || "submitted";
      setStatus(`Bid Submitted! Tx: ${hash}`);
    } catch (error: unknown) {
      console.error(error);
      setStatus(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
      <h2 className="text-xl font-bold mb-4 text-zinc-500">
        3. Bid on Auction
      </h2>
      <div className="space-y-4">
        <div>
          <label className="block text-zinc-500 text-sm mb-1">
            Auction/Seller Address
          </label>
          <input
            type="text"
            value={sellerAddr}
            onChange={(e) => setSellerAddr(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 text-xs font-mono border border-zinc-700 focus:outline-none focus:border-zinc-500"
            placeholder="0x..."
          />
        </div>
        <div>
          <label className="block text-zinc-500 text-sm mb-1">
            Bid Amount (USD)
          </label>
          <input
            type="number"
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <button
          onClick={handleBid}
          disabled={loading}
          className={`w-full py-2 rounded font-bold transition-colors ${loading
              ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
              : "bg-zinc-100 hover:bg-white text-zinc-900"
            }`}
        >
          {loading ? "Processing..." : "Submit Encrypted Bid"}
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
