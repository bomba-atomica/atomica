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
export declare function useTokenBalances(ethAddress: string | null): TokenBalances;
export {};
//# sourceMappingURL=useTokenBalances.d.ts.map