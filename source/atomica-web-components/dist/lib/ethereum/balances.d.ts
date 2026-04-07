/**
 * Balance query functions for Ethereum testnet
 *
 * Query ETH and ERC20 token balances
 */
export interface TokenBalances {
    eth: bigint;
    fakeETH: bigint;
    fakeUSD: bigint;
    loading: boolean;
    error: string | null;
}
/**
 * Get ETH balance for an address
 * @param address Ethereum address
 * @returns Balance in wei
 */
export declare function getETHBalance(address: string): Promise<bigint>;
/**
 * Get FakeETH balance for an address
 * @param address Ethereum address
 * @returns Balance in smallest units (18 decimals)
 */
export declare function getFakeETHBalance(address: string): Promise<bigint>;
/**
 * Get FakeUSD balance for an address
 * @param address Ethereum address
 * @returns Balance in smallest units (6 decimals)
 */
export declare function getFakeUSDBalance(address: string): Promise<bigint>;
/**
 * Get all balances for an address
 * @param address Ethereum address
 * @returns Object with all balances
 */
export declare function getAllBalances(address: string): Promise<{
    eth: bigint;
    fakeETH: bigint;
    fakeUSD: bigint;
}>;
/**
 * Format ETH balance for display
 * @param balance Balance in wei
 * @returns Formatted string (e.g., "10.5000")
 */
export declare function formatETHBalance(balance: bigint): string;
/**
 * Format FakeUSD balance for display
 * @param balance Balance in smallest units (6 decimals)
 * @returns Formatted string (e.g., "10000.00")
 */
export declare function formatUSDBalance(balance: bigint): string;
/**
 * Format FakeETH balance for display
 * @param balance Balance in smallest units (18 decimals)
 * @returns Formatted string (e.g., "10.5000")
 */
export declare function formatFakeETHBalance(balance: bigint): string;
/**
 * Parse ETH amount from string
 * @param amount Amount as string (e.g., "10.5")
 * @returns Amount in wei
 */
export declare function parseETHAmount(amount: string): bigint;
/**
 * Parse USD amount from string
 * @param amount Amount as string (e.g., "10000.50")
 * @returns Amount in smallest units (6 decimals)
 */
export declare function parseUSDAmount(amount: string): bigint;
/**
 * Check if an address has any balance
 * @param address Ethereum address
 * @returns true if address has ETH, FakeETH, or FakeUSD
 */
export declare function hasAnyBalance(address: string): Promise<boolean>;
/**
 * Poll balances at regular intervals
 * @param address Ethereum address
 * @param callback Callback function called with new balances
 * @param intervalMs Poll interval in milliseconds (default: 5000)
 * @returns Stop function to cancel polling
 */
export declare function pollBalances(address: string, callback: (balances: {
    eth: bigint;
    fakeETH: bigint;
    fakeUSD: bigint;
}) => void, intervalMs?: number): () => void;
//# sourceMappingURL=balances.d.ts.map