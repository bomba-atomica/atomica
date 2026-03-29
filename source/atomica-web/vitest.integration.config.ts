/**
 * Vitest Configuration — Integration Tests (dual-chain browser mode)
 *
 * Runs integration tests in a real Chromium browser via Playwright.
 * Browser commands bridge Docker testnet lifecycle to the browser context.
 *
 * Usage:
 *   cd source/atomica-web-demo   # or any package with vitest in node_modules
 *   npx vitest run --config ../atomica-web/vitest.integration.config.ts
 *
 * Or via the atomica-web-demo test runner which has bun/vitest available:
 *   cd source/atomica-web-demo
 *   bun run test:integration
 */

import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import { loadEnv } from "vite";
import { resolve } from "path";

// Load all vars from source/.env.test so browser commands see them.
const testEnv = loadEnv("test", resolve(__dirname, ".."), "");
Object.assign(process.env, testEnv);

export default defineConfig(async () => {
  const {
    setupDualChainTestnetCommand,
    teardownDualChainTestnetCommand,
  } = await import("@atomica/aptos-docker-testnet/browser-commands");

  return {
    envDir: resolve(__dirname, ".."),
    define: Object.fromEntries(
      Object.entries(testEnv).map(([k, v]) => [k, JSON.stringify(v)]),
    ),
    test: {
      globals: true,

      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [{ browser: "chromium" }],
        commands: {
          setupDualChainTestnet: setupDualChainTestnetCommand,
          teardownDualChainTestnet: teardownDualChainTestnetCommand,
        },
      },

      // Sequential: Docker ports are fixed; parallel runs would collide.
      fileParallelism: false,
      maxConcurrency: 1,

      include: ["tests/integration/**/*.test.ts"],
      exclude: ["**/node_modules/**", "**/dist/**"],
    },
  };
});
