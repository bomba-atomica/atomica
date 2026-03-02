import { useState } from "react";
import { requestAPT } from "../lib/aptos";
import { mint10FakeETH, mint10kFakeUSD } from "../lib/ethereum/transaction";

export function Faucet({
  account,
  onMintSuccess,
}: {
  account: string;
  onMintSuccess?: () => void;
}) {
  const [loadingAPT, setLoadingAPT] = useState(false);
  const [loadingETH, setLoadingETH] = useState(false);
  const [loadingUSD, setLoadingUSD] = useState(false);

  const [aptTxHash, setAptTxHash] = useState<string | null>(null);
  const [ethTxHash, setEthTxHash] = useState<string | null>(null);
  const [usdTxHash, setUsdTxHash] = useState<string | null>(null);

  const [ethError, setEthError] = useState<string | null>(null);
  const [usdError, setUsdError] = useState<string | null>(null);

  const handleRequestAPT = async () => {
    if (!account) return;
    setLoadingAPT(true);
    setAptTxHash(null);
    try {
      const result = await requestAPT(account);
      setAptTxHash(result.hash);
      onMintSuccess?.();
    } catch (e) {
      console.error("APT request failed:", e);
      alert("Failed to request APT: " + e);
    } finally {
      setLoadingAPT(false);
    }
  };

  const handleMintETH = async () => {
    setLoadingETH(true);
    setEthTxHash(null);
    setEthError(null);
    try {
      const result = await mint10FakeETH();
      setEthTxHash(result.hash);
      // Wait for confirmation then refresh balances
      await result.wait();
      onMintSuccess?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setEthError(msg);
      console.error("FakeETH mint failed:", e);
    } finally {
      setLoadingETH(false);
    }
  };

  const handleMintUSD = async () => {
    setLoadingUSD(true);
    setUsdTxHash(null);
    setUsdError(null);
    try {
      const result = await mint10kFakeUSD();
      setUsdTxHash(result.hash);
      await result.wait();
      onMintSuccess?.();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setUsdError(msg);
      console.error("FakeUSD mint failed:", e);
    } finally {
      setLoadingUSD(false);
    }
  };

  return (
    <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
      <h2 className="text-xl font-bold mb-4 text-zinc-300">
        1. Get Testnet Funds
      </h2>
      <p className="text-zinc-500 mb-6 text-sm">
        Get tokens to interact with the auction demo.
      </p>

      {/* APT gas tokens (Aptos faucet) */}
      <div className="mb-4 p-4 bg-zinc-950/50 border border-zinc-900 rounded">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-zinc-400">
            Step 1a: Request APT (Gas Tokens)
          </h3>
          {aptTxHash && (
            <span className="text-xs text-zinc-500">✓ Completed</span>
          )}
        </div>
        <p className="text-xs text-zinc-600 mb-3">
          APT tokens pay for transaction fees on Aptos.
        </p>
        <button
          onClick={handleRequestAPT}
          disabled={loadingAPT || !!aptTxHash}
          className={`w-full py-2 px-4 rounded font-medium text-sm transition-colors ${
            loadingAPT || !!aptTxHash
              ? "bg-zinc-800 cursor-not-allowed text-zinc-600"
              : "bg-zinc-100 hover:bg-white text-zinc-900"
          }`}
        >
          {loadingAPT
            ? "Requesting APT..."
            : aptTxHash
              ? "APT Received"
              : "Request APT"}
        </button>
        {aptTxHash && (
          <div className="mt-2 p-2 bg-zinc-900 text-zinc-400 rounded text-xs break-all font-mono border border-zinc-800">
            Success! APT tokens added to your account
          </div>
        )}
      </div>

      {/* FakeETH and FakeUSD (minted on Ethereum via MetaMask) */}
      <div className="mb-4 p-4 bg-zinc-950/50 border border-zinc-900 rounded">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-zinc-400">
            Step 1b: Mint Test Tokens (Ethereum)
          </h3>
        </div>
        <p className="text-xs text-zinc-600 mb-3">
          Mint FakeETH and FakeUSD on the Ethereum testnet via MetaMask.
        </p>

        <div className="grid grid-cols-2 gap-4">
          {/* FakeETH */}
          <div>
            <button
              onClick={handleMintETH}
              disabled={loadingETH || !!ethTxHash}
              className={`w-full py-2 px-4 rounded font-medium text-sm transition-colors ${
                loadingETH || !!ethTxHash
                  ? "bg-zinc-800 cursor-not-allowed text-zinc-600"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              }`}
            >
              {loadingETH ? "Minting..." : ethTxHash ? "✓ 10 ETH" : "10 ETH"}
            </button>
            {ethTxHash && (
              <div className="mt-1 text-[10px] text-zinc-500 break-all font-mono">
                Tx: {ethTxHash.slice(0, 10)}...
              </div>
            )}
            {ethError && (
              <div className="mt-1 text-[10px] text-zinc-500 break-words font-mono">
                {ethError}
              </div>
            )}
          </div>

          {/* FakeUSD */}
          <div>
            <button
              onClick={handleMintUSD}
              disabled={loadingUSD || !!usdTxHash}
              className={`w-full py-2 px-4 rounded font-medium text-sm transition-colors ${
                loadingUSD || !!usdTxHash
                  ? "bg-zinc-800 cursor-not-allowed text-zinc-600"
                  : "bg-zinc-800 hover:bg-zinc-700 text-zinc-200"
              }`}
            >
              {loadingUSD
                ? "Minting..."
                : usdTxHash
                  ? "✓ 10k USD"
                  : "10k USD"}
            </button>
            {usdTxHash && (
              <div className="mt-1 text-[10px] text-zinc-500 break-all font-mono">
                Tx: {usdTxHash.slice(0, 10)}...
              </div>
            )}
            {usdError && (
              <div className="mt-1 text-[10px] text-zinc-500 break-words font-mono">
                {usdError}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Status indicator */}
      <div className="mt-4 pt-4 border-t border-zinc-800">
        <div className="text-xs text-zinc-500">
          {!aptTxHash && !ethTxHash && !usdTxHash && (
            <p>Start by requesting APT tokens above</p>
          )}
          {aptTxHash && !ethTxHash && !usdTxHash && (
            <p>APT received. Now mint test tokens on Ethereum.</p>
          )}
          {ethTxHash && usdTxHash && (
            <p className="text-zinc-400">
              All setup complete! You can now create or bid on auctions.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
