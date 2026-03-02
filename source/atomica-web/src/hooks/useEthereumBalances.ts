import { useCallback, useEffect, useState } from "react";
import { getAllBalances } from "../lib/ethereum/balances";
import { areContractsDeployed } from "../lib/ethereum/contracts";

export interface EthereumBalances {
  ethBalance: bigint;
  ethFakeETH: bigint;
  ethFakeUSD: bigint;
  ethContractsDeployed: boolean;
  loading: boolean;
}

export function useEthereumBalances(
  ethAddress: string | null,
): EthereumBalances & { refetch: () => Promise<void> } {
  const [state, setState] = useState<EthereumBalances>({
    ethBalance: 0n,
    ethFakeETH: 0n,
    ethFakeUSD: 0n,
    ethContractsDeployed: false,
    loading: true,
  });

  const load = useCallback(async () => {
    if (!ethAddress) {
      setState({
        ethBalance: 0n,
        ethFakeETH: 0n,
        ethFakeUSD: 0n,
        ethContractsDeployed: false,
        loading: false,
      });
      return;
    }

    try {
      const [balances, contractsDeployed] = await Promise.all([
        getAllBalances(ethAddress),
        areContractsDeployed(),
      ]);

      setState({
        ethBalance: balances.eth,
        ethFakeETH: balances.fakeETH,
        ethFakeUSD: balances.fakeUSD,
        ethContractsDeployed: contractsDeployed,
        loading: false,
      });
    } catch (error) {
      console.warn("Failed to refresh Ethereum balances:", error);
      setState((prev) => ({ ...prev, loading: false }));
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
      const prev = state.loading;
      await load();
      const failed = prev && state.loading;
      const nextDelay = failed
        ? Math.min(baseDelay * 2 ** retries, maxDelay)
        : baseDelay;
      retries = failed ? retries + 1 : 0;
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

  return {
    ...state,
    refetch: load,
  };
}
