import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { submitRemoteFaucet, getNonce, computeFaucetDigest } from '../lib/aptos';

interface FaucetProps {
    account: string;
}

export function Faucet({ account }: FaucetProps) {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState<string | null>(null);
    const [nonce, setNonce] = useState<number>(0);

    useEffect(() => {
        if (account) {
            getNonce(account).then(setNonce);
        }
    }, [account]);

    const handleRequest = async () => {
        if (!window.ethereum) return;
        setLoading(true);
        setStatus("Fetching nonce...");

        try {
            // Refresh nonce to be sure
            const currentNonce = await getNonce(account);
            setNonce(currentNonce);

            const provider = new ethers.BrowserProvider(window.ethereum);
            const signer = await provider.getSigner();

            setStatus(`Signing Faucet Request (Nonce: ${currentNonce})...`);

            // 1. Compute Inner Digest (matches Move)
            const digestBytes = computeFaucetDigest(currentNonce);

            // 2. Sign Outer Digest (MetaMask does the prefixinging)
            // We pass the raw bytes of the digest so ethers treats it as binary data.
            const signature = await signer.signMessage(digestBytes);

            setStatus("Submitting to Relayer...");

            // 3. Submit
            const pendingTx = await submitRemoteFaucet(
                account,
                signature,
                currentNonce
            );

            setStatus(`Transaction submitted: ${pendingTx.hash}`);

            // Update nonce locally for UI optimistically?
            // setNonce(currentNonce + 1);

        } catch (error: any) {
            console.error(error);
            setStatus(`Error: ${error.message || "Unknown error"}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="text-center">
            <p className="mb-4 text-gray-300">
                You can request 10 FAKEETH and 100,000 FAKEUSD to participate in auctions.
            </p>
            <div className="mb-4 text-sm text-gray-500 font-mono">
                Current Nonce: {nonce}
            </div>
            <button
                onClick={handleRequest}
                disabled={loading}
                className={`w-full py-2 rounded text-white font-bold transition ${loading ? "bg-gray-600 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"
                    }`}
            >
                {loading ? "Processing..." : "Request Assets (Sign & Submit)"}
            </button>
            {status && (
                <div className="mt-4 text-sm font-mono text-yellow-400 break-all p-2 bg-gray-900 rounded">
                    {status}
                </div>
            )}
        </div>
    );
}
