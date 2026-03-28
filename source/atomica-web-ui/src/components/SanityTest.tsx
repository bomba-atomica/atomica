import { useState, useEffect } from "react";
import {
  testSimpleAPTTransfer,
  getDerivedAddress,
  aptos,
} from "@atomica/aptos-docker-testnet/browser";

export function SanityTest() {
  const { account } = useWallet();
  const { aptosBalances } = useBalances();
  const ready =
    !!account && aptosBalances.aptAccountExists && aptosBalances.apt > 0;
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    hash?: string;
    error?: string;
  } | null>(null);

  // Default to a random address
  const [recipient, setRecipient] = useState(
    () =>
      "0x" +
      Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16),
      ).join(""),
  );

  const runTest = async () => {
    if (!ready) return;
    setLoading(true);
    setResult(null);
    try {
      const testResult = await testSimpleAPTTransfer(account, recipient);
      setResult(testResult);
    } catch (e: unknown) {
      console.error("Sanity test error:", e);
      setResult({
        success: false,
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 flex flex-col gap-4">
      {/* Description */}
      <div className="flex flex-col gap-1">
        <span className="text-sm text-zinc-300 font-medium">
          Check Wallet SIWE Compatibility
        </span>
        <span className="text-xs text-zinc-500">
          Verifies that your MetaMask signature can be verified by the Aptos
          Move VM via a{" "}
          <code className="font-mono">0x1::aptos_account::transfer</code>.
        </span>
      </div>

      <div className="h-px bg-zinc-800" />

      {/* Target address input */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-zinc-500 uppercase tracking-wider">
          Target Address
        </label>
        <input
          type="text"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          className="w-full bg-zinc-800/60 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-300 font-mono focus:outline-none focus:border-zinc-500 transition-colors"
          placeholder="0x..."
        />
      </div>

      {/* Prerequisite hint */}
      {!account && (
        <p className="text-xs text-zinc-500 border-l-2 border-zinc-700 pl-2">
          Connect your wallet to run this check.
        </p>
      )}
      {account && !aptosBalances.aptAccountExists && (
        <p className="text-xs text-zinc-500 border-l-2 border-zinc-700 pl-2">
          ⚠ Atomica account not found. Use the Faucet to fund it first.
        </p>
      )}
      {account && aptosBalances.aptAccountExists && aptosBalances.apt === 0 && (
        <p className="text-xs text-zinc-500 border-l-2 border-zinc-700 pl-2">
          ⚠ Atomica account has no APT balance. Use the Faucet to fund it first.
        </p>
      )}

      {/* Run button */}
      <button
        onClick={runTest}
        disabled={!ready || loading}
        className={`w-full py-2 px-4 rounded text-sm font-medium transition-all ${
          !ready || loading
            ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
            : "bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
        }`}
      >
        {loading ? "Verifying…" : "Run Check"}
      </button>

      {/* Result */}
      {result && (
        <div
          className={`p-3 rounded text-xs border ${
            result.success
              ? "bg-zinc-800/60 border-zinc-700 text-zinc-300"
              : "bg-zinc-800/60 border-zinc-700 text-red-400"
          }`}
        >
          <div className="flex items-start gap-2">
            <span>{result.success ? "✓" : "✕"}</span>
            <div>
              <p className="font-semibold mb-1">
                {result.success ? "Verification Passed" : "Verification Failed"}
              </p>
              {result.hash && (
                <p className="font-mono opacity-80 break-all select-all">
                  {result.hash}
                </p>
              )}
              {result.error && (
                <p className="font-mono opacity-80 break-all">{result.error}</p>
              )}
              {result.success && (
                <p className="mt-1 opacity-60">Signature logic is correct.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
