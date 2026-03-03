/**
 * Ethereum Testnet Configuration
 *
 * Manages connection to local Ethereum testnet and contract addresses
 */

import { ethers } from "ethers";
import { buildEthRpcUrl, getStoredHost } from "../network-host";
import { getChainConfig } from "../chain-config.ts";

// Build-time env vars are kept for backwards compatibility constants below.
// Runtime RPC host is always derived from the selector state (localStorage/page host).
const ENV_ETH_WS_URL = import.meta.env.VITE_ETH_WS_URL as string | undefined;
const ENV_ETH_BEACON_URL = import.meta.env.VITE_ETH_BEACON_URL as
  | string
  | undefined;

export function getEthRpcUrl(): string {
  return buildEthRpcUrl(getStoredHost());
}

const { ethereum } = getChainConfig();

// Keep these for backwards compatibility / direct use in tests
export const ETH_RPC_URL = ethereum.rpcUrl;
export const ETH_WS_URL = ENV_ETH_WS_URL || "ws://localhost:8546";
export const ETH_BEACON_URL = ENV_ETH_BEACON_URL || "http://localhost:5052";

// Contract addresses (set after deployment)
export const FAKE_ETH_ADDRESS = ethereum.fakeETH;
export const FAKE_USD_ADDRESS = ethereum.fakeUSD;

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

  const chainIdHex = `0x${ETH_CHAIN_ID.toString(16)}`;

  try {
    await window.ethereum!.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (error: unknown) {
    const err = error as { code?: number; message?: string };
    // Chain not added yet (4902) — add it
    if (err.code === 4902) {
      const rpcUrl = getEthRpcUrl();
      await window.ethereum!.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: chainIdHex,
            chainName: "Atomica Ethereum Testnet",
            rpcUrls: [rpcUrl],
            nativeCurrency: {
              name: "Ether",
              symbol: "ETH",
              decimals: 18,
            },
          },
        ],
      });
    } else {
      // Re-throw as a proper Error so callers can display a useful message
      const msg =
        err.message ?? (error instanceof Error ? error.message : String(error));
      throw new Error(msg);
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
