import { useState } from "react";
import { submitFaucet } from "../lib/aptos";

export function Faucet({ account }: { account: string }) {
  const [loading, setLoading] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleFaucet = async () => {
    if (!account) return;
    setLoading(true);
    setTxHash(null);
    try {
      const result = await submitFaucet(account);
      setTxHash(typeof result === "string" ? result : (result as any).hash);
    } catch (e) {
      console.error(e);
      alert("Faucet failed: " + e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
      <h2 className="text-xl font-bold mb-4 text-purple-400">
        1. Get Testnet Funds
      </h2>
      <p className="text-gray-400 mb-4 text-sm">
        Request standard Aptos Coin (APT) to your derived address to pay for
        gas.
      </p>

      <button
        onClick={handleFaucet}
        disabled={loading}
        className={`w-full py-2 px-4 rounded font-bold ${
          loading
            ? "bg-gray-600 cursor-not-allowed"
            : "bg-purple-600 hover:bg-purple-700"
        }`}
      >
        {loading ? "Requesting..." : "Request Funds"}
      </button>

      {txHash && (
        <div className="mt-4 p-2 bg-gray-900 rounded text-xs break-all font-mono text-green-400">
          Success! Hash/ID: {txHash}
        </div>
      )}
    </div>
  );
}
