import { ATOMICA_CONTRACT_ADDRESS } from "../../../shared/test-constants";

export type ChainConfig = {
  ethereum: {
    rpcUrl: string;
    fakeETH: string;
    fakeUSD: string;
    lockBox: string;
  };
  aptos: {
    contractAddress: string;
  };
};

const env =
  (import.meta as { env?: Record<string, string> }).env ||
  (typeof process !== "undefined" && process.env) ||
  {};

export const DEFAULT_CHAIN_CONFIG: ChainConfig = {
  ethereum: {
    rpcUrl: (env.VITE_ETH_RPC_URL as string) || "http://localhost:8545",
    fakeETH:
      (env.VITE_FAKE_ETH_ADDRESS as string) ||
      "0x0000000000000000000000000000000000000000",
    fakeUSD:
      (env.VITE_FAKE_USD_ADDRESS as string) ||
      "0x0000000000000000000000000000000000000000",
    lockBox:
      (env.VITE_LOCK_BOX_ADDRESS as string) ||
      "0x0000000000000000000000000000000000000000",
  },
  aptos: {
    contractAddress:
      (env.VITE_CONTRACT_ADDRESS as string) || ATOMICA_CONTRACT_ADDRESS,
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

export function getChainConfig(): ChainConfig {
  return globalWithChainConfig.__ATOMICA_CHAIN_CONFIG__ ?? DEFAULT_CHAIN_CONFIG;
}
