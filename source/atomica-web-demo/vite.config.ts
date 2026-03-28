import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "remote-console-logs",
      configureServer(server) {
        server.middlewares.use("/__log", (req, res, next) => {
          if (req.method === "POST") {
            let body = "";
            req.on("data", (chunk) => (body += chunk));
            req.on("end", () => {
              try {
                const entry = JSON.parse(body);

  const hostIp = env.VITE_HOST_IP || "127.0.0.1";
  const webappHttpPort = parseInt(env.VITE_WEBAPP_HTTP_PORT || "5173", 10);
  const sslDomains = (env.VITE_SSL_DOMAINS || "localhost")
    .split(",")
    .map((d) => d.trim())
    .filter(Boolean);
  const aptosHttpPort = env.VITE_APTOS_HTTP_PORT || "8080";
  const ethHttpPort = env.VITE_ETHEREUM_HTTP_PORT || "8545";

  // Build DEFAULT_CHAIN_CONFIG from env vars (import.meta.env not available in Node context)
  const defaultChainConfig: ChainConfig = {
    ethereum: {
      rpcUrl:
        env.VITE_ETH_RPC_URL ||
        process.env.VITE_ETH_RPC_URL ||
        `http://${env.VITE_HOST_IP || "localhost"}:${env.VITE_ETHEREUM_HTTP_PORT || "8545"}`,
      fakeETH:
        env.VITE_FAKE_ETH_ADDRESS ||
        process.env.VITE_FAKE_ETH_ADDRESS ||
        "0x0000000000000000000000000000000000000000",
      fakeUSD:
        env.VITE_FAKE_USD_ADDRESS ||
        process.env.VITE_FAKE_USD_ADDRESS ||
        "0x0000000000000000000000000000000000000000",
      lockBox:
        env.VITE_LOCK_BOX_ADDRESS ||
        process.env.VITE_LOCK_BOX_ADDRESS ||
        "0x0000000000000000000000000000000000000000",
    },
    aptos: {
      contractAddress:
        env.VITE_CONTRACT_ADDRESS ||
        process.env.VITE_CONTRACT_ADDRESS ||
        "0x0000000000000000000000000000000000000000000000000000000000000000",
    },
  };
  const CHAIN_CONFIG = defaultChainConfig;

  return {
    envDir: "../", // load source/.env.test (and source/.env) for all packages
    define: {
      __ATOMICA_CHAIN_CONFIG__: JSON.stringify(CHAIN_CONFIG),
    },
    plugins: [
      basicSsl({ domains: sslDomains }),
      react(),
      {
        name: "remote-console-logs",
        configureServer(server) {
          server.middlewares.use("/__log", (req, res, next) => {
            if (req.method === "POST") {
              let body = "";
              req.on("data", (chunk) => (body += chunk));
              req.on("end", () => {
                try {
                  const entry = JSON.parse(body);

                  let source = "";
                  if (entry.source?.file) {
                    const fname = entry.source.file.split("/").pop();
                    source = `\x1b[90m${fname}:${entry.source.line}\x1b[0m`;
                  }

                  // Join message parts
                  const msg = Array.isArray(entry.message)
                    ? entry.message.join(" ")
                    : String(entry.message);

                  // Construct log message
                  const logMessage = `\x1b[90m(client)\x1b[0m ${source} ${msg}`;

                  // Use Vite's built-in logger
                  if (entry.level === "error") {
                    server.config.logger.error(logMessage, { timestamp: true });
                  } else if (entry.level === "warn") {
                    server.config.logger.warn(logMessage, { timestamp: true });
                  } else {
                    server.config.logger.info(logMessage, { timestamp: true });
                  }
                } catch (e) {
                  server.config.logger.error(
                    `Failed to parse remote log: ${e}`,
                    { timestamp: true },
                  );
                }
                res.statusCode = 200;
                res.end();
              });
            } else {
              next();
            }
          });
        },
      },
      {
        name: "aptos-funding-api",
        configureServer(server) {
          registerAptosFundingApi(server.middlewares, server.config.logger);
        },
      },
      {
        name: "ethereum-funding-api",
        configureServer(server) {
          registerEthereumFundingApi(
            server.middlewares,
            server.config.logger,
            CHAIN_CONFIG,
          );
        },
      },
    ],
    server: {
      port: webappHttpPort,
      strictPort: false,
      https: {},
      host: true,
      hmr: {
        host: "localhost",
        overlay: true,
      },
      proxy: {
        // Proxy /aptos-api/* → http://<host>:<VITE_APTOS_HTTP_PORT>
        "/aptos-api": {
          target: `http://${hostIp}:${aptosHttpPort}`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/aptos-api/, ""),
        },
        // Proxy /eth-api/* → http://<host>:<VITE_ETHEREUM_HTTP_PORT>
        "/eth-api": {
          target: `http://${hostIp}:${ethHttpPort}`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/eth-api/, ""),
        },
      },
    },
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
