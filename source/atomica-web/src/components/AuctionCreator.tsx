import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { getNonce, computeCreateAuctionDigest, submitRemoteCreateAuction } from '../lib/aptos';

interface AuctionCreatorProps {
    account: string;
}

export function AuctionCreator({ account }: AuctionCreatorProps) {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [nonce, setNonce] = useState<number>(0);

    // Form Inputs
    const [amountEth, setAmountEth] = useState("10");
    const [minPrice, setMinPrice] = useState("1000"); // USD
    const [duration, setDuration] = useState("600"); // 10 mins
    const [mpk, setMpk] = useState("");

    useEffect(() => {
        if (account) {
            getNonce(account).then(setNonce);
        }
    }, [account]);

    const handleCreate = async () => {
        if (!window.ethereum) return;
        setLoading(true);
        setStatus("Fetching nonce...");

        try {
            const currentNonce = await getNonce(account);
            setNonce(currentNonce);

            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();

            // Prepare Payload
            // Note: Inputs are strings, conversion happens here.
            // eth = 10 * 10^8
            const ethVal = BigInt(amountEth) * BigInt(100000000);
            // usd = 1000 * 10^6
            const minPriceVal = BigInt(minPrice) * BigInt(1000000);
            const durationVal = BigInt(duration);

            // MPK: Expect hex string "0x..."
            if (!mpk.startsWith("0x")) throw new Error("MPK must start with 0x");
            const mpkBytes = ethers.getBytes(mpk);

            setStatus(`Signing Create Auction (Nonce: ${currentNonce})...`);

            const digestBytes = computeCreateAuctionDigest(
                currentNonce,
                ethVal,
                minPriceVal,
                durationVal,
                mpkBytes
            );

            const signature = await signer.signMessage(digestBytes);

            setStatus("Submitting to Relayer...");

            const pendingTx = await submitRemoteCreateAuction(
                account,
                signature,
                currentNonce,
                ethVal,
                minPriceVal,
                durationVal,
                mpkBytes
            );

            setStatus(`Auction Created! Tx: ${pendingTx.hash}`);

        } catch (error: any) {
            console.error(error);
            setStatus(`Error: ${error.message || "Unknown error"}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-semibold mb-4 border-b border-gray-700 pb-2">Create Auction</h2>

            <div className="space-y-4">
                <div>
                    <label className="block text-gray-400 text-sm">Amount (FAKEETH)</label>
                    <input
                        type="number"
                        value={amountEth}
                        onChange={(e) => setAmountEth(e.target.value)}
                        className="w-full bg-gray-700 p-2 rounded text-white"
                    />
                </div>
                <div>
                    <label className="block text-gray-400 text-sm">Min Price (FAKEUSD)</label>
                    <input
                        type="number"
                        value={minPrice}
                        onChange={(e) => setMinPrice(e.target.value)}
                        className="w-full bg-gray-700 p-2 rounded text-white"
                    />
                </div>
                <div>
                    <label className="block text-gray-400 text-sm">Duration (seconds)</label>
                    <input
                        type="number"
                        value={duration}
                        onChange={(e) => setDuration(e.target.value)}
                        className="w-full bg-gray-700 p-2 rounded text-white"
                    />
                </div>
                <div>
                    <label className="block text-gray-400 text-sm">Timelock Master Public Key (Hex)</label>
                    <textarea
                        value={mpk}
                        onChange={(e) => setMpk(e.target.value)}
                        placeholder="0x..."
                        className="w-full bg-gray-700 p-2 rounded text-white h-24 font-mono text-xs"
                    />
                </div>

                <div className="text-sm text-gray-500 font-mono text-center">
                    Current Nonce: {nonce}
                </div>

                <button
                    onClick={handleCreate}
                    disabled={loading}
                    className={`w-full py-2 rounded text-white font-bold transition ${loading ? "bg-gray-600 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700"
                        }`}
                >
                    {loading ? "Processing..." : "Create Auction"}
                </button>

                {status && (
                    <div className="mt-2 text-sm font-mono text-yellow-400 break-all p-2 bg-gray-900 rounded">
                        {status}
                    </div>
                )}
            </div>
        </div>
    );
}
