import { useState } from 'react';
import { ethers } from 'ethers';
import { submitBid } from '../lib/aptos';
import * as ibe from '../lib/ibe';

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

            const pendingTx = await submitBid(
                account,
                sellerAddr,
                amountBn,
                u,
                v
            );

            // Access hash safely (type assertion if needed)
            const hash = (pendingTx as any).hash || "submitted";
            setStatus(`Bid Submitted! Tx: ${hash}`);

        } catch (error: any) {
            console.error(error);
            setStatus(`Error: ${error.message || "Unknown error"}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-bold mb-4 text-green-400">3. Bid on Auction</h2>
            <div className="space-y-4">
                <div>
                    <label className="block text-gray-400 text-sm mb-1">Auction/Seller Address</label>
                    <input
                        type="text"
                        value={sellerAddr}
                        onChange={(e) => setSellerAddr(e.target.value)}
                        className="w-full bg-gray-700 text-white rounded p-2 text-xs font-mono"
                        placeholder="0x..."
                    />
                </div>
                <div>
                    <label className="block text-gray-400 text-sm mb-1">Bid Amount (USD)</label>
                    <input
                        type="number"
                        value={bidAmount}
                        onChange={(e) => setBidAmount(e.target.value)}
                        className="w-full bg-gray-700 text-white rounded p-2"
                    />
                </div>

                <button
                    onClick={handleBid}
                    disabled={loading}
                    className={`w-full py-2 rounded font-bold transition ${loading ? "bg-gray-600 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
                        }`}
                >
                    {loading ? "Processing..." : "Submit Encrypted Bid"}
                </button>
                {status && (
                    <div className="mt-4 text-sm font-mono text-yellow-400 break-all p-2 bg-gray-900 rounded">
                        {status}
                    </div>
                )}
            </div>
        </div>
    );
}
