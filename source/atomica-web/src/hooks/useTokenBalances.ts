import { useState, useEffect, useCallback } from "react";
import { aptos, CONTRACT_ADDR, getDerivedAddress } from "../lib/aptos";

import { areContractsDeployed } from "../lib/aptos";

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
  const [balances, setBalances] = useState<Omit<TokenBalances, 'refetch'>>({
    apt: 0,
    fakeEth: 0,
    fakeUsd: 0,
    loading: true,
    exists: false,
    fakeEthInitialized: false,
    fakeUsdInitialized: false,
    contractsDeployed: false,
  });

  const checkBalances = useCallback(async () => {
    if (!ethAddress) {
      setBalances(prev => ({ ...prev, apt: 0, fakeEth: 0, fakeUsd: 0, loading: false, exists: false }));
      return;
    }

    try {
      const derived = await getDerivedAddress(ethAddress.toLowerCase());

      // Check if account exists on-chain first
      try {
        await aptos.getAccountInfo({ accountAddress: derived });
      } catch (e) {
        // Account invalid/not found - stop here
        setBalances(prev => ({ ...prev, apt: 0, fakeEth: 0, fakeUsd: 0, loading: false, exists: false }));
        return;
      }

      // Account exists, fetch APT balance
      const aptBalance = await aptos.getAccountAPTAmount({
        accountAddress: derived,
      });

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
        return;
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
    } catch (e: any) {
      // Fallback for unexpected errors
      setBalances(prev => ({ ...prev, loading: false, exists: false }));
    }
  }, [ethAddress]);

  useEffect(() => {
    checkBalances();
    // Poll every 5 seconds
    const interval = setInterval(checkBalances, 5000);
    return () => clearInterval(interval);
  }, [checkBalances]);

  return { ...balances, refetch: checkBalances };
}
