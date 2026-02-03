/**
 * Dual Testnet Orchestrator
 *
 * Starts both Ethereum and Aptos testnets, deploys contracts, and launches the webapp
 */

import { spawn, ChildProcess } from "child_process";
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { DockerTestnet } from "@atomica/docker-testnet";

// Configuration
const DEPLOYER_ADDR =
  "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";
const WEBAPP_PORT = 4173;
const NUM_ETH_VALIDATORS = 4;
const NUM_APTOS_VALIDATORS = 4;

// Global state
let ethTestnet: EthereumDockerTestnet | null = null;
let aptosTestnet: DockerTestnet | null = null;
let webappProcess: ChildProcess | null = null;

/**
 * Main orchestrator function
 */
async function main() {
  console.log("═".repeat(60));
  console.log("  Atomica Dual Testnet Orchestrator");
  console.log("  Ethereum + Aptos Testnets");
  console.log("═".repeat(60));

  try {
    // Step 1: Kill any zombie processes on webapp port
    console.log("\n🔍 Checking for zombie processes...");
    await killPortProcesses(WEBAPP_PORT);

    // Step 2: Start both testnets in parallel
    console.log("\n🚀 Starting both testnets in parallel...");
    console.log(
      `  - Ethereum: ${NUM_ETH_VALIDATORS} validators (Geth + Lighthouse)`
    );
    console.log(`  - Aptos: ${NUM_APTOS_VALIDATORS} validators`);

    [ethTestnet, aptosTestnet] = await Promise.all([
      EthereumDockerTestnet.start(NUM_ETH_VALIDATORS),
      DockerTestnet.new(NUM_APTOS_VALIDATORS),
    ]);

    console.log("\n⏳ Waiting for networks to be healthy...");

    await Promise.all([
      ethTestnet.waitForHealthy(180),
      aptosTestnet.waitForBlocks(1, 120),
    ]);

    console.log("\n✅ Both testnets are healthy!");
    console.log(`  - Ethereum RPC: ${ethTestnet.getExecutionRpcUrl()}`);
    console.log(`  - Ethereum Beacon: ${ethTestnet.getBeaconApiUrl()}`);
    console.log(`  - Aptos API: ${aptosTestnet.validatorApiUrl(0)}`);

    // Step 3: Deploy contracts to Ethereum
    console.log("\n📦 Deploying ERC20 contracts to Ethereum...");
    await deployEthereumContracts(ethTestnet);

    // Step 4: Deploy contracts to Aptos
    console.log("\n📦 Deploying Move contracts to Aptos...");
    await deployAptosContracts(aptosTestnet);

    // Step 5: Launch webapp
    console.log("\n🌐 Launching webapp...");
    await launchWebapp();

    console.log("\n" + "═".repeat(60));
    console.log("  🎉 Dual Testnet Demo Ready!");
    console.log("═".repeat(60));
    console.log("\n📍 Access the demo at:");
    console.log(`   http://localhost:${WEBAPP_PORT}\n`);
    console.log("🛑 Press Ctrl+C to stop all services\n");

    // Keep process alive
    await new Promise(() => {
      /* Never resolves */
    });
  } catch (error) {
    console.error("\n❌ Error during orchestration:", error);
    await cleanup();
    process.exit(1);
  }
}

/**
 * Deploy ERC20 contracts to Ethereum testnet
 */
async function deployEthereumContracts(
  testnet: EthereumDockerTestnet
): Promise<void> {
  // Get test account for deployment
  const testAccounts = testnet.getTestAccounts();
  const deployer = testAccounts[0];

  console.log(`  Deployer: ${deployer.address}`);

  // TODO: Use Foundry to deploy FakeETH and FakeUSD
  // For now, just log placeholder
  console.log("  ⚠️  TODO: Deploy FakeETH and FakeUSD via Foundry");
  console.log("  📝 Contracts will be deployed in next phase");

  // Simulate deployment delay
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("  ✅ Ethereum contracts deployment complete (placeholder)");
}

/**
 * Deploy Move contracts to Aptos testnet
 */
async function deployAptosContracts(testnet: DockerTestnet): Promise<void> {
  const contractsDir =
    process.cwd() + "/../atomica-move-contracts"; /* Adjust path as needed */
  const deployerPrivateKey =
    "0x0000000000000000000000000000000000000000000000000000000000000001";

  console.log(`  Deployer: ${DEPLOYER_ADDR}`);
  console.log(`  Contracts: ${contractsDir}`);

  try {
    await testnet.deployContracts({
      contractsDir,
      deployerPrivateKey,
      namedAddresses: { atomica: "default" },
      initFunctions: [
        {
          functionId: `${DEPLOYER_ADDR}::registry::initialize`,
          args: [
            "hex:0000000000000000000000000000000000000000000000000000000000000000",
          ],
        },
        { functionId: `${DEPLOYER_ADDR}::fake_eth::initialize`, args: [] },
        { functionId: `${DEPLOYER_ADDR}::fake_usd::initialize`, args: [] },
      ],
      fundAmount: 10_000_000_000n,
    });

    console.log("  ✅ Aptos contracts deployed successfully");
  } catch (error) {
    console.error("  ❌ Failed to deploy Aptos contracts:", error);
    throw error;
  }
}

/**
 * Launch the webapp using Vite dev server
 */
async function launchWebapp(): Promise<void> {
  return new Promise((resolve, reject) => {
    webappProcess = spawn("bun", ["run", "dev", "--port", String(WEBAPP_PORT)], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    let startupTimeout: NodeJS.Timeout;

    webappProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      process.stdout.write(`  [webapp] ${output}`);

      // Detect successful startup
      if (output.includes("Local:") || output.includes(`localhost:${WEBAPP_PORT}`)) {
        clearTimeout(startupTimeout);
        resolve();
      }
    });

    webappProcess.stderr?.on("data", (data: Buffer) => {
      const output = data.toString();
      process.stderr.write(`  [webapp] ${output}`);
    });

    webappProcess.on("error", (error) => {
      clearTimeout(startupTimeout);
      reject(new Error(`Failed to start webapp: ${error.message}`));
    });

    webappProcess.on("exit", (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Webapp exited with code ${code}`));
      }
    });

    // Timeout if webapp doesn't start in 30 seconds
    startupTimeout = setTimeout(() => {
      reject(new Error("Webapp startup timeout (30s)"));
    }, 30000);
  });
}

/**
 * Kill processes using the specified port
 */
async function killPortProcesses(port: number): Promise<void> {
  return new Promise((resolve) => {
    const lsofProcess = spawn("lsof", ["-ti", `:${port}`]);
    let pids = "";

    lsofProcess.stdout.on("data", (data: Buffer) => {
      pids += data.toString();
    });

    lsofProcess.on("close", (code) => {
      if (code === 0 && pids.trim()) {
        const pidList = pids.trim().split("\n");
        console.log(`  Found zombie processes on port ${port}: ${pidList.join(", ")}`);

        pidList.forEach((pid) => {
          try {
            process.kill(parseInt(pid), "SIGKILL");
            console.log(`  Killed process ${pid}`);
          } catch {
            // Process may have already exited
          }
        });
      } else {
        console.log(`  No processes found on port ${port}`);
      }

      resolve();
    });

    lsofProcess.on("error", () => {
      // lsof command not found or failed - just continue
      resolve();
    });
  });
}

/**
 * Clean up all resources
 */
async function cleanup(): Promise<void> {
  console.log("\n🧹 Cleaning up...");

  const cleanupPromises: Promise<void>[] = [];

  // Stop webapp
  if (webappProcess && !webappProcess.killed) {
    console.log("  Stopping webapp...");
    webappProcess.kill("SIGTERM");
    webappProcess = null;
  }

  // Teardown testnets in parallel
  if (ethTestnet) {
    console.log("  Tearing down Ethereum testnet...");
    cleanupPromises.push(
      ethTestnet.teardown().catch((err) => {
        console.error("  Error tearing down Ethereum testnet:", err);
      })
    );
  }

  if (aptosTestnet) {
    console.log("  Tearing down Aptos testnet...");
    cleanupPromises.push(
      aptosTestnet.teardown().catch((err) => {
        console.error("  Error tearing down Aptos testnet:", err);
      })
    );
  }

  await Promise.all(cleanupPromises);

  console.log("✅ Cleanup complete");
}

/**
 * Register cleanup handlers
 */
function registerCleanupHandlers() {
  process.on("SIGINT", async () => {
    console.log("\n\n⚠️  Received SIGINT (Ctrl+C)");
    await cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.log("\n\n⚠️  Received SIGTERM");
    await cleanup();
    process.exit(0);
  });

  process.on("beforeExit", async () => {
    await cleanup();
  });

  process.on("uncaughtException", async (error) => {
    console.error("\n❌ Uncaught exception:", error);
    await cleanup();
    process.exit(1);
  });

  process.on("unhandledRejection", async (reason) => {
    console.error("\n❌ Unhandled rejection:", reason);
    await cleanup();
    process.exit(1);
  });
}

// Register cleanup handlers and start
registerCleanupHandlers();
main().catch(async (error) => {
  console.error("Fatal error:", error);
  await cleanup();
  process.exit(1);
});
