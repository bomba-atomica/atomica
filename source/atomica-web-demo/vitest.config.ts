/**
 * Vitest Configuration - Browser Tests for Atomica Demo
 */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import type { BrowserCommand } from "vitest/node";
import { resolve } from "path";

type BrowserCommands = {
  setupLocalnet: (context: any) => Promise<{ success: boolean }>;
  deployContracts: (context: any) => Promise<{ success: boolean }>;
  fundAccount: (context: any, address: string, amount?: number) => Promise<{ success: boolean; txHash: string }>;
};

async function createBrowserCommands(): Promise<BrowserCommands> {
  // Dynamic import - only loaded on Node.js server side, not bundled to browser
  const localnet = await import("@atomica/aptos-docker-testnet");
  
  return {
    setupLocalnet: async (_context) => {
      console.log("[BrowserCommand] Setting up localnet...");
      await localnet.setupLocalnet();
      console.log("[BrowserCommand] Localnet ready");
      return { success: true };
    },
    deployContracts: async (_context) => {
      console.log("[BrowserCommand] Deploying contracts...");
      await localnet.deployContracts();
      console.log("[BrowserCommand] Contracts deployed");
      return { success: true };
    },
    fundAccount: async (_context, address: string, amount?: number) => {
      console.log(`[BrowserCommand] Funding account ${address} with ${amount || 100_000_000}...`);
      const txHash = await localnet.fundAccount(address, amount);
      console.log(`[BrowserCommand] Account funded: ${txHash}`);
      return { success: true, txHash };
    },
  };
}

// Create commands synchronously with type definitions
// The actual implementation is loaded dynamically
const setupLocalnetCommand: BrowserCommand<[]> = async (context) => {
  const commands = await createBrowserCommands();
  return commands.setupLocalnet(context);
};

const deployContractsCommand: BrowserCommand<[]> = async (context) => {
  const commands = await createBrowserCommands();
  return commands.deployContracts(context);
};

const fundAccountCommand: BrowserCommand<[string, number?]> = async (context, address, amount) => {
  const commands = await createBrowserCommands();
  return commands.fundAccount(context, address, amount);
};

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      include: ["events", "buffer", "process", "util", "stream", "fs", "path"],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
      "@atomica/atomica-web-ui": resolve(__dirname, "../atomica-web-ui/src/index.ts"),
      "@atomica/aptos-docker-testnet/browser": resolve(__dirname, "../docker-testnet/aptos-testnet/src/browser-index.ts"),
      "@atomica/aptos-docker-testnet/browser-utils/MockWallet": resolve(__dirname, "../docker-testnet/aptos-testnet/src/browser-utils/MockWallet.ts"),
      "@atomica/aptos-docker-testnet/browser-utils/wallet-mock": resolve(__dirname, "../docker-testnet/aptos-testnet/src/browser-utils/wallet-mock.ts"),
      "@atomica/aptos-docker-testnet": resolve(__dirname, "../docker-testnet/aptos-testnet/src/index.ts"),
      "@atomica/state-proof-verifier/ibe": resolve(__dirname, "../state-proofs/typescript/src/ibe/index.ts"),
      "@atomica/state-proof-verifier": resolve(__dirname, "../state-proofs/typescript/src/index.ts"),
    },
  },
  test: {
    fileParallelism: false,
    maxConcurrency: 1,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        {
          browser: "chromium",
        },
      ],
      commands: {
        setupLocalnet: setupLocalnetCommand,
        deployContracts: deployContractsCommand,
        fundAccount: fundAccountCommand,
      },
    },
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/meta/**", "test-utils/**", "**/node_modules/**"],
  },
});
