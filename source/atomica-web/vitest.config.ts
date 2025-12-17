/// <reference types="vitest" />
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: [],
    include: ["tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],

    // Integration tests must run sequentially to avoid port conflicts
    // Unit tests can run in parallel for speed
    // Use --pool=threads --poolOptions.threads.singleThread=false for parallel unit tests
    // Use default (sequential) for integration tests
    fileParallelism: false,
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
