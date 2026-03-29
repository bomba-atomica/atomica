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
    };
};

// Safe access to import.meta.env — works in both Vite (browser/SSR) and plain Node.js
const metaEnv = (import.meta as { env?: Record<string, string> }).env || {};

export const DEFAULT_CHAIN_CONFIG: ChainConfig = {
    ethereum: {
        rpcUrl: metaEnv.VITE_ETH_RPC_URL || "http://localhost:8545",
        fakeETH: metaEnv.VITE_FAKE_ETH_ADDRESS || "0x0000000000000000000000000000000000000000",
        fakeUSD: metaEnv.VITE_FAKE_USD_ADDRESS || "0x0000000000000000000000000000000000000000",
        lockBox: metaEnv.VITE_LOCK_BOX_ADDRESS || "0x0000000000000000000000000000000000000000",
    },
    aptos: {
        contractAddress:
            metaEnv.VITE_CONTRACT_ADDRESS ||
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

export function getChainConfig(): ChainConfig {
    return globalWithChainConfig.__ATOMICA_CHAIN_CONFIG__ ?? DEFAULT_CHAIN_CONFIG;
}
