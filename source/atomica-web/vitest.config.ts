/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Unified vitest configuration
// Runs all tests sequentially to prevent localnet port conflicts
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "happy-dom",

    // Force sequential execution at the file level
    // This prevents multiple integration tests from starting localnet simultaneously
    fileParallelism: false,
    maxConcurrency: 1,

    // Include all test files
    include: ["tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],

    // Exclude node_modules and build artifacts
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.{idea,git,cache,output,temp}/**",
    ],
  },
});
