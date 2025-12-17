/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Unit test configuration - allows parallel execution for speed
export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: "happy-dom",
        include: ["tests/unit/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
        // Enable parallel execution for unit tests
        fileParallelism: true,
        poolOptions: {
            threads: {
                singleThread: false,
            },
        },
    },
});
