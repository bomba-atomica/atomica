import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Run tests sequentially to avoid conflicts with shared localnet
    fileParallelism: false,
    maxConcurrency: 1,

    // Node.js environment for meta tests
    environment: "node",

    // Include only meta tests
    include: ["tests/meta/**/*.test.{ts,tsx}"],

    exclude: ["test-utils/**", "**/node_modules/**"],
  },
});
