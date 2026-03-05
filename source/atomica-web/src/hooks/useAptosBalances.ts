import { useCallback, useEffect, useState } from "react";
import { aptos, getDerivedAddress, areContractsDeployed } from "../lib/aptos";
import { useNetworkConfig } from "../lib/network-config-state";

export interface AptosBalanceSnapshot {
  /** APT balance in octas (1 APT = 1e8 octas). Only meaningful when aptAccountExists is true. */
  apt: number;
  /**
   * Whether the derived Atomica account exists on-chain.
   * Determined by whether getAccountAPTAmount succeeds or throws — the SDK throws
   * for addresses that have never been initialized on-chain, even at zero balance.
   * This lets the UI distinguish "account not yet on chain" from a genuine 0 APT balance.
   */
  aptAccountExists: boolean;
  /**
   * Whether the Atomica (Aptos) contracts are deployed on the current testnet.
   * Used downstream to gate contract-interaction UI.
   */
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
    // No wallet connected — nothing to derive or query.
    if (!ethAddress) {
      return { ...EMPTY_STATE, loading: false };
    }

    try {
      // The Atomica address is deterministically derived from the Ethereum address,
      // so users get a single keypair that works across both chains.
      const derived = await getDerivedAddress(ethAddress.toLowerCase());
      const contractsDeployed = await areContractsDeployed();

      let aptValue: number;
      let aptAccountExists: boolean;
      try {
        // getAccountInfo throws for addresses that have never been initialised
        // on-chain. We use this (not getAccountAPTAmount) for the existence check
        // because getAccountAPTAmount silently returns 0 for missing accounts,
        // making it impossible to distinguish "not on chain" from "zero balance".
        await aptos.getAccountInfo({ accountAddress: derived });
        aptAccountExists = true;
        // Account exists — now fetch the actual APT balance.
        aptValue = await aptos.getAccountAPTAmount({ accountAddress: derived });
      } catch {
        // Account has never been funded / initialised — not an error, just not there yet.
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
      // Outer catch handles network/derivation failures — treat as transient.
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

      // Back off to a longer interval when the fetch clearly failed
      // (still in loading state with no data), so we don't hammer the node.
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
