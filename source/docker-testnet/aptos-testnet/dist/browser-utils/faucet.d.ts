/**
 * Browser-compatible faucet client
 *
 * This module provides utilities for funding accounts on Aptos localnet
 * using ONLY browser APIs (fetch, window, etc.)
 *
 * ⚠️ BROWSER-ONLY CODE ⚠️
 * This file must not import any Node.js modules (fs, http, child_process, etc.)
 * It should be runnable in a production web environment.
 */
/**
 * Fund an account on the local Aptos faucet
 *
 * @param address - The Aptos address to fund (hex string with 0x prefix)
 * @param amount - Amount in Octas (default: 100_000_000 = 1 APT)
 * @returns Promise<string> - Response data from faucet (usually transaction hashes)
 *
 * @example
 * ```typescript
 * // Fund account with 1 APT (100 million Octas)
 * await fundAccount("0xabc123...", 100_000_000);
 *
 * // Fund with 10 APT
 * await fundAccount("0xabc123...", 1_000_000_000);
 * ```
 */
export declare function fundAccount(address: string, amount?: number): Promise<string>;
/**
 * Check if the faucet is ready
 *
 * @returns Promise<boolean> - True if faucet is accessible
 */
export declare function isFaucetReady(): Promise<boolean>;
