/**
 * Ethereum Testnet Configuration
 *
 * Manages connection to local Ethereum testnet and contract addresses
 */
import { ethers } from "ethers";
export declare function getEthRpcUrl(): string;
export declare const ETH_RPC_URL: string;
export declare const ETH_WS_URL: string;
export declare const ETH_BEACON_URL: string;
export declare const FAKE_ETH_ADDRESS: string;
export declare const FAKE_USD_ADDRESS: string;
export declare const ETH_CHAIN_ID = 32382;
/**
 * Get a JSON-RPC provider for the Ethereum testnet.
 * Reads the testnet host from localStorage at call-time so it reflects any
 * runtime host change without requiring a page reload.
 */
export declare function getEthereumProvider(): ethers.JsonRpcProvider;
/**
 * Get a BrowserProvider for MetaMask interactions
 */
export declare function getMetaMaskProvider(): ethers.BrowserProvider | null;
/**
 * Check if MetaMask is installed
 */
export declare function isMetaMaskInstalled(): boolean;
/**
 * Request MetaMask to connect and return the user's address
 */
export declare function connectMetaMask(): Promise<string>;
/**
 * Check if MetaMask is connected to the correct network
 */
export declare function isCorrectNetwork(): Promise<boolean>;
/**
 * Request MetaMask to switch to the Ethereum testnet
 */
export declare function switchToTestnet(): Promise<void>;
//# sourceMappingURL=config.d.ts.map