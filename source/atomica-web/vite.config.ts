import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";
import type { Connect, Logger } from "vite";
import { existsSync, readFileSync } from "node:fs";
import { resolve as pathResolve } from "node:path";
import { fundAptosAccount } from "./scripts/aptos-funding";
import { fundEthereumAccount } from "./scripts/ethereum-funding";
import { getDockerTestnetConfigDir } from "./test-utils/aptos-keys";
import type { ChainConfig } from "./src/lib/chain-config";

type JsonObject = Record<string, unknown>;

function sendJson(
  res: {
    statusCode: number;
    setHeader(name: string, value: string): void;
    end(chunk?: string): void;
  },
  statusCode: number,
  payload: JsonObject,
): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req: {
  on(event: "data", listener: (chunk: string) => void): void;
  on(event: "end", listener: () => void): void;
}): Promise<JsonObject> {
  return await new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      if (!body.trim()) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body) as JsonObject);
      } catch (error) {
        reject(error);
      }
    });
  });
}

function registerAptosFundingApi(
  middlewares: Connect.Server,
  logger: Logger,
): void {
  middlewares.use("/api/aptos/fund", async (req, res) => {
    if (req.method !== "POST") {
      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }
      sendJson(res, 405, { error: "Method not allowed. Use POST." });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const address =
        typeof body.address === "string" ? body.address : undefined;
      const amount = typeof body.amount === "number" ? body.amount : undefined;
      const host = typeof body.host === "string" ? body.host : undefined;

      if (!address) {
        sendJson(res, 400, { error: "`address` is required." });
        return;
      }

      const result = await fundAptosAccount({ address, amount, host });
      sendJson(res, 200, { success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[aptos-fund-api] ${message}`, { timestamp: true });
      sendJson(res, 500, { success: false, error: message });
    }
  });
}

function registerEthereumFundingApi(
  middlewares: Connect.Server,
  logger: Logger,
  chainConfig: ChainConfig,
): void {
  middlewares.use("/api/ethereum/fund", async (req, res) => {
    if (req.method !== "POST") {
      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }
      sendJson(res, 405, { error: "Method not allowed. Use POST." });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const recipientAddress =
        typeof body.recipientAddress === "string"
          ? body.recipientAddress
          : undefined;
      const host = typeof body.host === "string" ? body.host : undefined;

      if (!recipientAddress) {
        sendJson(res, 400, { error: "`recipientAddress` is required." });
        return;
      }

      const result = await fundEthereumAccount({
        recipientAddress,
        fakeETHAddress: chainConfig.ethereum.fakeETH,
        fakeUSDAddress: chainConfig.ethereum.fakeUSD,
        rpcUrl: chainConfig.ethereum.rpcUrl,
        host,
      });
      sendJson(res, 200, { success: true, ...result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[ethereum-fund-api] ${message}`, { timestamp: true });
      sendJson(res, 500, { success: false, error: message });
    }
  });
}

// https://vite.dev/config/
const CONFIG_FILE = pathResolve(
  getDockerTestnetConfigDir(),
  "atomica-web.yaml",
);

type ParsedChainConfig = {
  ethereum?: Partial<ChainConfig["ethereum"]>;
  aptos?: Partial<ChainConfig["aptos"]>;
};

function parseChainConfigYaml(content: string): ParsedChainConfig {
  const parsed: ParsedChainConfig = {};
  let currentSection: keyof ParsedChainConfig | null = null;

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = line.search(/\S|$/);

    if (indent === 0 && trimmed.endsWith(":")) {
      const sectionName = trimmed.slice(0, -1);
      if (sectionName === "ethereum") {
        currentSection = "ethereum";
        parsed.ethereum ??= {};
      } else if (sectionName === "aptos") {
        currentSection = "aptos";
        parsed.aptos ??= {};
      } else {
        currentSection = null;
      }
      continue;
    }

    if (currentSection && trimmed.includes(":")) {
      const [key, ...rest] = trimmed.split(":");
      const value = rest.join(":").trim();
      if (!value) continue;
      if (currentSection === "ethereum") {
        (parsed.ethereum as Record<string, string>)[key.trim()] = value;
      } else if (currentSection === "aptos") {
        (parsed.aptos as Record<string, string>)[key.trim()] = value;
      }
    }
  }

  return parsed;
}

function loadChainConfig(defaultConfig: ChainConfig): ChainConfig {
  if (!existsSync(CONFIG_FILE)) {
    return defaultConfig;
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf-8");
    const parsed = parseChainConfigYaml(raw);
    return {
      ethereum: {
        ...defaultConfig.ethereum,
        ...parsed.ethereum,
      },
      aptos: {
        ...defaultConfig.aptos,
        ...parsed.aptos,
      },
    };
  } catch (error) {
    console.warn("Failed to load chain config YAML:", error);
    return defaultConfig;
  }
}

export default defineConfig(({ mode }) => {
  // Load env variables from source/.env.test (envDir is "../")
  const env = loadEnv(mode, pathResolve(__dirname, ".."), "");

  const hostIp = env.VITE_HOST_IP || "127.0.0.1";
  const webappHttpPort = parseInt(env.VITE_WEBAPP_HTTP_PORT || "5173", 10);
  const aptosHttpPort = env.VITE_APTOS_HTTP_PORT || "8080";
  const ethHttpPort = env.VITE_ETHEREUM_HTTP_PORT || "8545";

  // Build DEFAULT_CHAIN_CONFIG from env vars (import.meta.env not available in Node context)
  const defaultChainConfig: ChainConfig = {
    ethereum: {
      rpcUrl:
        env.VITE_ETH_RPC_URL ||
        `http://${env.VITE_HOST_IP || "localhost"}:${env.VITE_ETHEREUM_HTTP_PORT || "8545"}`,
      fakeETH:
        env.VITE_FAKE_ETH_ADDRESS ||
        "0x0000000000000000000000000000000000000000",
      fakeUSD:
        env.VITE_FAKE_USD_ADDRESS ||
        "0x0000000000000000000000000000000000000000",
      lockBox:
        env.VITE_LOCK_BOX_ADDRESS ||
        "0x0000000000000000000000000000000000000000",
    },
    aptos: {
      contractAddress:
        env.VITE_CONTRACT_ADDRESS ||
        "0x0000000000000000000000000000000000000000000000000000000000000000",
    },
  };
  const CHAIN_CONFIG = loadChainConfig(defaultChainConfig);

  return {
    envDir: "../", // load source/.env.test (and source/.env) for all packages
    define: {
      __ATOMICA_CHAIN_CONFIG__: JSON.stringify(CHAIN_CONFIG),
    },
    plugins: [
      basicSsl(),
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
    // Enable source maps for better error messages
    build: {
      sourcemap: true,
    },
  };
});
