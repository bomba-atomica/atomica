import { useCallback, useEffect, useState } from "react";
import { getAllBalances } from "../lib/ethereum/balances";
import { areContractsDeployed } from "../lib/ethereum/contracts";
import { getEthereumProvider } from "../lib/ethereum/config";
export function useEthereumBalances(ethAddress) {
    const [state, setState] = useState({
        ethAccountExists: false,
        ethBalance: 0n,
        ethFakeETH: 0n,
        ethFakeUSD: 0n,
        ethContractsDeployed: false,
        loading: true,
    });
    const load = useCallback(async () => {
        // No wallet connected — reset everything, stop loading.
        if (!ethAddress) {
            setState({
                ethAccountExists: false,
                ethBalance: 0n,
                ethFakeETH: 0n,
                ethFakeUSD: 0n,
                ethContractsDeployed: false,
                loading: false,
            });
            return true;
        }
        try {
            const provider = getEthereumProvider();
            // Fetch nonce and native balance in parallel to determine account existence.
            // We check both because a freshly-funded account may have balance but no nonce yet,
            // and a contract deployer may have a nonce but zero remaining balance.
            const [nonce, ethBalance] = await Promise.all([
                provider.getTransactionCount(ethAddress),
                provider.getBalance(ethAddress),
            ]);
            const ethAccountExists = nonce > 0 || ethBalance > 0n;
            // Check whether testnet contracts are deployed before querying token balances.
            // If contracts aren't up yet, token balance calls would fail or return stale zeros.
            const contractsDeployed = await areContractsDeployed();
            if (!contractsDeployed) {
                // Still surface the native ETH balance and existence flag
                // so the UI can show something useful even without token contract data.
                setState({
                    ethAccountExists,
                    ethBalance,
                    ethFakeETH: 0n,
                    ethFakeUSD: 0n,
                    ethContractsDeployed: false,
                    loading: false,
                });
                return true;
            }
            // Contracts are up — fetch all token balances.
            const balances = await getAllBalances(ethAddress);
            // Also count ERC-20 holdings as "account exists": the ETH faucet mints
            // FakeETH/FakeUSD without touching native ETH or nonce, so nonce+ethBalance
            // alone would incorrectly show "Account not yet on chain" after minting.
            const ethAccountExistsFinal = ethAccountExists || balances.fakeETH > 0n || balances.fakeUSD > 0n;
            setState({
                ethAccountExists: ethAccountExistsFinal,
                ethBalance: balances.eth,
                ethFakeETH: balances.fakeETH,
                ethFakeUSD: balances.fakeUSD,
                ethContractsDeployed: true,
                loading: false,
            });
            return true;
        }
        catch (error) {
            console.warn("Failed to refresh Ethereum balances:", error);
            setState((prev) => ({ ...prev, loading: false }));
            return false;
        }
    }, [ethAddress]);
    useEffect(() => {
        const baseDelay = 5_000;
        const maxDelay = 60_000;
        let retries = 0;
        let cancelled = false;
        let timer = null;
        const schedule = (delay) => {
            timer = setTimeout(() => void execute(), delay);
        };
        const execute = async () => {
            if (cancelled)
                return;
            const success = await load();
            // Back off exponentially on failure, reset on success.
            const nextDelay = success
                ? baseDelay
                : Math.min(baseDelay * 2 ** retries, maxDelay);
            retries = success ? 0 : retries + 1;
            if (!cancelled) {
                schedule(nextDelay);
            }
        };
        void execute();
        return () => {
            cancelled = true;
            if (timer)
                clearTimeout(timer);
        };
    }, [load]);
    const refetch = useCallback(async () => {
        await load();
    }, [load]);
    return {
        ...state,
        refetch,
    };
}
//# sourceMappingURL=useEthereumBalances.js.map