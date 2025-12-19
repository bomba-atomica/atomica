/**
 * Browser Commands - RPC Bridge for Browser Tests
 *
 * This module provides WRAPPERS around test-utils/localnet.ts functions that can be
 * called from BROWSER TESTS via Vitest's browser command mechanism (RPC).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * CRITICAL CONCEPT: Remote Procedure Call (RPC) Bridge
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * WHY THIS EXISTS:
 * Browser tests run in Chromium, but certain operations MUST run in Node.js:
 * - Starting/stopping localnet (requires child_process)
 * - Running Aptos CLI commands (requires filesystem access)
 * - Funding accounts (requires HTTP server requests)
 *
 * HOW IT WORKS:
 *   1. Browser test calls: await commands.setupLocalnet()
 *   2. Vitest sends RPC from browser → Node.js server
 *   3. Node.js executes: setupLocalnetCommand()
 *   4. setupLocalnetCommand() calls: setupLocalnet() from ./localnet.ts
 *   5. Result returns to browser via RPC
 *   6. Browser test continues
 *
 * THE PATTERN:
 *
 *   Browser Test (Chromium)           Node.js Server
 *   ====================              ===============
 *
 *   commands.setupLocalnet()    →     setupLocalnetCommand()
 *                                            ↓
 *                                     setupLocalnet()  (from ./localnet.ts)
 *                                            ↓
 *   return { success: true }    ←     return { success: true }
 *
 * USAGE IN BROWSER TESTS:
 *
 *   import { commands } from 'vitest/browser';
 *
 *   describe.sequential("My Browser Test", () => {
 *     beforeAll(async () => {
 *       // This code runs in browser, but setupLocalnet() executes in Node.js
 *       await commands.setupLocalnet();
 *     }, 120000);
 *
 *     it("should test something", async () => {
 *       // Fund account (executes in Node.js)
 *       await commands.fundAccount("0x123...", 1_000_000_000);
 *
 *       // Now test browser-side code...
 *     });
 *   });
 *
 * HOW COMMANDS ARE REGISTERED:
 *
 * These BrowserCommand exports are registered in vitest.config.ts:
 *
 *   export default defineConfig({
 *     test: {
 *       browser: {
 *         commands: {
 *           setupLocalnet: setupLocalnetCommand,    // ← This file
 *           fundAccount: fundAccountCommand,        // ← This file
 *           // ...
 *         }
 *       }
 *     }
 *   });
 *
 * Then accessible in browser tests via:
 *   import { commands } from 'vitest/browser';
 *   commands.setupLocalnet()  // RPC to setupLocalnetCommand
 *
 * IMPORTANT FOR AI AGENTS:
 *
 * 1. This file is for BROWSER TESTS only
 *    - Meta tests import from ./localnet.ts directly
 *    - Browser tests use commands.* (RPC to this file)
 *
 * 2. These are WRAPPERS, not implementations
 *    - Real logic is in ./localnet.ts
 *    - These just proxy function calls via RPC
 *    - Add logging for visibility
 *
 * 3. Return values must be JSON-serializable
 *    - Sent over RPC from Node.js to browser
 *    - Can't return functions, classes, or complex objects
 *    - Keep it simple: { success: boolean, data?: any }
 *
 * 4. When adding new commands:
 *    - Export const myCommand: BrowserCommand<[args]>
 *    - Register in vitest.config.ts commands object
 *    - Document with clear @param and @returns
 *
 * SEE ALSO:
 * - test-utils/localnet.ts - Implementation of all functions
 * - vitest.config.ts - Where these commands are registered
 * - tests/README.md#understanding-browser-commands-architecture
 * - tests/README.md#two-ways-to-use-localnet
 */

import type { BrowserCommand } from "vitest/node";
import {
  setupLocalnet,
  // teardownLocalnet, // Unused in persistent mode
  deployContracts,
  fundAccount,
  // killZombies, // Unused - setupLocalnet handles cleanup internally
  runAptosCmd,
} from "./localnet";

/**
 * Module augmentation to add our custom commands to Vitest's browser commands types.
 * This provides TypeScript autocomplete and type checking in browser tests.
 */
declare module "vitest/browser" {
  interface BrowserCommands {
    setupLocalnet(): Promise<{ success: boolean }>;
    teardownLocalnet(): Promise<{ success: boolean }>;
    deployContracts(): Promise<{ success: boolean }>;
    fundAccount(
      address: string,
      amount?: number,
    ): Promise<{ success: boolean; txHash: string }>;
    runAptosCmd(
      args: string[],
      cwd?: string,
    ): Promise<{ stdout: string; stderr: string }>;
  }
}

/**
 * Start the local Aptos testnet.
 *
 * WHAT IT DOES:
 * - Calls setupLocalnet() from ./localnet.ts
 * - Starts localnet on ports 8080 (API) and 8081 (faucet)
 * - Waits for readiness (~10-15 seconds)
 * - Idempotent (safe to call multiple times)
 *
 * USAGE (from browser tests):
 *   import { commands } from 'vitest/browser';
 *   await commands.setupLocalnet();
 *
 * EXECUTION:
 * - Runs in Node.js (not browser)
 * - Browser test waits for RPC to complete
 *
 * @returns Promise resolving to { success: true }
 * @throws Error if localnet fails to start
 *
 * See: test-utils/localnet.ts#setupLocalnet for implementation
 * See: tests/README.md#browser-commands for architecture
 */
export const setupLocalnetCommand: BrowserCommand<[]> = async () => {
  console.log("[Browser Command] Starting localnet...");
  // setupLocalnet internally calls killZombies to ensure ports are free
  await setupLocalnet();
  console.log("[Browser Command] Localnet started");
  return { success: true };
};

/**
 * Stop the local Aptos testnet.
 *
 * NOTE: Currently a no-op in persistent mode.
 * Localnet stays running between tests for performance.
 *
 * USAGE (from browser tests):
 *   import { commands } from 'vitest/browser';
 *   await commands.teardownLocalnet();
 *
 * @returns Promise resolving to { success: true }
 */
export const teardownLocalnetCommand: BrowserCommand<[]> = async () => {
  console.log("[Browser Command] Teardown requested");
  // Only teardown if this is the last test file running
  // In persistent mode, we skip teardown between individual test files
  // but still need to cleanup when all tests are done
  return { success: true };
};

/**
 * Deploy Atomica contracts to localnet.
 *
 * WHAT IT DOES:
 * - Calls deployContracts() from ./localnet.ts
 * - Deploys registry, fake_eth, fake_usd modules
 * - Initializes all modules
 * - Takes ~30-60 seconds
 *
 * USAGE (from browser tests):
 *   import { commands } from 'vitest/browser';
 *   await commands.setupLocalnet();
 *   await commands.deployContracts();
 *
 * IMPORTANT:
 * - Must call setupLocalnet() first
 * - Idempotent (deploys only once)
 *
 * @returns Promise resolving to { success: true }
 * @throws Error if deployment fails
 *
 * See: test-utils/localnet.ts#deployContracts for implementation
 */
export const deployContractsCommand: BrowserCommand<[]> = async () => {
  console.log("[Browser Command] Deploying contracts...");
  await deployContracts();
  console.log("[Browser Command] Contracts deployed");
  return { success: true };
};

/**
 * Fund an account via the localnet faucet.
 *
 * WHAT IT DOES:
 * - Calls fundAccount() from ./localnet.ts
 * - Makes HTTP POST to http://127.0.0.1:8081/mint
 * - Creates account if needed
 * - Retries up to 3 times on failure
 *
 * USAGE (from browser tests):
 *   import { commands } from 'vitest/browser';
 *   const result = await commands.fundAccount("0x123...", 1_000_000_000);
 *   console.log(result.txHash);
 *
 * IMPORTANT:
 * - Amount is in octas (1 APT = 100_000_000 octas)
 * - Wait ~1 second after funding before checking balance
 *
 * @param _context - Vitest browser context (unused)
 * @param address - Aptos account address (0x... format)
 * @param amount - Amount in octas (default: 100_000_000 = 1 APT)
 * @returns Promise resolving to { success: true, txHash: string }
 * @throws Error if funding fails after all retries
 *
 * See: test-utils/localnet.ts#fundAccount for implementation
 */
export const fundAccountCommand: BrowserCommand<
  [address: string, amount?: number]
> = async (_context, address: string, amount: number = 100_000_000) => {
  console.log(`[Browser Command] Funding ${address} with ${amount}...`);
  const result = await fundAccount(address, amount);
  console.log("[Browser Command] Account funded");
  return { success: true, txHash: result };
};

/**
 * Run an Aptos CLI command.
 *
 * WHAT IT DOES:
 * - Calls runAptosCmd() from ./localnet.ts
 * - Spawns Aptos CLI process with given args
 * - Returns stdout and stderr
 *
 * USAGE (from browser tests):
 *   import { commands } from 'vitest/browser';
 *   const result = await commands.runAptosCmd([
 *     "move", "compile",
 *     "--package-dir", "/path/to/contract"
 *   ]);
 *   console.log(result.stdout);
 *
 * IMPORTANT:
 * - Default cwd: WEB_DIR (atomica-web/)
 * - Relative paths resolve from cwd
 * - Always use --assume-yes (no prompts)
 *
 * @param _context - Vitest browser context (unused)
 * @param args - Aptos CLI arguments
 * @param cwd - Working directory (optional, defaults to WEB_DIR)
 * @returns Promise resolving to { stdout: string, stderr: string }
 * @throws Error if command fails
 *
 * See: test-utils/localnet.ts#runAptosCmd for implementation
 * See: test-utils/localnet.ts#WEB_DIR for path information
 */
export const runAptosCmdCommand: BrowserCommand<
  [args: string[], cwd?: string]
> = async (_context, args: string[], cwd?: string) => {
  console.log(`[Browser Command] Running aptos ${args.join(" ")}...`);
  const result = await runAptosCmd(args, cwd);
  return result;
};
