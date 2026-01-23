/**
 * Browser-compatible MetaMask wallet mock
 * This runs in the actual browser context and provides window.ethereum
 */
interface EthereumProvider {
    request: (args: {
        method: string;
        params?: unknown[];
    }) => Promise<unknown>;
    on: (event: string, handler: (...args: unknown[]) => void) => void;
    removeListener: (event: string, handler: (...args: unknown[]) => void) => void;
    isMetaMask: boolean;
    selectedAddress: string | null;
    chainId: string;
}
declare global {
    interface Window {
        ethereum: EthereumProvider;
    }
}
export declare function setupBrowserWalletMock(testAccount: string, privateKey: string): EthereumProvider;
export {};
