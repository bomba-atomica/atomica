/**
 * Vitest Configuration - Browser Tests for Atomica SDK
 *
 * This configuration runs tests in a REAL BROWSER (Chromium via Playwright).
 *
 * WHY BROWSER MODE?
 * - atomica-sdk contains browser-specific code (window.ethereum, window.location)
 * - Testing in actual browser environment ensures compatibility
 * - Validates that the SDK works correctly when bundled for web applications
 *
 * TEST CATEGORIES:
 * - Unit tests for SIWE message construction
 * - Address derivation tests
 * - Authenticator serialization tests
 * - All tests can run in browser as they're pure logic or browser-compatible
 */

import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
  test: {
    globals: true,

    /**
     * BROWSER MODE: Run tests in real Chromium browser
     *
     * Even though most SDK tests are pure logic, running them in a browser:
     * - Validates browser compatibility
     * - Tests browser-specific code paths (window checks)
     * - Ensures SDK works when bundled for web apps
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

    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
  },
});
