export interface EthereumBalances {
    /**
     * Whether this address has been active on the Ethereum chain.
     * True when nonce > 0 (has sent txs) OR native ETH balance > 0 (has been funded).
     * This is checked independently of token balances so the UI can show
     * "Account not yet on chain" rather than misleading zero balances.
     */
    ethAccountExists: boolean;
    /** Native ETH balance in wei. Only meaningful when ethAccountExists is true. */
    ethBalance: bigint;
    /** FakeETH ERC-20 balance (18 decimals). Only present when ethContractsDeployed. */
    ethFakeETH: bigint;
    /** FakeUSD ERC-20 balance (6 decimals). Only present when ethContractsDeployed. */
    ethFakeUSD: bigint;
    /**
     * Whether the FakeETH / FakeUSD contracts are deployed on the current testnet.
     * Token balances are zero-valued (not meaningful) when this is false.
     */
    ethContractsDeployed: boolean;
    loading: boolean;
}
export type EthereumBalancesSnapshot = EthereumBalances & {
    refetch: () => Promise<void>;
};
export declare function useEthereumBalances(ethAddress: string | null): EthereumBalancesSnapshot;
//# sourceMappingURL=useEthereumBalances.d.ts.map