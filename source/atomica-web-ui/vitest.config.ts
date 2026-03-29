/**
 * Vitest Configuration - Browser Tests for UI Components
 *
 * This configuration runs React component tests in a REAL BROWSER (Chromium via Playwright).
 * NO JSDOM - We use actual browser rendering for accurate UI testing.
 */

import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { resolve } from "path";

// Load all vars from source/.env.test into the Vite server process (browser commands run here)
const testEnv = loadEnv("test", resolve(__dirname, ".."), "");
// Assign to process.env so browser commands (which run server-side) see these vars
Object.assign(process.env, testEnv);

export default defineConfig(async () => {
  // Dynamic import to avoid ESM bundling issues in config
  const {
    setupLocalnetCommand,
    teardownLocalnetCommand,
    deployContractsCommand,
    fundAccountCommand,
  } = await import("@atomica/aptos-docker-testnet/browser-commands");

  return {
    plugins: [react()],
    // Inject test credentials as compile-time globals so tests can use them
    // as bare identifiers (e.g. APTOS_DEPLOYER_PRIVATE_KEY).
    define: Object.fromEntries(
      Object.entries(testEnv).map(([k, v]) => [k, JSON.stringify(v)]),
    ),
    test: {
      globals: true,
      setupFiles: ["./tests/setup.ts"],

      /**
       * BROWSER MODE: Run all component tests in real Chromium browser
       */
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [
          {
            browser: "chromium",
          },
        ],
        /**
         * BROWSER COMMANDS: RPC bridge for localnet operations
         *
         * Usage in tests:
         *   import { commands } from 'vitest/browser';
         *   await commands.setupLocalnet();
         */
        commands: {
          setupLocalnet: setupLocalnetCommand,
          teardownLocalnet: teardownLocalnetCommand,
          deployContracts: deployContractsCommand,
          fundAccount: fundAccountCommand,
        },
      },

      /**
       * ENVIRONMENT: Expose .env.test variables as globals in browser tests
       * (e.g. APTOS_DEPLOYER_PRIVATE_KEY, ETHEREUM_DEPLOYER_ADDRESS)
       */
      env: testEnv,

      /**
       * SEQUENTIAL EXECUTION for tests using localnet
       */
      fileParallelism: false,
      maxConcurrency: 1,

      include: ["tests/**/*.test.tsx"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/*.skip"],
    },
  };
});
