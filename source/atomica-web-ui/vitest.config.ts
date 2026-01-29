/**
 * Vitest Configuration - Browser Tests for UI Components
 *
 * This configuration runs React component tests in a REAL BROWSER (Chromium via Playwright).
 * NO JSDOM - We use actual browser rendering for accurate UI testing.
 */

import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";

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
       * SEQUENTIAL EXECUTION for tests using localnet
       */
      fileParallelism: false,
      maxConcurrency: 1,

      include: ["tests/**/*.test.tsx"],
      exclude: ["**/node_modules/**", "**/dist/**", "**/*.skip"],
    },
  };
});
