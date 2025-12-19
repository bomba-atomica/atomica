import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        fileParallelism: false,
        maxConcurrency: 1,

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
        },

        // Node.js orchestration runs before tests
        globalSetup: "./tests/node-utils/global-setup.ts",

        // Include all test files
        include: ["tests/**/*.test.{ts,tsx}"],
    },
});
