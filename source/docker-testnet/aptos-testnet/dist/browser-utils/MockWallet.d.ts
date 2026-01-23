import { ethers } from "ethers";
export declare class MockWallet {
    chainId: string;
    wallet: ethers.Wallet;
    constructor(privateKey: string, chainId?: number | string);
    get address(): string;
    getProvider(): {
        isMetaMask: boolean;
        request: ({ method, params, }: {
            method: string;
            params: unknown[];
        }) => Promise<string | string[]>;
        on: () => void;
        removeListener: () => void;
    };
}
