import { useCallback, useEffect, useState } from "react";
import {
  aptos,
  CONTRACT_ADDR,
  getDerivedAddress,
  areContractsDeployed,
} from "../lib/aptos";
import { useNetworkConfig } from "../lib/network-config-state";

export interface AptosBalanceSnapshot {
  apt: number;
  aptosFakeEth: number;
  aptosFakeUsd: number;
  aptosExists: boolean;
  aptosFakeEthInitialized: boolean;
  aptosFakeUsdInitialized: boolean;
  aptosContractsDeployed: boolean;
  loading: boolean;
}

const EMPTY_STATE: Omit<AptosBalanceSnapshot, "loading"> = {
  apt: 0,
  aptosFakeEth: 0,
  aptosFakeUsd: 0,
  aptosExists: false,
  aptosFakeEthInitialized: false,
  aptosFakeUsdInitialized: false,
  aptosContractsDeployed: false,
};

export function useAptosBalances(
  ethAddress: string | null,
): AptosBalanceSnapshot & { refetch: () => Promise<void> } {
  const { host } = useNetworkConfig();
  const [state, setState] = useState<AptosBalanceSnapshot>({
    ...EMPTY_STATE,
    loading: true,
  });

  const fetchSnapshot = useCallback(async (): Promise<AptosBalanceSnapshot> => {
    if (!ethAddress) {
      return { ...EMPTY_STATE, loading: false };
    }

    try {
      const derived = await getDerivedAddress(ethAddress.toLowerCase());
      const aptValue = await aptos.getAccountAPTAmount({
        accountAddress: derived,
      });

      if (aptValue === 0) {
        return { ...EMPTY_STATE, loading: false };
      }

      const contractsDeployed = await areContractsDeployed();
      if (!contractsDeployed) {
        return {
          ...EMPTY_STATE,
          apt: aptValue,
          aptosExists: true,
          loading: false,
        };
      }

      let fakeEth = 0;
      let fakeUsd = 0;
      let fakeEthInitialized = false;
      let fakeUsdInitialized = false;

      try {
        const fakeEthRes = await aptos.view({
          payload: {
            function: `${CONTRACT_ADDR}::fake_eth::balance`,
            functionArguments: [derived.toString()],
          },
        });
        fakeEth = Number(fakeEthRes[0]);
        fakeEthInitialized = true;

        const fakeUsdRes = await aptos.view({
          payload: {
            function: `${CONTRACT_ADDR}::fake_usd::balance`,
            functionArguments: [derived.toString()],
          },
        });
        fakeUsd = Number(fakeUsdRes[0]);
        fakeUsdInitialized = true;
      } catch (error) {
        console.warn("Error fetching Aptos token balances:", error);
      }

      return {
        apt: aptValue,
        aptosFakeEth: fakeEth,
        aptosFakeUsd: fakeUsd,
        aptosExists: true,
        aptosFakeEthInitialized: fakeEthInitialized,
        aptosFakeUsdInitialized: fakeUsdInitialized,
        aptosContractsDeployed: true,
        loading: false,
      };
    } catch (error) {
      console.warn("Failed to fetch Aptos balances:", error);
      return { ...EMPTY_STATE, loading: false };
    }
  }, [ethAddress]);

  const refetch = useCallback(async () => {
    const snapshot = await fetchSnapshot();
    setState(snapshot);
  }, [fetchSnapshot]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const baseDelay = 5_000;
    const maxDelay = 60_000;

    const tick = async () => {
      if (cancelled) return;
      const snapshot = await fetchSnapshot();
      if (cancelled) return;
      setState(snapshot);

      const failed =
        snapshot.loading &&
        snapshot.apt === 0 &&
        snapshot.aptosExists === false;
      const delay = failed ? maxDelay : baseDelay;
      timer = setTimeout(() => void tick(), delay);
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchSnapshot, host]);

  return {
    ...state,
    refetch,
  };
}
