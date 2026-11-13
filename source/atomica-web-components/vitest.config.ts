/**
 * Vitest Configuration - Browser Tests for UI Components
 *
 * This configuration runs React component tests in a REAL BROWSER (Chromium via Playwright).
 * NO JSDOM - We use actual browser rendering for accurate UI testing.
 */

import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { resolve } from "path";

// Load all vars from source/.env.test into the Vite server process (browser commands run here)
const testEnv = loadEnv("test", resolve(__dirname, ".."), "");
// Assign to process.env so browser commands (which run server-side) see these vars
Object.assign(process.env, testEnv);

// One same-origin proxy per extra Aptos endpoint: /aptos-api-<n> reaches the
// n-th URL of VITE_APTOS_EXTRA_FULLNODE_URLS, with the prefix stripped. The SDK
// (buildExtraAptosFullnodeUrls) points extra endpoint n at /aptos-api-<n>/v1.
const extraAptosProxies = Object.fromEntries(
  (process.env.VITE_APTOS_EXTRA_FULLNODE_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0)
    .map((url, i) => {
      const prefix = `/aptos-api-${i + 1}`;
      return [
        prefix,
        {
          target: new URL(url).origin,
          rewrite: (path: string) => path.replace(new RegExp(`^${prefix}`), ""),
        },
      ];
    }),
);

export default defineConfig(async () => {
  // Dynamic import to avoid ESM bundling issues in config
  const {
    setupLocalnetCommand,
    teardownLocalnetCommand,
    deployContractsCommand,
    fundAccountCommand,
    setupEthereumTestnetCommand,
    teardownEthereumTestnetCommand,
    setupDualChainTestnetCommand,
    teardownDualChainTestnetCommand,
    generateEthLockProofCommand,
    generateEthLockProofsCommand,
  } = await import("@atomica/aptos-docker-testnet/browser-commands");

  return {
    // No Node polyfills: the proof generator (viem getProof, ethers) loads and
    // runs in the page as is. 09-submit-bid proves a lock through AuctionBidder.
    // SCOUT(#236) EDIT: the same limit keeps SellFlow out of the browser suite (see 14-happy-path.test.tsx).
    plugins: [react()],
    // Point Vite at source/.env.test so VITE_* vars are available via
    // import.meta.env (used by e.g. src/lib/aptos/config.ts for CONTRACT_ADDR).
    envDir: resolve(__dirname, ".."),
    // Also inject all vars as compile-time bare-identifier globals so tests
    // can reference them directly (e.g. APTOS_DEPLOYER_PRIVATE_KEY).
    define: Object.fromEntries(
      Object.entries(testEnv).map(([k, v]) => [k, JSON.stringify(v)]),
    ),
    // Proxy /aptos-api/* to the localnet Aptos node so browser-mode tests
    // (where window is defined) can reach the node via the same relative URL
    // that the production app uses.
    server: {
      proxy: {
        // Vite takes the first key that prefixes the request path, so the
        // /aptos-api-<n> entries must come before /aptos-api.
        ...extraAptosProxies,
        "/aptos-api": {
          target: "http://127.0.0.1:8080",
          rewrite: (path: string) => path.replace(/^\/aptos-api/, ""),
        },
      },
    },
    test: {
      globals: true,
      setupFiles: ["./tests/setup.ts"],

      /**
       * BROWSER MODE: Run all component tests in real Chromium browser
       */
      browser: {
        enabled: true,
        headless: true,
        provider: playwright(),
        instances: [
          {
            browser: "chromium",
          },
        ],
        /**
         * BROWSER COMMANDS: RPC bridge for localnet operations
         *
         * Usage in tests:
         *   import { commands } from 'vitest/browser';
         *   await commands.setupLocalnet();
         */
        commands: {
          setupLocalnet: setupLocalnetCommand,
          teardownLocalnet: teardownLocalnetCommand,
          deployContracts: deployContractsCommand,
          fundAccount: fundAccountCommand,
          setupEthereumTestnet: setupEthereumTestnetCommand,
          teardownEthereumTestnet: teardownEthereumTestnetCommand,
          setupDualChainTestnet: setupDualChainTestnetCommand,
          teardownDualChainTestnet: teardownDualChainTestnetCommand,
          generateEthLockProof: generateEthLockProofCommand,
          generateEthLockProofs: generateEthLockProofsCommand,
        },
      },

      /**
       * ENVIRONMENT: Expose .env.test variables as globals in browser tests
       * (e.g. APTOS_DEPLOYER_PRIVATE_KEY, ETHEREUM_DEPLOYER_ADDRESS)
       */
      env: testEnv,

      /**
       * SEQUENTIAL EXECUTION for tests using localnet
       */
      fileParallelism: false,
      maxConcurrency: 1,

      include: ["tests/**/*.test.tsx", "tests/**/*.test.ts"],
      // tests/browser-extension holds Node-side Playwright tests run by
      // `bun run test:metamask`. If they stay in the browser suite, Vite's
      // dependency scan bundles playwright-core for the browser and fails on
      // its chromium-bidi requires, which breaks every browser test file.
      exclude: [
        "**/node_modules/**",
        "**/dist/**",
        "**/*.skip",
        "tests/browser-extension/**",
      ],
    },
  };
});
