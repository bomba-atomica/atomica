import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 120000, // 120s default timeout for integration tests
    hookTimeout: 180000, // 180s for beforeAll/afterAll hooks
    sequence: {
      concurrent: false, // Run test files sequentially by default
    },
  },
});
