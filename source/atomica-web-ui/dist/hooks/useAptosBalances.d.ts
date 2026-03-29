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
export type AptosBalancesSnapshot = AptosBalanceSnapshot & {
    refetch: () => Promise<void>;
};
export declare function useAptosBalances(ethAddress: string | null): AptosBalancesSnapshot;
//# sourceMappingURL=useAptosBalances.d.ts.map