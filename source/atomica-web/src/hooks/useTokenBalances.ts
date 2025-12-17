import { useState, useEffect } from "react";
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
}

/**
 * Hook to check user's token balances
 * Returns balances for APT, FAKEETH, and FAKEUSD
 */
export function useTokenBalances(ethAddress: string | null): TokenBalances {
  const [balances, setBalances] = useState<TokenBalances>({
    apt: 0,
    fakeEth: 0,
    fakeUsd: 0,
    loading: true,
    exists: false,
    fakeEthInitialized: false,
    fakeUsdInitialized: false,
    contractsDeployed: false,
  });

  useEffect(() => {
    if (!ethAddress) {
      setBalances(prev => ({ ...prev, apt: 0, fakeEth: 0, fakeUsd: 0, loading: false, exists: false }));
      return;
    }

    const checkBalances = async () => {
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
        const coinStoreEth = `0x1::coin::CoinStore<${fakeEthType}>`;
        const coinStoreUsd = `0x1::coin::CoinStore<${fakeUsdType}>`;

        const ethResource = resources.find(r => r.type === coinStoreEth);
        const usdResource = resources.find(r => r.type === coinStoreUsd);

        const fakeEthBalance = ethResource ? Number((ethResource.data as any).coin.value) : 0;
        const fakeUsdBalance = usdResource ? Number((usdResource.data as any).coin.value) : 0;

        setBalances({
          apt: aptBalance,
          fakeEth: fakeEthBalance,
          fakeUsd: fakeUsdBalance,
          loading: false,
          exists: true,
          fakeEthInitialized: !!ethResource,
          fakeUsdInitialized: !!usdResource,
          contractsDeployed: true,
        });
      } catch (e: any) {
        // Fallback for unexpected errors
        setBalances(prev => ({ ...prev, loading: false, exists: false }));
      }
    };

    checkBalances();
    // Poll every 5 seconds
    const interval = setInterval(checkBalances, 5000);
    return () => clearInterval(interval);
  }, [ethAddress]);

  return balances;
}
