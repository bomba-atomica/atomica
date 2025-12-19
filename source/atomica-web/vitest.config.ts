import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import {
  setupLocalnetCommand,
  teardownLocalnetCommand,
  deployContractsCommand,
  fundAccountCommand,
} from "./tests/node-utils/browser-commands";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    fileParallelism: false,
    maxConcurrency: 1,

    // Browser mode for UI component tests only
    // Integration/sanity tests run in Node.js via globalSetup orchestration
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
      },
    },

    // globalSetup handles teardown only - browser commands handle setup
    // Tests use: await commands.setupLocalnet(); await commands.deployContracts();
    globalSetup: "./tests/node-utils/global-setup.ts",

    // Include UI component tests and browser-compatible integration tests
    include: [
      "tests/ui-component/**/*.test.{ts,tsx}",
      "tests/integration/sanity/localnet.test.ts",
      "tests/integration/sanity/transfer.test.ts",
    ],

    // Exclude node-utils and tests that require Node.js modules
    // These tests use happy-dom environment and can't run in real browser:
    // - AccountStatus.integration.test.tsx: imports node-utils/localnet
    // - TxButton.simulate-submit.test.tsx: imports node-fetch, eth-testing, node-utils
    exclude: [
      "tests/node-utils/**",
      "**/node_modules/**",
      "tests/ui-component/TxButton.simulate-submit.test.tsx",
    ],
  },
});
