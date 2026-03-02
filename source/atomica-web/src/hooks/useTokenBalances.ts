import { useState, useEffect, useCallback } from "react";
import { aptos, CONTRACT_ADDR, getDerivedAddress } from "../lib/aptos";

import { areContractsDeployed } from "../lib/aptos";
import { useNetworkConfig } from "../lib/network-config-state";

interface TokenBalances {
  apt: number;
  fakeEth: number;
  fakeUsd: number;
  loading: boolean;
  exists: boolean;
  fakeEthInitialized: boolean;
  fakeUsdInitialized: boolean;
  contractsDeployed: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook to check user's token balances
 * Returns balances for APT, FAKEETH, and FAKEUSD
 */
export function useTokenBalances(ethAddress: string | null): TokenBalances {
  const { host } = useNetworkConfig();
  const [balances, setBalances] = useState<Omit<TokenBalances, "refetch">>({
    apt: 0,
    fakeEth: 0,
    fakeUsd: 0,
    loading: true,
    exists: false,
    fakeEthInitialized: false,
    fakeUsdInitialized: false,
    contractsDeployed: false,
  });

  const checkBalances = useCallback(async (): Promise<boolean> => {
    if (!ethAddress) {
      setBalances((prev) => ({
        ...prev,
        apt: 0,
        fakeEth: 0,
        fakeUsd: 0,
        loading: false,
        exists: false,
      }));
      return false;
    }

    try {
      const derived = await getDerivedAddress(ethAddress.toLowerCase());

      // Try to fetch APT balance - this will throw if account doesn't exist
      let aptBalance;
      try {
        aptBalance = await aptos.getAccountAPTAmount({
          accountAddress: derived,
        });
      } catch {
        // Account not found or invalid
        setBalances((prev) => ({
          ...prev,
          apt: 0,
          fakeEth: 0,
          fakeUsd: 0,
          loading: false,
          exists: false,
        }));
        return false;
      }

      // If balance is 0, consider account as not funded/not existing
      if (aptBalance === 0) {
        setBalances((prev) => ({
          ...prev,
          apt: 0,
          fakeEth: 0,
          fakeUsd: 0,
          loading: false,
          exists: false,
        }));
        return false;
      }

      // Check contracts deployment status
      const contractsDeployed = await areContractsDeployed();

      if (!contractsDeployed) {
        setBalances({
          apt: aptBalance,
          fakeEth: 0,
          fakeUsd: 0,
          loading: false,
          exists: true,
          fakeEthInitialized: false,
          fakeUsdInitialized: false,
          contractsDeployed: false,
        });
        return false;
      }

      // Contracts deployed, fetch balances directly using view functions
      let fakeEthBalance = 0;
      let fakeEthInitialized = false;
      let fakeUsdBalance = 0;
      let fakeUsdInitialized = false;
      try {
        // Get FAKEETH balance
        const fakeEthResult = await aptos.view({
          payload: {
            function: `${CONTRACT_ADDR}::fake_eth::balance`,
            functionArguments: [derived.toString()],
          },
        });
        fakeEthBalance = Number(fakeEthResult[0]);
        fakeEthInitialized = true; // If call succeeds, it's initialized (or 0)

        // Get FAKEUSD balance
        const fakeUsdResult = await aptos.view({
          payload: {
            function: `${CONTRACT_ADDR}::fake_usd::balance`,
            functionArguments: [derived.toString()],
          },
        });
        fakeUsdBalance = Number(fakeUsdResult[0]);
        fakeUsdInitialized = true;
      } catch (e) {
        console.warn("Error fetching token balances via view functions:", e);
        // Fallback or leave as 0
      }

      setBalances({
        apt: aptBalance,
        fakeEth: fakeEthBalance,
        fakeUsd: fakeUsdBalance,
        loading: false,
        exists: true,
        fakeEthInitialized,
        fakeUsdInitialized,
        contractsDeployed: true,
      });
      return false;
    } catch {
      // Fallback for unexpected errors
      setBalances((prev) => ({ ...prev, loading: false, exists: false }));
      return true;
    }
  }, [ethAddress]);

  useEffect(() => {
    const baseDelayMs = 5000;
    const maxDelayMs = 60000;
    let cancelled = false;
    let retryCount = 0;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delayMs: number) => {
      timeout = setTimeout(() => void runCheck(), delayMs);
    };

    const runCheck = async () => {
      if (cancelled) return;
      const failed = await checkBalances();
      retryCount = failed ? retryCount + 1 : 0;
      const nextDelay = failed
        ? Math.min(baseDelayMs * 2 ** retryCount, maxDelayMs)
        : baseDelayMs;
      if (!cancelled) {
        schedule(nextDelay);
      }
    };

    void runCheck();
    return () => {
      cancelled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [checkBalances, host]);

  return {
    ...balances,
    refetch: async () => {
      await checkBalances();
    },
  };
}
