import { createContext, useContext, useCallback } from "react";
import { useWallet } from "./WalletContext";
import { useEthereumBalances } from "../hooks/useEthereumBalances";
import { useAptosBalances } from "../hooks/useAptosBalances";
import type { EthereumBalancesSnapshot } from "../hooks/useEthereumBalances";
import type { AptosBalancesSnapshot } from "../hooks/useAptosBalances";

interface BalancesContextValue {
  ethBalances: EthereumBalancesSnapshot;
  aptosBalances: AptosBalancesSnapshot;
  refresh: () => Promise<void>;
}

const defaultEthBalances: EthereumBalancesSnapshot = {
  ethAccountExists: false,
  ethBalance: 0n,
  ethFakeETH: 0n,
  ethFakeUSD: 0n,
  ethContractsDeployed: false,
  loading: true,
  refetch: async () => {},
};

const defaultAptosBalances: AptosBalancesSnapshot = {
  apt: 0,
  aptAccountExists: false,
  aptosContractsDeployed: false,
  loading: true,
  refetch: async () => {},
};

const BalancesContext = createContext<BalancesContextValue>({
  ethBalances: defaultEthBalances,
  aptosBalances: defaultAptosBalances,
  refresh: async () => {},
});

export function BalancesProvider({ children }: { children: React.ReactNode }) {
  const { account } = useWallet();
  const ethBalances = useEthereumBalances(account);
  const aptosBalances = useAptosBalances(account);
  const { refetch: refetchEth } = ethBalances;
  const { refetch: refetchAptos } = aptosBalances;

  const refresh = useCallback(async () => {
    await Promise.all([refetchEth(), refetchAptos()]);
  }, [refetchEth, refetchAptos]);

  return (
    <BalancesContext.Provider value={{ ethBalances, aptosBalances, refresh }}>
      {children}
    </BalancesContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export const useBalances = () => useContext(BalancesContext);
