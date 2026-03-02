import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { aptos, CONTRACT_ADDR, getDerivedAddress, areContractsDeployed } from "../lib/aptos";
import { getAllBalances } from "../lib/ethereum/balances";

export interface DualChainBalances {
  // Ethereum balances (in wei / smallest units)
  ethBalance: bigint;
  ethFakeETH: bigint;
  ethFakeUSD: bigint;

  // Aptos balances (in base units: 8-decimal APT, 8-decimal FAKEETH, 6-decimal FAKEUSD)
  apt: number;
  aptosFakeEth: number;
  aptosFakeUsd: number;
  aptosExists: boolean;
  aptosFakeEthInitialized: boolean;
  aptosFakeUsdInitialized: boolean;
  aptosContractsDeployed: boolean;

  loading: boolean;
  refetch: () => Promise<void>;
}

/**
 * Hook combining Ethereum and Aptos chain balances.
 *
 * Ethereum balances: ETH (native), FakeETH (ERC20), FakeUSD (ERC20).
 * These are the primary asset balances — tokens are issued on Ethereum and
 * bridged to Aptos via LockBox + state proofs.
 *
 * Aptos balances: APT (gas), plus bridged FakeETH/FakeUSD on the Aptos side.
 * The Aptos-side fake token balances only increase after bridging.
 */
export function useDualChainBalances(
  ethAddress: string | null,
): DualChainBalances {
  const [balances, setBalances] = useState<Omit<DualChainBalances, "refetch">>(
    {
      ethBalance: 0n,
      ethFakeETH: 0n,
      ethFakeUSD: 0n,
      apt: 0,
      aptosFakeEth: 0,
      aptosFakeUsd: 0,
      aptosExists: false,
      aptosFakeEthInitialized: false,
      aptosFakeUsdInitialized: false,
      aptosContractsDeployed: false,
      loading: true,
    },
  );

  const checkBalances = useCallback(async () => {
    if (!ethAddress) {
      setBalances((prev) => ({
        ...prev,
        ethBalance: 0n,
        ethFakeETH: 0n,
        ethFakeUSD: 0n,
        apt: 0,
        aptosFakeEth: 0,
        aptosFakeUsd: 0,
        aptosExists: false,
        loading: false,
      }));
      return;
    }

    // Fetch Ethereum and Aptos balances concurrently
    const [ethResult, aptosResult] = await Promise.allSettled([
      fetchEthereumBalances(ethAddress),
      fetchAptosBalances(ethAddress),
    ]);

    const eth =
      ethResult.status === "fulfilled"
        ? ethResult.value
        : { ethBalance: 0n, ethFakeETH: 0n, ethFakeUSD: 0n };

    const aptosData =
      aptosResult.status === "fulfilled"
        ? aptosResult.value
        : {
            apt: 0,
            aptosFakeEth: 0,
            aptosFakeUsd: 0,
            aptosExists: false,
            aptosFakeEthInitialized: false,
            aptosFakeUsdInitialized: false,
            aptosContractsDeployed: false,
          };

    setBalances({ ...eth, ...aptosData, loading: false });
  }, [ethAddress]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!cancelled) await checkBalances();
    };
    void run();
    const interval = setInterval(() => void run(), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [checkBalances]);

  return { ...balances, refetch: checkBalances };
}

async function fetchEthereumBalances(address: string) {
  try {
    const { eth, fakeETH, fakeUSD } = await getAllBalances(address);
    return { ethBalance: eth, ethFakeETH: fakeETH, ethFakeUSD: fakeUSD };
  } catch {
    return { ethBalance: 0n, ethFakeETH: 0n, ethFakeUSD: 0n };
  }
}

async function fetchAptosBalances(ethAddress: string) {
  const zero = {
    apt: 0,
    aptosFakeEth: 0,
    aptosFakeUsd: 0,
    aptosExists: false,
    aptosFakeEthInitialized: false,
    aptosFakeUsdInitialized: false,
    aptosContractsDeployed: false,
  };

  try {
    const derived = await getDerivedAddress(ethAddress.toLowerCase());

    let aptBalance: number;
    try {
      aptBalance = await aptos.getAccountAPTAmount({
        accountAddress: derived,
      });
    } catch {
      return zero;
    }

    if (aptBalance === 0) return zero;

    const contractsDeployed = await areContractsDeployed();
    if (!contractsDeployed) {
      return { ...zero, apt: aptBalance, aptosExists: true };
    }

    let aptosFakeEth = 0;
    let aptosFakeUsd = 0;
    let aptosFakeEthInitialized = false;
    let aptosFakeUsdInitialized = false;

    try {
      const fakeEthResult = await aptos.view({
        payload: {
          function: `${CONTRACT_ADDR}::fake_eth::balance`,
          functionArguments: [derived.toString()],
        },
      });
      aptosFakeEth = Number(fakeEthResult[0]);
      aptosFakeEthInitialized = true;

      const fakeUsdResult = await aptos.view({
        payload: {
          function: `${CONTRACT_ADDR}::fake_usd::balance`,
          functionArguments: [derived.toString()],
        },
      });
      aptosFakeUsd = Number(fakeUsdResult[0]);
      aptosFakeUsdInitialized = true;
    } catch (e) {
      console.warn("Error fetching Aptos token balances:", e);
    }

    return {
      apt: aptBalance,
      aptosFakeEth,
      aptosFakeUsd,
      aptosExists: true,
      aptosFakeEthInitialized,
      aptosFakeUsdInitialized,
      aptosContractsDeployed: true,
    };
  } catch {
    return zero;
  }
}

/**
 * Format Ethereum FakeETH balance (18 decimals) for display.
 */
export function formatEthFakeETH(balance: bigint): string {
  return parseFloat(ethers.formatEther(balance)).toFixed(4);
}

/**
 * Format Ethereum FakeUSD balance (6 decimals) for display.
 */
export function formatEthFakeUSD(balance: bigint): string {
  return parseFloat(ethers.formatUnits(balance, 6)).toFixed(2);
}

/**
 * Format native ETH balance (18 decimals) for display.
 */
export function formatETH(balance: bigint): string {
  return parseFloat(ethers.formatEther(balance)).toFixed(4);
}
