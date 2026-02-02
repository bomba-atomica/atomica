import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { testSimpleAPTTransfer, getDerivedAddress, aptos, } from "@atomica/aptos-docker-testnet/browser";
export function SanityTest({ account }) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState(null);
    const [accountExists, setAccountExists] = useState(false);
    const [checkingAccount, setCheckingAccount] = useState(false);
    // Default to a random address
    const [recipient, setRecipient] = useState(() => "0x" +
        Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""));
    // Check if the derived account exists on chain
    useEffect(() => {
        // ... existing check logic ...
        const checkAccount = async () => {
            if (!account)
                return;
            setCheckingAccount(true);
            try {
                const derived = await getDerivedAddress(account.toLowerCase());
                await aptos.getAccountInfo({ accountAddress: derived });
                setAccountExists(true);
            }
            catch {
                setAccountExists(false);
            }
            finally {
                setCheckingAccount(false);
            }
        };
        checkAccount();
        const interval = setInterval(checkAccount, 3000);
        return () => clearInterval(interval);
    }, [account]);
    const runTest = async () => {
        if (!account)
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
    return (_jsxs("details", { className: "group bg-gray-900/50 p-4 rounded-lg border border-gray-800 open:border-yellow-900/50 transition-all", children: [_jsxs("summary", { className: "flex items-center justify-between cursor-pointer list-none select-none", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: "text-xl group-open:rotate-90 transition-transform", children: "\u25B8" }), _jsxs("h2", { className: "text-sm font-semibold text-gray-400 group-hover:text-yellow-400 transition-colors", children: ["Diagnostic: Sanity Test", " ", checkingAccount && (_jsx("span", { className: "animate-pulse ml-2 text-xs font-normal opacity-50", children: "Checking chain..." }))] })] }), !accountExists && !checkingAccount && (_jsx("span", { className: "text-xs text-red-500 bg-red-900/20 px-2 py-1 rounded", children: "Account Not Found" }))] }), _jsxs("div", { className: "mt-4 pl-2", children: [_jsx("div", { className: "mb-4 text-xs text-gray-500", children: _jsxs("p", { className: "mb-2", children: ["Verifies that your MetaMask signature can be verified by the Aptos Move VM. Runs a standard ", _jsx("code", { children: "0x1::aptos_account::transfer" }), "."] }) }), _jsxs("div", { className: "mb-4", children: [_jsx("label", { className: "block text-[10px] uppercase tracking-wider text-gray-500 mb-1", children: "Target Address" }), _jsx("input", { type: "text", value: recipient, onChange: (e) => setRecipient(e.target.value), className: "w-full bg-black/30 border border-gray-700 rounded px-3 py-2 text-xs text-gray-300 font-mono focus:outline-none focus:border-yellow-600/50 transition-colors", placeholder: "0x..." })] }), !accountExists && (_jsx("div", { className: "mb-3 p-2 bg-red-900/10 border border-red-900/30 rounded text-xs text-red-400", children: "\u26A0 Aptos account not found. Please use the Faucet above first." })), _jsx("button", { onClick: runTest, disabled: loading || !accountExists, className: `w-full py-2 px-4 rounded text-sm font-medium transition-all ${loading || !accountExists
                            ? "bg-gray-800 text-gray-600 cursor-not-allowed"
                            : "bg-yellow-900/20 text-yellow-500 hover:bg-yellow-900/40 border border-yellow-900/50"}`, children: loading
                            ? "Verifying Signature..."
                            : !accountExists
                                ? "Fund Account First"
                                : "Run Diagnostic Test" }), result && (_jsx("div", { className: `mt-3 p-3 rounded text-xs border ${result.success
                            ? "bg-green-900/10 border-green-900/30 text-green-400"
                            : "bg-red-900/10 border-red-900/30 text-red-400"}`, children: _jsxs("div", { className: "flex items-start gap-2", children: [_jsx("span", { className: "text-lg", children: result.success ? "✓" : "✕" }), _jsxs("div", { children: [_jsx("p", { className: "font-semibold mb-1", children: result.success
                                                ? "Verification Passed"
                                                : "Verification Failed" }), result.hash && (_jsx("p", { className: "font-mono opacity-80 break-all select-all", children: result.hash })), result.error && (_jsx("p", { className: "font-mono opacity-80 break-all", children: result.error })), result.success && (_jsx("p", { className: "mt-1 opacity-60", children: "Signature logic is correct." }))] })] }) }))] })] }));
}
//# sourceMappingURL=SanityTest.js.map