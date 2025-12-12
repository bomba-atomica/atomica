import { useState, useEffect } from "react";
import { requestAPT, requestTestTokens, areContractsDeployed } from "../lib/aptos";

export function Faucet({ account }: { account: string }) {
  const [loadingAPT, setLoadingAPT] = useState(false);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [aptTxHash, setAptTxHash] = useState<string | null>(null);
  const [tokensTxHash, setTokensTxHash] = useState<string | null>(null);
  const [contractsDeployed, setContractsDeployed] = useState(false);

  // Check if contracts are deployed
  useEffect(() => {
    const checkContracts = async () => {
      const deployed = await areContractsDeployed();
      setContractsDeployed(deployed);
    };

    checkContracts();
    // Poll every 5 seconds to detect when contracts are deployed
    const interval = setInterval(checkContracts, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleRequestAPT = async () => {
    if (!account) return;
    setLoadingAPT(true);
    setAptTxHash(null);
    try {
      const result = await requestAPT(account);
      setAptTxHash(result.hash);
    } catch (e) {
      console.error("APT request failed:", e);
      alert("Failed to request APT: " + e);
    } finally {
      setLoadingAPT(false);
    }
  };

  const handleRequestTokens = async () => {
    if (!account) return;
    setLoadingTokens(true);
    setTokensTxHash(null);
    try {
      const result = await requestTestTokens(account);
      setTokensTxHash(result.hash);
    } catch (e) {
      console.error("Test tokens request failed:", e);
      alert("Failed to request test tokens: " + e);
    } finally {
      setLoadingTokens(false);
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
      <h2 className="text-xl font-bold mb-4 text-purple-400">
        1. Get Testnet Funds
      </h2>
      <p className="text-gray-400 mb-6 text-sm">
        Get tokens to interact with the auction demo.
      </p>

      {/* Step 1: Request APT for gas */}
      <div className="mb-4 p-4 bg-gray-900 rounded">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-blue-300">
            Step 1a: Request APT (Gas Tokens)
          </h3>
          {aptTxHash && (
            <span className="text-xs text-green-400">✓ Completed</span>
          )}
        </div>
        <p className="text-xs text-gray-500 mb-3">
          APT tokens are used to pay for transaction gas fees on Aptos.
        </p>
        <button
          onClick={handleRequestAPT}
          disabled={loadingAPT || !!aptTxHash}
          className={`w-full py-2 px-4 rounded font-medium text-sm ${
            loadingAPT || !!aptTxHash
              ? "bg-gray-700 cursor-not-allowed text-gray-500"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          }`}
        >
          {loadingAPT
            ? "Requesting APT..."
            : aptTxHash
            ? "APT Received ✓"
            : "Request APT"}
        </button>
        {aptTxHash && (
          <div className="mt-2 p-2 bg-gray-800 rounded text-xs break-all font-mono text-green-400">
            Success! APT tokens added to your account
          </div>
        )}
      </div>

      {/* Step 2: Request Test Tokens */}
      <div className="mb-4 p-4 bg-gray-900 rounded">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-purple-300">
            Step 1b: Request Test Tokens (FAKEETH & FAKEUSD)
          </h3>
          {tokensTxHash && (
            <span className="text-xs text-green-400">✓ Completed</span>
          )}
        </div>

        {!contractsDeployed ? (
          <div className="text-xs text-yellow-400 mb-3">
            ⏳ Waiting for contracts to be deployed...
          </div>
        ) : (
          <p className="text-xs text-gray-500 mb-3">
            Mint 10 FAKEETH and 10,000 FAKEUSD for testing auctions.
          </p>
        )}

        <button
          onClick={handleRequestTokens}
          disabled={loadingTokens || !!tokensTxHash || !contractsDeployed}
          className={`w-full py-2 px-4 rounded font-medium text-sm ${
            loadingTokens || !!tokensTxHash || !contractsDeployed
              ? "bg-gray-700 cursor-not-allowed text-gray-500"
              : "bg-purple-600 hover:bg-purple-700 text-white"
          }`}
        >
          {loadingTokens
            ? "Minting Tokens..."
            : tokensTxHash
            ? "Tokens Received ✓"
            : !contractsDeployed
            ? "Contracts Not Deployed"
            : "Request Test Tokens"}
        </button>

        {tokensTxHash && (
          <div className="mt-2 p-2 bg-gray-800 rounded text-xs break-all font-mono text-green-400">
            Success! 10 FAKEETH and 10,000 FAKEUSD minted
          </div>
        )}
      </div>

      {/* Status indicator */}
      <div className="mt-4 pt-4 border-t border-gray-700">
        <div className="text-xs text-gray-500">
          {!aptTxHash && !tokensTxHash && (
            <p>📍 Start by requesting APT tokens above</p>
          )}
          {aptTxHash && !tokensTxHash && !contractsDeployed && (
            <p>⏳ APT received. Waiting for contracts...</p>
          )}
          {aptTxHash && !tokensTxHash && contractsDeployed && (
            <p>✅ APT received. Now request test tokens.</p>
          )}
          {aptTxHash && tokensTxHash && (
            <p className="text-green-400">
              ✅ All setup complete! You can now create or bid on auctions.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
