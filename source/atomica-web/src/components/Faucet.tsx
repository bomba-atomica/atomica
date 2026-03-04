import { useState } from "react";
import { requestAPT } from "../lib/aptos";
import { requestEthTokens } from "../lib/ethereum/transaction";
import { useWallet } from "../context/WalletContext";
import { useBalances } from "../context/BalancesContext";
import { useContractStatus } from "../context/ContractStatusContext";

export function Faucet() {
  const { account } = useWallet();
  const { refresh } = useBalances();
  const { aptosAlive, evmAlive, evmStatus } = useContractStatus();

  const aptosReady = aptosAlive === true;
  const evmReady = evmAlive === true && evmStatus === "ready";
  const [loadingAPT, setLoadingAPT] = useState(false);
  const [loadingEthTokens, setLoadingEthTokens] = useState(false);
  const [aptTxHash, setAptTxHash] = useState<string | null>(null);
  const [ethTxHash, setEthTxHash] = useState<string | null>(null);
  const [usdTxHash, setUsdTxHash] = useState<string | null>(null);
  const [ethTokensError, setEthTokensError] = useState<string | null>(null);

  const handleRequestAPT = async () => {
    if (!account) return;
    setLoadingAPT(true);
    setAptTxHash(null);
    try {
      const result = await requestAPT(account);
      setAptTxHash(result.hash);
      await refresh();
    } catch (e) {
      console.error("APT request failed:", e);
      alert("Failed to request APT: " + e);
    } finally {
      setLoadingAPT(false);
    }
  };

  function extractErrorMessage(e: unknown): string {
    if (e instanceof Error) return e.message;
    if (e !== null && typeof e === "object") {
      const obj = e as Record<string, unknown>;
      if (typeof obj.message === "string") return obj.message;
      if (typeof obj.reason === "string") return obj.reason;
      return JSON.stringify(obj);
    }
    return String(e);
  }

  const handleMintEthTokens = async () => {
    if (!account) return;
    setLoadingEthTokens(true);
    setEthTxHash(null);
    setUsdTxHash(null);
    setEthTokensError(null);
    try {
      const result = await requestEthTokens(account);
      setEthTxHash(result.ethTxHash);
      setUsdTxHash(result.usdTxHash);
      await refresh();
    } catch (e: unknown) {
      setEthTokensError(extractErrorMessage(e));
      console.error("Ethereum token faucet failed:", e);
    } finally {
      setLoadingEthTokens(false);
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

      {/* APT gas tokens (server-side funder) */}
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
          APT tokens pay for transaction fees on Aptos (funded by the demo API).
        </p>
        <button
          onClick={handleRequestAPT}
          disabled={!aptosReady || loadingAPT || !!aptTxHash}
          className={`w-full py-2 px-4 rounded font-medium text-sm transition-colors ${
            !aptosReady || loadingAPT || !!aptTxHash
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

      {/* FakeETH and FakeUSD (minted server-side by funder account) */}
      <div className="mb-4 p-4 bg-zinc-950/50 border border-zinc-900 rounded">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-zinc-400">
            Step 1b: Get Test Tokens (Ethereum)
          </h3>
          {ethTxHash && usdTxHash && (
            <span className="text-xs text-zinc-500">✓ Completed</span>
          )}
        </div>
        <p className="text-xs text-zinc-600 mb-3">
          10 FakeETH and 10,000 FakeUSD sent to your address (funded by the demo
          API).
        </p>
        <button
          onClick={handleMintEthTokens}
          disabled={!evmReady || loadingEthTokens || (!!ethTxHash && !!usdTxHash)}
          className={`w-full py-2 px-4 rounded font-medium text-sm transition-colors ${
            !evmReady || loadingEthTokens || (!!ethTxHash && !!usdTxHash)
              ? "bg-zinc-800 cursor-not-allowed text-zinc-600"
              : "bg-zinc-100 hover:bg-white text-zinc-900"
          }`}
        >
          {loadingEthTokens
            ? "Requesting tokens..."
            : ethTxHash && usdTxHash
              ? "Tokens Received"
              : "Request ETH Tokens"}
        </button>
        {ethTxHash && usdTxHash && (
          <div className="mt-2 p-2 bg-zinc-900 text-zinc-400 rounded text-xs break-all font-mono border border-zinc-800">
            Success! 10 FakeETH and 10,000 FakeUSD added to your account
          </div>
        )}
        {ethTokensError && (
          <div className="mt-2 text-[10px] text-zinc-500 break-words font-mono">
            {ethTokensError}
          </div>
        )}
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
