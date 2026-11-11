import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
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
  // SCOUT(#236) ADD: dev proxies for the two API paths the SDK calls in a browser (network-host.ts).
  // server: {
  //   proxy: {
  //     "/aptos-api": {
  //       target: "http://127.0.0.1:8080",
  //       rewrite: (path) => path.replace(/^\/aptos-api/, ""),
  //     },
  //     "/eth-api": {
  //       target: "http://127.0.0.1:8545",
  //       rewrite: (path) => path.replace(/^\/eth-api/, ""),
  //     },
  //   },
  // },
  resolve: {
    alias: {
      "@": "/src",
    },
    preserveSymlinks: true,
  },
  optimizeDeps: {
    include: ["@aptos-labs/ts-sdk", "ethers", "@noble/bls12-381"],
  },
});
