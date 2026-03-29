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
export declare const DEFAULT_CHAIN_CONFIG: ChainConfig;
declare global {
    interface GlobalThis {
        __ATOMICA_CHAIN_CONFIG__?: ChainConfig;
    }
}
export declare function getChainConfig(): ChainConfig;
