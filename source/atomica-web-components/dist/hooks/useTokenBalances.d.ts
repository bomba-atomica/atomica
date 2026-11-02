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
 * Poll token balances for the connected Ethereum wallet.
 *
 * Derives the Aptos address from `ethAddress` and fetches APT, FAKEETH, and
 * FAKEUSD balances every 5 seconds. Also checks contract deployment status
 * so callers can disable UI elements before the testnet is ready.
 *
 * @param ethAddress - Lowercase Ethereum hex address, or `null` when disconnected
 * @returns Live token balances and contract status flags
 * @see docs/architecture/v0-architecture.md#§1-package-layout
 */
export declare function useTokenBalances(ethAddress: string | null): TokenBalances;
export {};
//# sourceMappingURL=useTokenBalances.d.ts.map