import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { getNonce, computeBidDigest, submitRemoteBid } from '../lib/aptos';
import { ibeEncrypt } from '../lib/ibe';
import { Serializer } from '@aptos-labs/ts-sdk';

interface AuctionBidderProps {
    account: string;
}

export function AuctionBidder({ account }: AuctionBidderProps) {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [nonce, setNonce] = useState<number>(0);

    // Form
    const [sellerAddr, setSellerAddr] = useState("");
    const [amountUsd, setAmountUsd] = useState("100");
    const [endTime, setEndTime] = useState(""); // Epoch seconds, used as ID
    const [mpk, setMpk] = useState("");

    useEffect(() => {
        if (account) {
            getNonce(account).then(setNonce);
        }
    }, [account]);

    const handleBid = async () => {
        if (!window.ethereum) return;
        setLoading(true);
        setStatus("Processing...");

        try {
            const currentNonce = await getNonce(account);
            setNonce(currentNonce);

            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();

            const usdVal = BigInt(amountUsd) * BigInt(1000000); // 6 decimals

            if (!mpk.startsWith("0x")) throw new Error("MPK must hex");
            const mpkBytes = ethers.getBytes(mpk);

            // IBE ID = BCS(u64 end_time)
            // Check Move logic: timelock calls ibe::extract(master, id).
            // ID interpretation depends on how oracle/validator uses it.
            // Usually standard u64 BCS bytes.
            const idSerializer = new Serializer();
            idSerializer.serializeU64(BigInt(endTime)); // Little endian 8 bytes
            const idBytes = idSerializer.toUint8Array();

            // Message = BCS(u64 amount)
            // We want to encrypt the bid amount.
            const msgSerializer = new Serializer();
            msgSerializer.serializeU64(usdVal);
            const msgBytes = msgSerializer.toUint8Array();

            setStatus("Encrypting Bid...");
            const { u, v } = await ibeEncrypt(mpkBytes, idBytes, msgBytes);

            setStatus(`Signing Bid (Nonce: ${currentNonce})...`);
            const digestBytes = computeBidDigest(
                currentNonce,
                sellerAddr,
                usdVal,
                u,
                v
            );

            const signature = await signer.signMessage(digestBytes);

            setStatus("Submitting to Relayer...");
            const pendingTx = await submitRemoteBid(
                account,
                signature,
                currentNonce,
                sellerAddr,
                usdVal,
                u,
                v
            );

            setStatus(`Bid Submitted! Tx: ${pendingTx.hash}`);

        } catch (error: any) {
            console.error(error);
            setStatus(`Error: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
            <h2 className="text-xl font-semibold mb-4 border-b border-gray-700 pb-2">Submit Bid</h2>
            <div className="space-y-4">
                <div>
                    <label className="block text-gray-400 text-sm">Seller Address</label>
                    <input
                        value={sellerAddr}
                        onChange={(e) => setSellerAddr(e.target.value)}
                        placeholder="0x..."
                        className="w-full bg-gray-700 p-2 rounded text-white"
                    />
                </div>
                <div>
                    <label className="block text-gray-400 text-sm">Bid Amount (FAKEUSD)</label>
                    <input
                        type="number"
                        value={amountUsd}
                        onChange={(e) => setAmountUsd(e.target.value)}
                        className="w-full bg-gray-700 p-2 rounded text-white"
                    />
                </div>
                <div>
                    <label className="block text-gray-400 text-sm">Auction End Time (ID)</label>
                    <input
                        type="number"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        placeholder="Unix Timestamp"
                        className="w-full bg-gray-700 p-2 rounded text-white"
                    />
                </div>
                <div>
                    <label className="block text-gray-400 text-sm">MPK (Hex)</label>
                    <textarea
                        value={mpk}
                        onChange={(e) => setMpk(e.target.value)}
                        placeholder="0x..."
                        className="w-full bg-gray-700 p-2 rounded text-white h-12 font-mono text-xs"
                    />
                </div>

                <div className="text-sm text-gray-500 font-mono text-center">
                    Nonce: {nonce}
                </div>

                <button
                    onClick={handleBid}
                    disabled={loading}
                    className={`w-full py-2 rounded text-white font-bold transition ${loading ? "bg-gray-600 cursor-not-allowed" : "bg-purple-600 hover:bg-purple-700"
                        }`}
                >
                    {loading ? "Processing..." : "Encrypt & Bid"}
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
