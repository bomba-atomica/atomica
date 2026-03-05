import { useState, useEffect } from "react";
import { testSimpleAPTTransfer, getDerivedAddress, aptos } from "../lib/aptos";
import { useNetworkConfig } from "../lib/network-config-state";
import { useWallet } from "../context/WalletContext";

export function SanityTest() {
  const { account } = useWallet();
  const { host } = useNetworkConfig();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    hash?: string;
    error?: string;
  } | null>(null);
  const [accountExists, setAccountExists] = useState(false);
  const [checkingAccount, setCheckingAccount] = useState(false);

  // Default to a random address
  const [recipient, setRecipient] = useState(
    () =>
      "0x" +
      Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16),
      ).join(""),
  );

  // Poll until the derived Atomica account is confirmed on-chain.
  // Uses exponential back-off on failure so we don't hammer the node.
  useEffect(() => {
    const baseDelayMs = 3000;
    const maxDelayMs = 30000;
    let cancelled = false;
    let retryCount = 0;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const checkAccount = async () => {
      if (!account) return;
      setCheckingAccount(true);
      let failed = false;
      try {
        const derived = await getDerivedAddress(account.toLowerCase());
        await aptos.getAccountInfo({ accountAddress: derived });
        setAccountExists(true);
      } catch {
        setAccountExists(false);
        failed = true;
      } finally {
        setCheckingAccount(false);
        retryCount = failed ? retryCount + 1 : 0;
        const nextDelay = failed
          ? Math.min(baseDelayMs * 2 ** retryCount, maxDelayMs)
          : baseDelayMs;
        if (!cancelled) {
          timeout = setTimeout(() => void checkAccount(), nextDelay);
        }
      }
    };

    void checkAccount();
    return () => {
      cancelled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [account, host]);

  const runTest = async () => {
    if (!account) return;
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-zinc-300 font-medium">
            Check Wallet SIWE Compatibility
            {checkingAccount && (
              <span className="animate-pulse ml-2 text-xs font-normal text-zinc-500">
                Checking chain…
              </span>
            )}
          </span>
          <span className="text-xs text-zinc-500">
            Verifies that your MetaMask signature can be verified by the Aptos
            Move VM via a{" "}
            <code className="font-mono">0x1::aptos_account::transfer</code>.
          </span>
        </div>
        {!accountExists && !checkingAccount && (
          <span className="text-xs text-red-400 bg-red-900/20 border border-red-900/40 px-2 py-1 rounded flex-shrink-0">
            Account not on chain
          </span>
        )}
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

      {/* Warning when account not yet on chain */}
      {!accountExists && !checkingAccount && (
        <p className="text-xs text-zinc-500 border-l-2 border-zinc-700 pl-2">
          ⚠ Atomica account not found. Use the Faucet to fund it first.
        </p>
      )}

      {/* Run button */}
      <button
        onClick={runTest}
        disabled={loading || !accountExists}
        className={`w-full py-2 px-4 rounded text-sm font-medium transition-all ${
          loading || !accountExists
            ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
            : "bg-zinc-700 text-zinc-200 hover:bg-zinc-600"
        }`}
      >
        {loading
          ? "Verifying…"
          : !accountExists
            ? "Fund Account First"
            : "Run Check"}
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
