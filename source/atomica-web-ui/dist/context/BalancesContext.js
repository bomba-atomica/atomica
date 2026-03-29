import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useCallback } from "react";
import { useWallet } from "./WalletContext";
import { useEthereumBalances } from "../hooks/useEthereumBalances";
import { useAptosBalances } from "../hooks/useAptosBalances";
const defaultEthBalances = {
    ethAccountExists: false,
    ethBalance: 0n,
    ethFakeETH: 0n,
    ethFakeUSD: 0n,
    ethContractsDeployed: false,
    loading: true,
    refetch: async () => { },
};
const defaultAptosBalances = {
    apt: 0,
    aptAccountExists: false,
    aptosContractsDeployed: false,
    loading: true,
    refetch: async () => { },
};
const BalancesContext = createContext({
    ethBalances: defaultEthBalances,
    aptosBalances: defaultAptosBalances,
    refresh: async () => { },
});
export function BalancesProvider({ children }) {
    const { account } = useWallet();
    const ethBalances = useEthereumBalances(account);
    const aptosBalances = useAptosBalances(account);
    const { refetch: refetchEth } = ethBalances;
    const { refetch: refetchAptos } = aptosBalances;
    const refresh = useCallback(async () => {
        await Promise.all([refetchEth(), refetchAptos()]);
    }, [refetchEth, refetchAptos]);
    return (_jsx(BalancesContext.Provider, { value: { ethBalances, aptosBalances, refresh }, children: children }));
}
export const useBalances = () => useContext(BalancesContext);
//# sourceMappingURL=BalancesContext.js.map