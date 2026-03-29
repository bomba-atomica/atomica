import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
    resolve: {
        extensions: [".ts", ".js", ".json"],
    },
    test: {
        globals: true,
        environment: "node",
        // Load .env.test from source/ directory (contains APTOS_ROOT_ACCOUNT_PUBLIC_KEY etc.)
        envDir: resolve(__dirname, "../../.."),
        testTimeout: 300000,
        hookTimeout: 180000,
        sequence: {
            concurrent: false,
        },
        include: ["test/**/*.test.ts"],
        fileParallelism: false,
        pool: "forks",
        maxWorkers: 1,
        run: true,
        isolate: false,
    },
});
