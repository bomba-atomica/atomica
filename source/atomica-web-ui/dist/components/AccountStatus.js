import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { getDerivedAddress } from "@atomica/aptos-docker-testnet/browser";
import { formatETHBalance, formatFakeETHBalance, formatUSDBalance, } from "../lib/ethereum/balances";
import { useWallet } from "../context/WalletContext";
import { useBalances } from "../context/BalancesContext";
/**
 * Renders a single network's account card: header, address row, and balance row.
 * The balance row is only rendered when `children` is non-null; callers control
 * exactly what gets shown (balances, "not on chain" message, etc.).
 */
function NetworkCard({ label, address, addressTitle, addressTruncate, notConnectedLabel, children, }) {
    return (_jsxs("div", { className: "flex flex-col gap-3 bg-zinc-800/50 border border-zinc-700/60 rounded-lg px-4 py-3", children: [_jsx("div", { className: "flex items-center gap-2", children: _jsx("span", { className: "text-xs font-semibold uppercase tracking-wider text-zinc-400", children: label }) }), _jsx("div", { className: "h-px bg-zinc-700/50" }), _jsxs("div", { className: "flex items-center gap-2 text-sm font-mono", children: [_jsx("span", { className: "text-zinc-500 min-w-[64px]", children: "Address" }), address ? (_jsx("span", { className: "text-zinc-300 text-xs truncate", title: addressTitle ?? address, children: addressTruncate(address) })) : (_jsx("span", { className: "text-zinc-600 text-xs", children: notConnectedLabel }))] }), children && (_jsxs(_Fragment, { children: [_jsx("div", { className: "h-px bg-zinc-700/50" }), _jsx("div", { className: "flex items-center gap-4 text-sm font-mono flex-wrap", children: children })] }))] }));
}
/** Single labelled balance value, e.g. "ETH 0.5000". */
function BalanceItem({ label, value, title, muted, }) {
    return (_jsxs("div", { className: "flex items-baseline gap-1", title: title, children: [_jsx("span", { className: "text-zinc-500 text-xs", children: label }), _jsx("span", { className: muted ? "text-zinc-500" : "text-zinc-200", children: value })] }));
}
export function AccountStatus() {
    const { account: ethAddress } = useWallet();
    const { ethBalances, aptosBalances } = useBalances();
    const [aptosAddress, setAptosAddress] = useState(null);
    // Derive the Atomica address from the connected Ethereum address.
    // This is recomputed whenever the wallet changes.
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
    // APT is stored in octas (1 APT = 1e8 octas); display with 4 decimal places.
    const fmtApt = (val) => (val / 100_000_000).toFixed(4);
    return (_jsxs("div", { className: "flex flex-col gap-3", children: [_jsx(NetworkCard, { label: "Ethereum", address: ethAddress, addressTruncate: (a) => `${a.substring(0, 10)}...${a.substring(38)}`, notConnectedLabel: "Not connected", children: ethAddress &&
                    // Balance display flow for Ethereum:
                    //   loading         → render nothing (card still shows address)
                    //   !ethAccountExists → account hasn't been funded/used yet on this chain
                    //   ethAccountExists, no contracts → ETH balance only (token contracts not deployed)
                    //   ethAccountExists, contracts up  → ETH + FETH + FUSD
                    (ethBalances.loading ? null : !ethBalances.ethAccountExists ? (_jsx("span", { className: "text-xs text-zinc-500", children: "Account not yet on chain" })) : (_jsxs(_Fragment, { children: [_jsx(BalanceItem, { label: "ETH", value: formatETHBalance(ethBalances.ethBalance), title: "Native ETH" }), ethBalances.ethContractsDeployed ? (_jsxs(_Fragment, { children: [_jsx(BalanceItem, { label: "FETH", value: formatFakeETHBalance(ethBalances.ethFakeETH), title: "FakeETH ERC20 (18 decimals)" }), _jsx(BalanceItem, { label: "FUSD", value: formatUSDBalance(ethBalances.ethFakeUSD), title: "FakeUSD ERC20 (6 decimals)" })] })) : (_jsx("span", { className: "text-xs text-zinc-500", children: "Contracts not deployed" }))] }))) }), _jsx(NetworkCard, { label: "Atomica", address: aptosAddress, addressTruncate: (a) => `${a.substring(0, 10)}...${a.substring(58)}`, 
                // While the address is being derived (ethAddress known but aptosAddress not yet set)
                // show a transient label rather than "Not connected".
                notConnectedLabel: ethAddress ? "Deriving…" : "Not connected", children: ethAddress &&
                    // Balance display flow for Atomica:
                    //   loading                       → render nothing
                    //   !aptAccountExists || apt === 0 → not funded yet (show hint)
                    //   apt > 0                        → show APT balance
                    (aptosBalances.loading ? null : aptosBalances.aptAccountExists &&
                        aptosBalances.apt > 0 ? (_jsx(BalanceItem, { label: "APT", value: fmtApt(aptosBalances.apt), title: "Gas (APT)" })) : (_jsx("span", { className: "text-xs text-zinc-500", children: "Account not yet on chain" }))) })] }));
}
//# sourceMappingURL=AccountStatus.js.map