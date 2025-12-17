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

      // Contracts deployed, check for token initialization
      // Fetch ALL resources once to avoid 404s on individual missing resources
      let resources: any[] = [];
      try {
        resources = await aptos.getAccountResources({ accountAddress: derived });
      } catch (e) {
        // Should not happen if getAccountInfo passed, but just in case
        resources = [];
      }

      const fakeEthType = `${CONTRACT_ADDR}::FAKEETH::FAKEETH`;
      const fakeUsdType = `${CONTRACT_ADDR}::FAKEUSD::FAKEUSD`;

      // Use SDK methods to get balances - handles both Coin and FungibleAsset
      let fakeEthBalance = 0;
      let fakeEthInitialized = false;
      let fakeUsdBalance = 0;
      let fakeUsdInitialized = false;

      try {
        fakeEthBalance = await aptos.getAccountCoinAmount({
          accountAddress: derived,
          coinType: fakeEthType,
        });
        fakeEthInitialized = true;
      } catch (e) {
        // Coin not initialized for this account
        fakeEthBalance = 0;
        fakeEthInitialized = false;
      }

      try {
        fakeUsdBalance = await aptos.getAccountCoinAmount({
          accountAddress: derived,
          coinType: fakeUsdType,
        });
        fakeUsdInitialized = true;
      } catch (e) {
        // Coin not initialized for this account
        fakeUsdBalance = 0;
        fakeUsdInitialized = false;
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
