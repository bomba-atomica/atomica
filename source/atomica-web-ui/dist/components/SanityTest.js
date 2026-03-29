import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from "react";
import { testSimpleAPTTransfer } from "@atomica/aptos-docker-testnet/browser";
import { useWallet } from "../context/WalletContext";
import { useBalances } from "../context/BalancesContext";
export function SanityTest() {
    const { account } = useWallet();
    const { aptosBalances } = useBalances();
    const ready = !!account && aptosBalances.aptAccountExists && aptosBalances.apt > 0;
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    // Default to a random address
    const [recipient, setRecipient] = useState(() => "0x" +
        Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""));
    const runTest = async () => {
        if (!ready)
            return;
        setLoading(true);
        setResult(null);
        try {
            const testResult = await testSimpleAPTTransfer(account, recipient);
            setResult(testResult);
        }
        catch (e) {
            console.error("Sanity test error:", e);
            setResult({
                success: false,
                error: e instanceof Error ? e.message : String(e),
            });
        }
        finally {
            setLoading(false);
        }
    };
    return (_jsxs("div", { className: "bg-zinc-900 border border-zinc-800 rounded-lg p-5 flex flex-col gap-4", children: [_jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("span", { className: "text-sm text-zinc-300 font-medium", children: "Check Wallet SIWE Compatibility" }), _jsxs("span", { className: "text-xs text-zinc-500", children: ["Verifies that your MetaMask signature can be verified by the Aptos Move VM via a", " ", _jsx("code", { className: "font-mono", children: "0x1::aptos_account::transfer" }), "."] })] }), _jsx("div", { className: "h-px bg-zinc-800" }), _jsxs("div", { className: "flex flex-col gap-1", children: [_jsx("label", { className: "text-xs text-zinc-500 uppercase tracking-wider", children: "Target Address" }), _jsx("input", { type: "text", value: recipient, onChange: (e) => setRecipient(e.target.value), className: "w-full bg-zinc-800/60 border border-zinc-700 rounded px-3 py-2 text-xs text-zinc-300 font-mono focus:outline-none focus:border-zinc-500 transition-colors", placeholder: "0x..." })] }), !account && (_jsx("p", { className: "text-xs text-zinc-500 border-l-2 border-zinc-700 pl-2", children: "Connect your wallet to run this check." })), account && !aptosBalances.aptAccountExists && (_jsx("p", { className: "text-xs text-zinc-500 border-l-2 border-zinc-700 pl-2", children: "\u26A0 Atomica account not found. Use the Faucet to fund it first." })), account && aptosBalances.aptAccountExists && aptosBalances.apt === 0 && (_jsx("p", { className: "text-xs text-zinc-500 border-l-2 border-zinc-700 pl-2", children: "\u26A0 Atomica account has no APT balance. Use the Faucet to fund it first." })), _jsx("button", { onClick: runTest, disabled: !ready || loading, className: `w-full py-2 px-4 rounded text-sm font-medium transition-all ${!ready || loading
                    ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                    : "bg-zinc-700 text-zinc-200 hover:bg-zinc-600"}`, children: loading ? "Verifying…" : "Run Check" }), result && (_jsx("div", { className: `p-3 rounded text-xs border ${result.success
                    ? "bg-zinc-800/60 border-zinc-700 text-zinc-300"
                    : "bg-zinc-800/60 border-zinc-700 text-red-400"}`, children: _jsxs("div", { className: "flex items-start gap-2", children: [_jsx("span", { children: result.success ? "✓" : "✕" }), _jsxs("div", { children: [_jsx("p", { className: "font-semibold mb-1", children: result.success ? "Verification Passed" : "Verification Failed" }), result.hash && (_jsx("p", { className: "font-mono opacity-80 break-all select-all", children: result.hash })), result.error && (_jsx("p", { className: "font-mono opacity-80 break-all", children: result.error })), result.success && (_jsx("p", { className: "mt-1 opacity-60", children: "Signature logic is correct." }))] })] }) }))] }));
}
//# sourceMappingURL=SanityTest.js.map