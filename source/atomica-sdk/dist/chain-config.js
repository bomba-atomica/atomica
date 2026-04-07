// Safe env access: works in Node (test/ts-node) and in Vite browser builds
const env = import.meta.env || process.env || {};
export const DEFAULT_CHAIN_CONFIG = {
    ethereum: {
        rpcUrl: env.VITE_ETH_RPC_URL || "http://localhost:8545",
        fakeETH: env.VITE_FAKE_ETH_ADDRESS || "0x0000000000000000000000000000000000000000",
        fakeUSD: env.VITE_FAKE_USD_ADDRESS || "0x0000000000000000000000000000000000000000",
        lockBox: env.VITE_LOCK_BOX_ADDRESS || "0x0000000000000000000000000000000000000000",
    },
    aptos: {
        contractAddress: env.VITE_CONTRACT_ADDRESS ||
            "0x0000000000000000000000000000000000000000000000000000000000000000",
    },
};
const globalWithChainConfig = globalThis;
export function getChainConfig() {
    return globalWithChainConfig.__ATOMICA_CHAIN_CONFIG__ ?? DEFAULT_CHAIN_CONFIG;
}
