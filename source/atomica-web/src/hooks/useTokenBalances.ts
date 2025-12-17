import { useState, useEffect } from "react";
import { aptos, CONTRACT_ADDR, getDerivedAddress } from "../lib/aptos";

interface TokenBalances {
  apt: number;
  fakeEth: number;
  fakeUsd: number;
  loading: boolean;
  exists: boolean;
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
  });

  useEffect(() => {
    if (!ethAddress) {
      setBalances({ apt: 0, fakeEth: 0, fakeUsd: 0, loading: false, exists: false });
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
          setBalances({ apt: 0, fakeEth: 0, fakeUsd: 0, loading: false, exists: false });
          return;
        }

        // Account exists, fetch balances
        const aptBalance = await aptos.getAccountAPTAmount({
          accountAddress: derived,
        });

        // Get FAKEETH balance
        let fakeEthBalance = 0;
        try {
          const fakeEthResource = await aptos.getAccountResource({
            accountAddress: derived,
            resourceType: `0x1::coin::CoinStore<${CONTRACT_ADDR}::FAKEETH::FAKEETH>`,
          });
          fakeEthBalance = Number((fakeEthResource as { coin: { value: string } }).coin.value);
        } catch {
          // Resource doesn't exist, balance is 0
        }

        // Get FAKEUSD balance
        let fakeUsdBalance = 0;
        try {
          const fakeUsdResource = await aptos.getAccountResource({
            accountAddress: derived,
            resourceType: `0x1::coin::CoinStore<${CONTRACT_ADDR}::FAKEUSD::FAKEUSD>`,
          });
          fakeUsdBalance = Number((fakeUsdResource as { coin: { value: string } }).coin.value);
        } catch {
          // Resource doesn't exist, balance is 0
        }

        setBalances({
          apt: aptBalance,
          fakeEth: fakeEthBalance,
          fakeUsd: fakeUsdBalance,
          loading: false,
          exists: true,
        });
      } catch (e: any) {
        // If account doesn't exist or other error, mostly harmless to just show 0
        // Don't log to console to avoid spamming "Account not found"
        setBalances({ apt: 0, fakeEth: 0, fakeUsd: 0, loading: false, exists: false });
      }
    };

    checkBalances();
    // Poll every 5 seconds
    const interval = setInterval(checkBalances, 5000);
    return () => clearInterval(interval);
  }, [ethAddress]);

  return balances;
}
