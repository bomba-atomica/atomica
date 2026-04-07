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

// Safe env access: works in Node (test/ts-node) and in Vite browser builds
const env =
  (import.meta as { env?: Record<string, string> }).env || process.env || {};

export const DEFAULT_CHAIN_CONFIG: ChainConfig = {
  ethereum: {
    rpcUrl: env.VITE_ETH_RPC_URL || "http://localhost:8545",
    fakeETH:
      env.VITE_FAKE_ETH_ADDRESS || "0x0000000000000000000000000000000000000000",
    fakeUSD:
      env.VITE_FAKE_USD_ADDRESS || "0x0000000000000000000000000000000000000000",
    lockBox:
      env.VITE_LOCK_BOX_ADDRESS || "0x0000000000000000000000000000000000000000",
  },
  aptos: {
    contractAddress:
      env.VITE_CONTRACT_ADDRESS ||
      "0x0000000000000000000000000000000000000000000000000000000000000000",
  },
};

declare global {
  interface GlobalThis {
    __ATOMICA_CHAIN_CONFIG__?: ChainConfig;
  }
}

type GlobalWithChainConfig = typeof globalThis & {
  __ATOMICA_CHAIN_CONFIG__?: ChainConfig;
};

const globalWithChainConfig = globalThis as GlobalWithChainConfig;

/**
 * Return the active chain configuration.
 *
 * Prefers `globalThis.__ATOMICA_CHAIN_CONFIG__` (set by test harnesses and
 * server-side renderers) over {@link DEFAULT_CHAIN_CONFIG}.
 *
 * @returns The active {@link ChainConfig}
 */
export function getChainConfig(): ChainConfig {
  return globalWithChainConfig.__ATOMICA_CHAIN_CONFIG__ ?? DEFAULT_CHAIN_CONFIG;
}
