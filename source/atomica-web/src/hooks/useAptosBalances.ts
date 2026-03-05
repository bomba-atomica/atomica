import { useCallback, useEffect, useState } from "react";
import { aptos, getDerivedAddress, areContractsDeployed } from "../lib/aptos";
import { useNetworkConfig } from "../lib/network-config-state";

export interface AptosBalanceSnapshot {
  apt: number;
  aptAccountExists: boolean;
  aptosContractsDeployed: boolean;
  loading: boolean;
}

const EMPTY_STATE: Omit<AptosBalanceSnapshot, "loading"> = {
  apt: 0,
  aptAccountExists: false,
  aptosContractsDeployed: false,
};

export type AptosBalancesSnapshot = AptosBalanceSnapshot & {
  refetch: () => Promise<void>;
};

export function useAptosBalances(
  ethAddress: string | null,
): AptosBalancesSnapshot {
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
      const contractsDeployed = await areContractsDeployed();

      let aptValue: number;
      let aptAccountExists: boolean;
      try {
        aptValue = await aptos.getAccountAPTAmount({
          accountAddress: derived,
        });
        aptAccountExists = true; // account found on-chain (even if balance is 0)
      } catch {
        // Account does not exist on chain yet
        aptValue = 0;
        aptAccountExists = false;
      }

      return {
        apt: aptValue,
        aptAccountExists,
        aptosContractsDeployed: contractsDeployed,
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
        snapshot.aptAccountExists === false;
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
