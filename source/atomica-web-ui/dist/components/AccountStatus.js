import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { getDerivedAddress } from "@atomica/aptos-docker-testnet/browser";
export function AccountStatus({ ethAddress, balances }) {
    const [aptosAddress, setAptosAddress] = useState(null);
    // Derive Aptos address from ETH address (pure calculation, no network required)
    useEffect(() => {
        const derive = async () => {
            if (!ethAddress) {
                setAptosAddress(null);
                return;
            }
            const derived = await getDerivedAddress(ethAddress.toLowerCase());
            setAptosAddress(derived.toString());
        };
        derive();
    }, [ethAddress]);
    // Format balances with correct decimal places
    const fmtEth = (val) => (val / 100_000_000).toFixed(4); // 8 decimals for ETH
    const fmtUsd = (val) => (val / 1_000_000).toFixed(2); // 6 decimals for USD
    const fmtApt = (val) => (val / 100_000_000).toFixed(4); // 8 decimals for APT
    return (_jsxs("div", { className: "flex flex-col gap-2 text-sm font-mono bg-zinc-900 px-4 py-3 rounded border border-zinc-800", children: [_jsxs("div", { className: "flex flex-col gap-1", children: [_jsxs("div", { className: "flex items-center", children: [_jsx("span", { className: "text-zinc-500 mr-2 min-w-[100px]", children: "ETH Address:" }), ethAddress ? (_jsxs("span", { className: "text-zinc-300 text-xs", title: ethAddress, children: [ethAddress.substring(0, 8), "...", ethAddress.substring(38)] })) : (_jsx("span", { className: "text-zinc-600", children: "Not Connected" }))] }), aptosAddress && (_jsxs(_Fragment, { children: [_jsxs("div", { className: "flex items-center", children: [_jsx("span", { className: "text-zinc-500 mr-2 min-w-[100px]", children: "Aptos Address:" }), _jsxs("span", { className: "text-zinc-400 text-xs", title: aptosAddress, children: [aptosAddress.substring(0, 8), "...", aptosAddress.substring(58)] })] }), _jsx("div", { className: "text-xs text-zinc-600 ml-[100px]", children: "Derived from ETH address (holds APT & tokens)" }), !balances.exists && !balances.loading && ethAddress && (_jsx("div", { className: "text-xs text-zinc-500 ml-[100px] mt-1 border-l-2 border-zinc-700 pl-2", children: "Account not found on chain (please use Faucet)" }))] }))] }), ethAddress && balances.exists && (_jsxs(_Fragment, { children: [_jsx("div", { className: "h-px bg-zinc-800" }), _jsxs("div", { className: "flex items-center gap-4", children: [_jsxs("div", { title: "Gas (APT)", children: [_jsx("span", { className: "text-zinc-500 mr-1", children: "APT:" }), _jsx("span", { className: "text-zinc-200", children: fmtApt(balances.apt) })] }), !balances.contractsDeployed ? (_jsx("div", { className: "text-zinc-500 text-xs animate-pulse", children: "Contracts Loading..." })) : (_jsxs(_Fragment, { children: [_jsxs("div", { title: "Fake ETH (8 decimals)", children: [_jsx("span", { className: "text-zinc-500 mr-1", children: "ETH:" }), _jsx("span", { className: balances.fakeEthInitialized
                                                    ? "text-zinc-200"
                                                    : "text-zinc-600", children: balances.fakeEthInitialized
                                                    ? fmtEth(balances.fakeEth)
                                                    : "Not Init" })] }), _jsxs("div", { title: "Fake USD (6 decimals)", children: [_jsx("span", { className: "text-zinc-500 mr-1", children: "USD:" }), _jsx("span", { className: balances.fakeUsdInitialized
                                                    ? "text-zinc-200"
                                                    : "text-zinc-600", children: balances.fakeUsdInitialized
                                                    ? fmtUsd(balances.fakeUsd)
                                                    : "Not Init" })] })] }))] })] }))] }));
}
//# sourceMappingURL=AccountStatus.js.map