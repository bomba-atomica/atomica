/**
 * Ethereum wallet mock for UI tests that mint ERC20 tokens.
 *
 * Unlike the SIWE wallet mock (wallet-mock.ts), this mock also handles
 * eth_sendTransaction by signing and broadcasting to the local Ethereum RPC.
 * All other JSON-RPC calls are forwarded directly to the backing provider.
 *
 * Use this mock when testing components that submit Ethereum transactions
 * (e.g. ERC20 mint calls via MetaMask).
 */
export interface EthereumMintMockOptions {
    /** Private key of the test account */
    privateKey: string;
    /** Ethereum JSON-RPC URL (e.g. http://127.0.0.1:8545) */
    rpcUrl: string;
    /** Chain ID in decimal (default: 32382 — local testnet) */
    chainId?: number;
}
/**
 * Set up a window.ethereum mock that auto-approves and signs Ethereum
 * transactions using the provided private key, forwarding them to the
 * given RPC endpoint. All read-only JSON-RPC calls are proxied through.
 *
 * @returns The injected account address.
 */
export declare function setupEthereumMintMock(options: EthereumMintMockOptions): Promise<string>;
