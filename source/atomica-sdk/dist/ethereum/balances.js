/**
 * Balance query functions for Ethereum testnet
 *
 * Query ETH and ERC20 token balances
 */
import { ethers } from "ethers";
import { getFakeETHContract, getFakeUSDContract } from "./contracts.js";
import { getEthereumProvider } from "./config.js";
/**
 * Get ETH balance for an address
 * @param address Ethereum address
 * @returns Balance in wei
 */
export async function getETHBalance(address) {
    const provider = getEthereumProvider();
    return provider.getBalance(address);
}
/**
 * Get FakeETH balance for an address
 * @param address Ethereum address
 * @returns Balance in smallest units (18 decimals)
 */
export async function getFakeETHBalance(address) {
    const contract = getFakeETHContract();
    return contract.balanceOf(address);
}
/**
 * Get FakeUSD balance for an address
 * @param address Ethereum address
 * @returns Balance in smallest units (6 decimals)
 */
export async function getFakeUSDBalance(address) {
    const contract = getFakeUSDContract();
    return contract.balanceOf(address);
}
/**
 * Get all balances for an address
 * @param address Ethereum address
 * @returns Object with all balances
 */
export async function getAllBalances(address) {
    const [eth, fakeETH, fakeUSD] = await Promise.all([
        getETHBalance(address),
        getFakeETHBalance(address),
        getFakeUSDBalance(address),
    ]);
    return { eth, fakeETH, fakeUSD };
}
/**
 * Format ETH balance for display
 * @param balance Balance in wei
 * @returns Formatted string (e.g., "10.5000")
 */
export function formatETHBalance(balance) {
    return ethers.formatEther(balance);
}
/**
 * Format FakeUSD balance for display
 * @param balance Balance in smallest units (6 decimals)
 * @returns Formatted string (e.g., "10000.00")
 */
export function formatUSDBalance(balance) {
    return ethers.formatUnits(balance, 6);
}
/**
 * Format FakeETH balance for display
 * @param balance Balance in smallest units (18 decimals)
 * @returns Formatted string (e.g., "10.5000")
 */
export function formatFakeETHBalance(balance) {
    return ethers.formatEther(balance);
}
/**
 * Parse ETH amount from string
 * @param amount Amount as string (e.g., "10.5")
 * @returns Amount in wei
 */
export function parseETHAmount(amount) {
    return ethers.parseEther(amount);
}
/**
 * Parse USD amount from string
 * @param amount Amount as string (e.g., "10000.50")
 * @returns Amount in smallest units (6 decimals)
 */
export function parseUSDAmount(amount) {
    return ethers.parseUnits(amount, 6);
}
/**
 * Check if an address has any balance
 * @param address Ethereum address
 * @returns true if address has ETH, FakeETH, or FakeUSD
 */
export async function hasAnyBalance(address) {
    const { eth, fakeETH, fakeUSD } = await getAllBalances(address);
    return eth > 0n || fakeETH > 0n || fakeUSD > 0n;
}
/**
 * Poll balances at regular intervals
 * @param address Ethereum address
 * @param callback Callback function called with new balances
 * @param intervalMs Poll interval in milliseconds (default: 5000)
 * @returns Stop function to cancel polling
 */
export function pollBalances(address, callback, intervalMs = 5000) {
    let stopped = false;
    let retryCount = 0;
    const maxIntervalMs = 60000;
    async function poll() {
        if (stopped)
            return;
        let failed = false;
        try {
            const balances = await getAllBalances(address);
            callback(balances);
        }
        catch (error) {
            failed = true;
            console.error("Error polling balances:", error);
        }
        retryCount = failed ? retryCount + 1 : 0;
        const nextDelay = failed
            ? Math.min(intervalMs * 2 ** retryCount, maxIntervalMs)
            : intervalMs;
        if (!stopped) {
            setTimeout(poll, nextDelay);
        }
    }
    // Start polling
    poll();
    // Return stop function
    return () => {
        stopped = true;
    };
}
