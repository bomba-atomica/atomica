import { useState } from "react";
import { testSimpleAPTTransfer } from "../lib/aptos";

export function SanityTest({ account }: { account: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; hash?: string; error?: string } | null>(null);

  const runTest = async () => {
    if (!account) return;

    setLoading(true);
    setResult(null);

    try {
      const testResult = await testSimpleAPTTransfer(account);
      setResult(testResult);
    } catch (e: any) {
      console.error("Sanity test error:", e);
      setResult({ success: false, error: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 p-6 rounded-lg shadow-lg border-2 border-yellow-600">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-yellow-400">
          🧪 Sanity Test
        </h2>
        <span className="text-xs bg-yellow-600 text-black px-2 py-1 rounded font-semibold">
          DIAGNOSTIC
        </span>
      </div>

      <div className="mb-4 p-3 bg-gray-900 rounded text-sm">
        <p className="text-gray-300 mb-2">
          <strong>What this does:</strong>
        </p>
        <ul className="text-gray-400 text-xs space-y-1 ml-4 list-disc">
          <li>Tests MetaMask signature verification with simplest transaction</li>
          <li>Uses standard <code className="bg-gray-800 px-1 rounded">aptos_account::transfer</code></li>
          <li>No custom contracts - just core Aptos functionality</li>
          <li>Transfers 100 octas (0.000001 APT) to random address</li>
        </ul>
      </div>

      <div className="mb-4 p-3 bg-blue-900/20 border border-blue-700 rounded text-sm">
        <p className="text-blue-300 font-semibold mb-1">Why run this?</p>
        <p className="text-blue-200 text-xs">
          If this fails → signature verification is broken<br />
          If this passes → the issue is specific to FAKEETH contract
        </p>
      </div>

      <button
        onClick={runTest}
        disabled={loading}
        className={`w-full py-3 px-4 rounded font-medium ${
          loading
            ? "bg-gray-700 cursor-not-allowed text-gray-500"
            : "bg-yellow-600 hover:bg-yellow-700 text-black"
        }`}
      >
        {loading ? "Running Test..." : "Run Sanity Test"}
      </button>

      {result && (
        <div className={`mt-4 p-4 rounded border ${
          result.success
            ? "bg-green-900/20 border-green-700"
            : "bg-red-900/20 border-red-700"
        }`}>
          {result.success ? (
            <>
              <div className="flex items-center mb-2">
                <span className="text-2xl mr-2">✅</span>
                <span className="text-green-400 font-bold">Test Passed!</span>
              </div>
              <p className="text-green-300 text-sm mb-2">
                Signature verification is working correctly.
              </p>
              {result.hash && (
                <div className="mt-2 p-2 bg-gray-800 rounded">
                  <p className="text-xs text-gray-400 mb-1">Transaction Hash:</p>
                  <p className="text-xs font-mono text-green-400 break-all">
                    {result.hash}
                  </p>
                </div>
              )}
              <p className="text-yellow-300 text-xs mt-3">
                💡 Since this passed, the FAKEETH mint issue is likely contract-specific.
              </p>
            </>
          ) : (
            <>
              <div className="flex items-center mb-2">
                <span className="text-2xl mr-2">❌</span>
                <span className="text-red-400 font-bold">Test Failed</span>
              </div>
              <p className="text-red-300 text-sm mb-2">
                Signature verification is not working.
              </p>
              {result.error && (
                <div className="mt-2 p-2 bg-gray-800 rounded">
                  <p className="text-xs text-gray-400 mb-1">Error:</p>
                  <p className="text-xs font-mono text-red-400 break-all">
                    {result.error}
                  </p>
                </div>
              )}
              <p className="text-yellow-300 text-xs mt-3">
                💡 Check the browser console for detailed error information.
              </p>
            </>
          )}
        </div>
      )}

      <div className="mt-4 text-xs text-gray-500 italic">
        Check browser console for detailed logs
      </div>
    </div>
  );
}
