import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.tsx"],
    globals: true, // Use describe, it, expect without import
    setupFiles: ["./tests/setup.ts"], // We might need this for jest-dom matchers
  },
});
