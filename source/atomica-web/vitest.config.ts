import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import {
  setupLocalnetCommand,
  teardownLocalnetCommand,
  deployContractsCommand,
  fundAccountCommand,
  runAptosCmdCommand,
} from "./tests/node-utils/browser-commands";

export default defineConfig({
  plugins: [react()],
  test: {
    // globals: true,
    fileParallelism: false,
    maxConcurrency: 1,
    // reporters: ["default", "./tests/forceExitReporter.ts"],
    // setupFiles: ["./tests/setup.ts"],

    // All tests run in browser (Chromium via Playwright)
    // No more happy-dom - everything is real browser testing
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [
        {
          browser: "chromium",
        },
      ],
      // Custom commands that run in Node.js but can be called from browser tests
      // Usage: import { commands } from 'vitest/browser'; await commands.setupLocalnet();
      commands: {
        setupLocalnet: setupLocalnetCommand,
        teardownLocalnet: teardownLocalnetCommand,
        deployContracts: deployContractsCommand,
        fundAccount: fundAccountCommand,
        runAptosCmd: runAptosCmdCommand,
      },
    },

    // Include all test files in browser environment
    include: ["tests/**/*.test.{ts,tsx}"],

    exclude: ["tests/node-utils/**", "**/node_modules/**"],
  },
});
