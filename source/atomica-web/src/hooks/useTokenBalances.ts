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

      // Contracts deployed, check for fungible asset balances
      // Fetch ALL resources to inspect primary fungible stores
      let resources: any[] = [];
      try {
        resources = await aptos.getAccountResources({ accountAddress: derived });
      } catch (e) {
        resources = [];
      }

      let fakeEthBalance = 0;
      let fakeEthInitialized = false;
      let fakeUsdBalance = 0;
      let fakeUsdInitialized = false;

      // Get metadata addresses by calling the view functions
      try {
        // Call fake_eth::get_metadata() to get FAKEETH metadata address
        const fakeEthMetadataResult = await aptos.view({
          payload: {
            function: `${CONTRACT_ADDR}::fake_eth::get_metadata`,
            functionArguments: [],
          },
        });

        // Call fake_usd::get_metadata() to get FAKEUSD metadata address
        const fakeUsdMetadataResult = await aptos.view({
          payload: {
            function: `${CONTRACT_ADDR}::fake_usd::get_metadata`,
            functionArguments: [],
          },
        });

        // Extract metadata addresses from results
        const fakeEthMetadataAddr = fakeEthMetadataResult[0] as string;
        const fakeUsdMetadataAddr = fakeUsdMetadataResult[0] as string;

        // Now match primary stores to these metadata addresses
        for (const resource of resources) {
          if (resource.type.startsWith("0x1::primary_fungible_store::PrimaryStore")) {
            try {
              // The full type includes the metadata address as type parameter
              // e.g., "0x1::primary_fungible_store::PrimaryStore<0xMETADATA_ADDR>"

              // Extract metadata address from the type parameter
              const typeMatch = resource.type.match(/PrimaryStore<(.+)>/);
              if (typeMatch && typeMatch[1]) {
                const metadataAddrInType = typeMatch[1].trim();

                // Access the balance from fungible_store
                const store = resource.data?.fungible_store;
                if (store?.balance !== undefined) {
                  const balance = parseInt(store.balance);

                  // Match against our known metadata addresses
                  if (metadataAddrInType === fakeEthMetadataAddr) {
                    fakeEthBalance = balance;
                    fakeEthInitialized = true;
                  } else if (metadataAddrInType === fakeUsdMetadataAddr) {
                    fakeUsdBalance = balance;
                    fakeUsdInitialized = true;
                  }
                }
              }
            } catch (e) {
              console.warn("Error parsing fungible asset store:", e);
            }
          }
        }
      } catch (e) {
        console.warn("Error fetching fungible asset metadata:", e);
        // Fallback: balances remain 0
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
