import { useCallback, useEffect, useState } from "react";
import { getAllBalances } from "../lib/ethereum/balances";
import { areContractsDeployed } from "../lib/ethereum/contracts";
import { getEthereumProvider } from "../lib/ethereum/config";

export interface EthereumBalances {
  ethAccountExists: boolean; // nonce > 0 OR balance > 0
  ethBalance: bigint;
  ethFakeETH: bigint;
  ethFakeUSD: bigint;
  ethContractsDeployed: boolean;
  loading: boolean;
}

export type EthereumBalancesSnapshot = EthereumBalances & {
  refetch: () => Promise<void>;
};

export function useEthereumBalances(
  ethAddress: string | null,
): EthereumBalancesSnapshot {
  const [state, setState] = useState<EthereumBalances>({
    ethAccountExists: false,
    ethBalance: 0n,
    ethFakeETH: 0n,
    ethFakeUSD: 0n,
    ethContractsDeployed: false,
    loading: true,
  });

  const load = useCallback(async () => {
    if (!ethAddress) {
      setState({
        ethAccountExists: false,
        ethBalance: 0n,
        ethFakeETH: 0n,
        ethFakeUSD: 0n,
        ethContractsDeployed: false,
        loading: false,
      });
      return true;
    }

    try {
      const provider = getEthereumProvider();
      const [nonce, ethBalance] = await Promise.all([
        provider.getTransactionCount(ethAddress),
        provider.getBalance(ethAddress),
      ]);
      const ethAccountExists = nonce > 0 || ethBalance > 0n;

      const contractsDeployed = await areContractsDeployed();

      if (!contractsDeployed) {
        setState({
          ethAccountExists,
          ethBalance,
          ethFakeETH: 0n,
          ethFakeUSD: 0n,
          ethContractsDeployed: false,
          loading: false,
        });
        return true;
      }

      const balances = await getAllBalances(ethAddress);
      setState({
        ethAccountExists,
        ethBalance: balances.eth,
        ethFakeETH: balances.fakeETH,
        ethFakeUSD: balances.fakeUSD,
        ethContractsDeployed: true,
        loading: false,
      });
      return true;
    } catch (error) {
      console.warn("Failed to refresh Ethereum balances:", error);
      setState((prev) => ({ ...prev, loading: false }));
      return false;
    }
  }, [ethAddress]);

  useEffect(() => {
    const baseDelay = 5_000;
    const maxDelay = 60_000;
    let retries = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delay: number) => {
      timer = setTimeout(() => void execute(), delay);
    };

    const execute = async () => {
      if (cancelled) return;
      const success = await load();
      const nextDelay = success
        ? baseDelay
        : Math.min(baseDelay * 2 ** retries, maxDelay);
      retries = success ? 0 : retries + 1;
      if (!cancelled) {
        schedule(nextDelay);
      }
    };

    void execute();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  const refetch = useCallback(async () => {
    await load();
  }, [load]);

  return {
    ...state,
    refetch,
  };
}
