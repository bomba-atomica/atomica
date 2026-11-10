/**
 * Dual-chain RPC and contract address configuration for Atomica.
 *
 * Consumed by Ethereum helpers (via `getChainConfig()`) and Aptos payloads.
 * In browser builds the config is sourced from `VITE_*` env variables.
 * In Node test builds `process.env` is used.
 * Test harnesses override the global via `globalThis.__ATOMICA_CHAIN_CONFIG__`.
 *
 * @see docs/architecture/v0-architecture.md#§1-package-layout
 */
export type ChainConfig = {
    ethereum: {
        /** Ethereum JSON-RPC endpoint URL */
        rpcUrl: string;
        /** Deployed FakeETH ERC-20 contract address */
        fakeETH: string;
        /** Deployed FakeUSD ERC-20 contract address */
        fakeUSD: string;
        /** Deployed LockBox escrow contract address */
        lockBox: string;
    };
    aptos: {
        /** Deployed Atomica Move package address on Aptos */
        contractAddress: string;
    };
};
export declare const DEFAULT_CHAIN_CONFIG: ChainConfig;
declare global {
    interface GlobalThis {
        __ATOMICA_CHAIN_CONFIG__?: ChainConfig;
    }
}
/**
 * Return the active chain configuration.
 *
 * Prefers `globalThis.__ATOMICA_CHAIN_CONFIG__` (set by test harnesses and
 * server-side renderers) over {@link DEFAULT_CHAIN_CONFIG}.
 *
 * @returns The active {@link ChainConfig}
 */
export declare function getChainConfig(): ChainConfig;
