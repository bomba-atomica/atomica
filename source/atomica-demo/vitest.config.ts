/**
 * Vitest Configuration - Browser Tests
 *
 * This configuration runs tests in a REAL BROWSER (Chromium via Playwright).
 * NO JSDOM - We use actual browser rendering for accurate testing.
 *
 * TEST CATEGORIES:
 * - Unit tests: Simple logic tests (can run in browser without DOM)
 * - Component tests: React component rendering tests
 * - UI tests: User interaction tests
 *
 * SEQUENTIAL EXECUTION:
 * Tests that use localnet must run sequentially to avoid port conflicts.
 * Use describe.sequential() in tests that interact with localnet.
 */

import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: path.resolve(__dirname, "./node_modules/react"),
      "react-dom": path.resolve(__dirname, "./node_modules/react-dom"),
    },
  },
  optimizeDeps: {
    include: ["react-dom/client", "@testing-library/react"],
  },
  test: {
    globals: true,

    /**
     * BROWSER MODE: Run all tests in real Chromium browser
     *
     * WHY NOT JSDOM?
     * - jsdom is a DOM simulation that doesn't match real browser behavior
     * - Real browsers provide accurate rendering, events, and APIs
     * - Testing in real browsers catches more bugs
     * - Playwright provides fast, headless browser testing
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
    },

    /**
     * SEQUENTIAL EXECUTION for tests using localnet
     *
     * Tests that interact with localnet bind to fixed ports (8080, 8081).
     * Running in parallel causes port conflicts.
     *
     * Use describe.sequential() in test files that need localnet.
     */
    fileParallelism: false,
    maxConcurrency: 1,

    /**
     * TEST PATTERNS
     */
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
