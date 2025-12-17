/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Integration test configuration - forces sequential execution to avoid port conflicts
export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: "happy-dom",
        include: ["tests/integration/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
        // Force sequential execution to prevent localnet port conflicts
        fileParallelism: false,
        poolOptions: {
            threads: {
                singleThread: true,
            },
        },
    },
});
