/// <reference types="vite/client" />
export const DEFAULT_CHAIN_CONFIG = {
    ethereum: {
        rpcUrl: import.meta.env.VITE_ETH_RPC_URL || "http://localhost:8545",
        fakeETH: import.meta.env.VITE_FAKE_ETH_ADDRESS ||
            "0x0000000000000000000000000000000000000000",
        fakeUSD: import.meta.env.VITE_FAKE_USD_ADDRESS ||
            "0x0000000000000000000000000000000000000000",
        lockBox: import.meta.env.VITE_LOCK_BOX_ADDRESS ||
            "0x0000000000000000000000000000000000000000",
    },
    aptos: {
        contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS ||
            "0x0000000000000000000000000000000000000000000000000000000000000000",
    },
};
const globalWithChainConfig = globalThis;
export function getChainConfig() {
    return globalWithChainConfig.__ATOMICA_CHAIN_CONFIG__ ?? DEFAULT_CHAIN_CONFIG;
}
//# sourceMappingURL=chain-config.js.map