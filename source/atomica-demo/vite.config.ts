import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// One same-origin proxy per extra Aptos endpoint: /aptos-api-<n> reaches the
// n-th URL of VITE_APTOS_EXTRA_FULLNODE_URLS, with the prefix stripped. The SDK
// (buildExtraAptosFullnodeUrls) points extra endpoint n at /aptos-api-<n>/v1.
// Vite takes the first key that prefixes the request path, so a /aptos-api
// entry must come after these.
function extraAptosProxies(value: string | undefined) {
  return Object.fromEntries(
    (value ?? "")
      .split(",")
      .map((url) => url.trim())
      .filter((url) => url.length > 0)
      .map((url, i) => {
        const prefix = `/aptos-api-${i + 1}`;
        return [
          prefix,
          {
            target: new URL(url).origin,
            rewrite: (path: string) =>
              path.replace(new RegExp(`^${prefix}`), ""),
          },
        ];
      }),
  );
}

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
  server: {
    // loadEnv also returns VITE_* variables set in the shell.
    proxy: extraAptosProxies(
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
