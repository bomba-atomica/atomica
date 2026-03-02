/**
 * Ethereum Testnet Configuration
 *
 * Manages connection to local Ethereum testnet and contract addresses
 */

import { ethers } from "ethers";
import { getStoredHost } from "../network-host";

// Build-time env vars are used as overrides; at runtime the testnet host stored
// in localStorage takes precedence so the user can point the app at a remote
// machine without rebuilding.
const ENV_ETH_RPC_URL = import.meta.env.VITE_ETH_RPC_URL as string | undefined;
const ENV_ETH_WS_URL = import.meta.env.VITE_ETH_WS_URL as string | undefined;
const ENV_ETH_BEACON_URL = import.meta.env.VITE_ETH_BEACON_URL as
  | string
  | undefined;

export function getEthRpcUrl(): string {
  return ENV_ETH_RPC_URL || `http://${getStoredHost()}:8545`;
}

// Keep these for backwards compatibility / direct use in tests
export const ETH_RPC_URL = ENV_ETH_RPC_URL || "http://localhost:8545";
export const ETH_WS_URL = ENV_ETH_WS_URL || "ws://localhost:8546";
export const ETH_BEACON_URL = ENV_ETH_BEACON_URL || "http://localhost:5052";

// Contract addresses (set after deployment)
export const FAKE_ETH_ADDRESS =
  import.meta.env.VITE_FAKE_ETH_ADDRESS ||
  "0x0000000000000000000000000000000000000000";
export const FAKE_USD_ADDRESS =
  import.meta.env.VITE_FAKE_USD_ADDRESS ||
  "0x0000000000000000000000000000000000000000";

// Chain ID for local testnet
export const ETH_CHAIN_ID = 32382;

/**
 * Get a JSON-RPC provider for the Ethereum testnet.
 * Reads the testnet host from localStorage at call-time so it reflects any
 * runtime host change without requiring a page reload.
 */
export function getEthereumProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(getEthRpcUrl());
}

/**
 * Get a BrowserProvider for MetaMask interactions
 */
export function getMetaMaskProvider(): ethers.BrowserProvider | null {
  if (typeof window !== "undefined" && window.ethereum) {
    return new ethers.BrowserProvider(window.ethereum);
  }
  return null;
}

/**
 * Check if MetaMask is installed
 */
export function isMetaMaskInstalled(): boolean {
  return (
    typeof window !== "undefined" && typeof window.ethereum !== "undefined"
  );
}

/**
 * Request MetaMask to connect and return the user's address
 */
export async function connectMetaMask(): Promise<string> {
  if (!isMetaMaskInstalled()) {
    throw new Error("MetaMask is not installed");
  }

  const provider = getMetaMaskProvider();
  if (!provider) {
    throw new Error("Could not get MetaMask provider");
  }

  // Request account access
  const accounts = await provider.send("eth_requestAccounts", []);
  return accounts[0];
}

/**
 * Check if MetaMask is connected to the correct network
 */
export async function isCorrectNetwork(): Promise<boolean> {
  const provider = getMetaMaskProvider();
  if (!provider) return false;

  const network = await provider.getNetwork();
  return network.chainId === BigInt(ETH_CHAIN_ID);
}

/**
 * Request MetaMask to switch to the Ethereum testnet
 */
export async function switchToTestnet(): Promise<void> {
  if (!isMetaMaskInstalled()) {
    throw new Error("MetaMask is not installed");
  }

  try {
    await window.ethereum!.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${ETH_CHAIN_ID.toString(16)}` }],
    });
  } catch (error: unknown) {
    const err = error as { code?: number };
    // Chain not added yet, add it
    if (err.code === 4902) {
      await window.ethereum!.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: `0x${ETH_CHAIN_ID.toString(16)}`,
            chainName: "Atomica Ethereum Testnet",
            rpcUrls: [getEthRpcUrl()],
            nativeCurrency: {
              name: "Ether",
              symbol: "ETH",
              decimals: 18,
            },
          },
        ],
      });
    } else {
      throw error;
    }
  }
}

// Type augmentation for window.ethereum
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EthereumProvider = any;

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}
