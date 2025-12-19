/**
 * Custom Browser Commands for Vitest
 *
 * These commands run on the Node.js server side but can be called from browser tests.
 * This bridges the gap between browser test execution and Node.js orchestration.
 *
 * Usage in browser tests:
 *   import { commands } from 'vitest/browser'
 *   await commands.setupLocalnet()
 *   await commands.teardownLocalnet()
 */

import type { BrowserCommand } from "vitest/node";
import {
  setupLocalnet,
  teardownLocalnet,
  deployContracts,
  fundAccount,
  killZombies,
} from "./localnet";

/**
 * Start the local Aptos testnet (runs in Node.js)
 * First cleans up any zombie processes from previous runs.
 */
export const setupLocalnetCommand: BrowserCommand<[]> = async () => {
  console.log("[Browser Command] Cleaning up zombies and starting localnet...");
  await killZombies();
  await setupLocalnet();
  console.log("[Browser Command] Localnet started");
  return { success: true };
};

/**
 * Stop the local Aptos testnet (runs in Node.js)
 */
export const teardownLocalnetCommand: BrowserCommand<[]> = async () => {
  console.log("[Browser Command] Stopping localnet...");
  await teardownLocalnet();
  console.log("[Browser Command] Localnet stopped");
  return { success: true };
};

/**
 * Deploy Atomica contracts (runs in Node.js)
 */
export const deployContractsCommand: BrowserCommand<[]> = async () => {
  console.log("[Browser Command] Deploying contracts...");
  await deployContracts();
  console.log("[Browser Command] Contracts deployed");
  return { success: true };
};

/**
 * Fund an account via faucet (runs in Node.js)
 */
export const fundAccountCommand: BrowserCommand<
  [address: string, amount?: number]
> = async (_context, address: string, amount: number = 100_000_000) => {
  console.log(`[Browser Command] Funding ${address} with ${amount}...`);
  const result = await fundAccount(address, amount);
  console.log("[Browser Command] Account funded");
  return { success: true, txHash: result };
};
