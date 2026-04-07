import { useCallback, useEffect, useState } from "react";
import { aptos, getDerivedAddress, areContractsDeployed } from "../lib/aptos";
import { useNetworkConfig } from "../lib/network-config-state";
const EMPTY_STATE = {
    apt: 0,
    aptAccountExists: false,
    aptosContractsDeployed: false,
};
export function useAptosBalances(ethAddress) {
    const { host } = useNetworkConfig();
    const [state, setState] = useState({
        ...EMPTY_STATE,
        loading: true,
    });
    const fetchSnapshot = useCallback(async () => {
        // No wallet connected — nothing to derive or query.
        if (!ethAddress) {
            return { ...EMPTY_STATE, loading: false };
        }
        try {
            // The Atomica address is deterministically derived from the Ethereum address,
            // so users get a single keypair that works across both chains.
            const derived = await getDerivedAddress(ethAddress.toLowerCase());
            const contractsDeployed = await areContractsDeployed();
            // Existence check: getAccountInfo throws for uninitialised addresses.
            // Kept separate from the balance fetch so a balance failure doesn't
            // incorrectly flip aptAccountExists to false.
            try {
                await aptos.getAccountInfo({ accountAddress: derived });
            }
            catch {
                // Account not yet on-chain — not an error, just not funded yet.
                return {
                    apt: 0,
                    aptAccountExists: false,
                    aptosContractsDeployed: contractsDeployed,
                    loading: false,
                };
            }
            // Account exists — fetch APT balance separately.
            let aptValue;
            try {
                aptValue = await aptos.getAccountAPTAmount({ accountAddress: derived });
            }
            catch {
                aptValue = 0;
            }
            return {
                apt: aptValue,
                aptAccountExists: true,
                aptosContractsDeployed: contractsDeployed,
                loading: false,
            };
        }
        catch (error) {
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
        let timer = null;
        const baseDelay = 5_000;
        const maxDelay = 60_000;
        const tick = async () => {
            if (cancelled)
                return;
            const snapshot = await fetchSnapshot();
            if (cancelled)
                return;
            setState(snapshot);
            // Back off when the fetch returned a fully-empty state — no account,
            // no contracts — which indicates an unreachable node rather than a valid
            // "not yet funded" state.
            const failed = !snapshot.aptAccountExists &&
                snapshot.apt === 0 &&
                !snapshot.aptosContractsDeployed;
            const delay = failed ? maxDelay : baseDelay;
            timer = setTimeout(() => void tick(), delay);
        };
        void tick();
        return () => {
            cancelled = true;
            if (timer)
                clearTimeout(timer);
        };
    }, [fetchSnapshot, host]);
    return {
        ...state,
        refetch,
    };
}
//# sourceMappingURL=useAptosBalances.js.map