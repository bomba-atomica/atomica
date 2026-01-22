/**
 * Deploy script for EVM contracts
 *
 * Usage: bun run src/deploy.ts [--network <url>]
 */
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { spawn } from "child_process";
import { resolve as pathResolve } from "path";

const CONTRACTS_DIR = pathResolve(import.meta.dir, "../src");

interface DeployConfig {
  rpcUrl: string;
  privateKey: string;
  gasPrice?: bigint;
}

async function deploy(config: DeployConfig): Promise<void> {
  console.log("Deploying Atomica EVM contracts...");

  const env = {
    ...process.env,
    ETH_RPC_URL: config.rpcUrl,
    ETH_PRIVATE_KEY: config.privateKey,
    FOUNDRY_PROFILE: "test",
  };

  if (config.gasPrice) {
    env.ETH_GAS_PRICE = config.gasPrice.toString();
  }

  // Run deployment
  await runCommand("forge", ["script", "script/Deploy.s.sol", "--rpc-url", config.rpcUrl, "--broadcast"], {
    cwd: CONTRACTS_DIR,
    env,
  });

  console.log("✓ Deployment complete!");
  console.log(`\nDeployed contracts:`);
  await printDeployedAddresses(config.rpcUrl);
}

async function printDeployedAddresses(rpcUrl: string): Promise<void> {
  const deploymentsPath = pathResolve(CONTRACTS_DIR, "broadcast/Deploy.s.sol/latest/run-latest.json");

  try {
    const data = JSON.parse(await Bun.file(deploymentsPath).text());
    const addresses: string[] = [];

    for (const tx of data.transactions || []) {
      if (tx.contractName && tx.contractAddress && !addresses.includes(tx.contractName)) {
        console.log(`  - ${tx.contractName}: ${tx.contractAddress}`);
        addresses.push(tx.contractName);
      }
    }
  } catch {
    console.log("  (Could not read deployment info)");
  }
}

async function runCommand(command: string, args: string[], options: { cwd?: string; env?: Record<string, string> } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: "inherit",
    });

    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} failed with code ${code}`));
    });

    proc.on("error", reject);
  });
}

// CLI
if (import.meta.main) {
  const { values, positionals } = Bun.parseArgs({
    args: process.argv.slice(2),
    options: {
      network: { type: "string", default: "http://localhost:8545" },
      key: { type: "string" },
    },
    strict: true,
  });

  let rpcUrl = values.network;
  let privateKey = values.key;

  // If no key provided, try to get from environment or use test account
  if (!privateKey) {
    privateKey = process.env.ETH_PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"; // Anvil default
  }

  // If using localhost, try to start testnet
  if (rpcUrl === "http://localhost:8545") {
    console.log("Starting Docker testnet...");
    const testnet = await EthereumDockerTestnet.start(4);
    await testnet.waitForHealthy(120);
    rpcUrl = testnet.getExecutionRpcUrl();
    console.log(`✓ Testnet started at ${rpcUrl}`);
  }

  await deploy({ rpcUrl, privateKey });
}

export { deploy };
