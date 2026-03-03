/// <reference types="vite/client" />

export type ChainConfig = {
  ethereum: {
    rpcUrl: string;
    fakeETH: string;
    fakeUSD: string;
    lockBox: string;
  };
  aptos: {
    contractAddress: string;
    aptosUrl: string;
  };
};

export const DEFAULT_CHAIN_CONFIG: ChainConfig = {
  ethereum: {
    rpcUrl: import.meta.env.VITE_ETH_RPC_URL || "http://localhost:8545",
    fakeETH:
      import.meta.env.VITE_FAKE_ETH_ADDRESS ||
      "0x0000000000000000000000000000000000000000",
    fakeUSD:
      import.meta.env.VITE_FAKE_USD_ADDRESS ||
      "0x0000000000000000000000000000000000000000",
    lockBox:
      import.meta.env.VITE_LOCK_BOX_ADDRESS ||
      "0x0000000000000000000000000000000000000000",
  },
  aptos: {
    contractAddress:
      import.meta.env.VITE_CONTRACT_ADDRESS ||
      "0x0000000000000000000000000000000000000000000000000000000000000000",
    aptosUrl: import.meta.env.VITE_APTOS_URL || "http://localhost:8080",
  },
};

export function getChainConfig(): ChainConfig {
  return DEFAULT_CHAIN_CONFIG;
}
