import { useMemo } from "react";
import { useAptosBalances } from "./useAptosBalances";
import { useEthereumBalances } from "./useEthereumBalances";

export interface DualChainBalances {
  ethBalance: bigint;
  ethFakeETH: bigint;
  ethFakeUSD: bigint;
  ethContractsDeployed: boolean;
  apt: number;
  aptosFakeEth: number;
  aptosFakeUsd: number;
  aptosExists: boolean;
  aptosFakeEthInitialized: boolean;
  aptosFakeUsdInitialized: boolean;
  aptosContractsDeployed: boolean;
  loading: boolean;
  refetch: () => Promise<void>;
}

export function useDualChainBalances(
  ethAddress: string | null,
): DualChainBalances {
  const eth = useEthereumBalances(ethAddress);
  const aptos = useAptosBalances(ethAddress);

  const combined = useMemo(
    () => ({
      ethBalance: eth.ethBalance,
      ethFakeETH: eth.ethFakeETH,
      ethFakeUSD: eth.ethFakeUSD,
      ethContractsDeployed: eth.ethContractsDeployed,
      apt: aptos.apt,
      aptosFakeEth: aptos.aptosFakeEth,
      aptosFakeUsd: aptos.aptosFakeUsd,
      aptosExists: aptos.aptosExists,
      aptosFakeEthInitialized: aptos.aptosFakeEthInitialized,
      aptosFakeUsdInitialized: aptos.aptosFakeUsdInitialized,
      aptosContractsDeployed: aptos.aptosContractsDeployed,
      loading: eth.loading || aptos.loading,
      async refetch() {
        await Promise.all([eth.refetch(), aptos.refetch()]);
      },
    }),
    [eth, aptos],
  );

  return combined;
}
