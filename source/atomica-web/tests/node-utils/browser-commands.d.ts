/**
 * Type declarations for custom browser commands
 *
 * This augments the vitest/browser module to include our custom commands
 */

declare module "vitest/browser" {
  interface BrowserCommands {
    /**
     * Start the local Aptos testnet (runs in Node.js on server side)
     */
    setupLocalnet(): Promise<{ success: boolean }>;

    /**
     * Stop the local Aptos testnet (runs in Node.js on server side)
     */
    teardownLocalnet(): Promise<{ success: boolean }>;

    /**
     * Deploy Atomica contracts (runs in Node.js on server side)
     */
    deployContracts(): Promise<{ success: boolean }>;

    /**
     * Fund an account via faucet (runs in Node.js on server side)
     * @param address - The account address to fund
     * @param amount - Amount in octas (default: 100_000_000 = 1 APT)
     */
    fundAccount(
      address: string,
      amount?: number,
    ): Promise<{ success: boolean; txHash: string }>;
  }
}
