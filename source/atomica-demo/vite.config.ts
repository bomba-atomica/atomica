import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { devProxy } from "./src/dev-proxy";

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    nodePolyfills({
      // To add only specific polyfills, add them here.
      include: ["events", "buffer", "process", "util", "stream"],
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
  ],
  server: {
    // /aptos-api-<n> for each extra Aptos endpoint, then /aptos-api and
    // /eth-api (see src/dev-proxy.ts). loadEnv also returns VITE_* variables
    // set in the shell.
    proxy: devProxy(
      loadEnv(mode, process.cwd(), "VITE_").VITE_APTOS_EXTRA_FULLNODE_URLS,
    ),
  },
  resolve: {
    alias: {
      "@": "/src",
    },
    preserveSymlinks: true,
  },
  optimizeDeps: {
    include: ["@aptos-labs/ts-sdk", "ethers", "@noble/bls12-381"],
  },
}));
