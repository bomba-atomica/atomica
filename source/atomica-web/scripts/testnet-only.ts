/**
 * Testnet-Only Orchestrator
 *
 * Starts both Ethereum and Aptos testnets and keeps them running — without
 * deploying contracts or launching the web interface.
 *
 * Use this when hosting the testnets on a remote machine while developing the
 * web UI on a separate laptop. After startup, connect the web UI by entering
 * this machine's IP address in the testnet selector.
 *
 * For contract deployment, run separately: bun run deploy
 */

import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { DockerTestnet } from "@atomica/docker-testnet";

const NUM_ETH_VALIDATORS = 4;
const NUM_APTOS_VALIDATORS = 4;
const ETHEREUM_TESTNET_CONFIG_DIR = new URL("../../docker-testnet/ethereum-testnet/config", import.meta.url).pathname;

let ethTestnet: EthereumDockerTestnet | null = null;
let aptosTestnet: DockerTestnet | null = null;

async function main() {
  console.log("═".repeat(60));
  console.log("  Atomica Testnet Orchestrator (no web UI)");
  console.log("  Ethereum + Aptos Testnets");
  console.log("═".repeat(60));

  try {
    console.log("\n🚀 Starting both testnets in parallel...");
    console.log(
      `  - Ethereum: ${NUM_ETH_VALIDATORS} validators (Geth + Lighthouse)`,
    );
    console.log(`  - Aptos: ${NUM_APTOS_VALIDATORS} validators`);

    [ethTestnet, aptosTestnet] = await Promise.all([
      EthereumDockerTestnet.start(NUM_ETH_VALIDATORS, ETHEREUM_TESTNET_CONFIG_DIR),
      DockerTestnet.new(NUM_APTOS_VALIDATORS),
    ]);

    if (!ethTestnet || !aptosTestnet) {
      throw new Error("Failed to initialize testnets");
    }

    console.log("\n⏳ Waiting for networks to be healthy...");
    await Promise.all([
      ethTestnet.waitForHealthy(180),
      aptosTestnet.waitForBlocks(1, 120),
    ]);

    console.log("\n✅ Both testnets are healthy!");

    printConnectionInfo(ethTestnet, aptosTestnet);

    // Keep the process alive - wait on an unresolved promise
    // This keeps the event loop running until signal handlers terminate
    await new Promise(() => {
      // Never resolves - the promise stays pending
      // Signal handlers (SIGINT/SIGTERM) registered in registerCleanupHandlers()
      // will handle cleanup and process.exit()
    });
  } catch (error) {
    console.error("\n❌ Error during orchestration:", error);
    await cleanup();
    process.exit(1);
  }
}

function printConnectionInfo(
  eth: EthereumDockerTestnet,
  aptos: DockerTestnet,
): void {
  console.log("\n" + "═".repeat(60));
  console.log("  🎉 Testnets Ready — No Web UI Running");
  console.log("═".repeat(60));
  console.log("\n📡 Testnet Endpoints:");
  console.log(`   Ethereum RPC   : ${eth.getExecutionRpcUrl()}`);
  console.log(
    `   Ethereum WS    : ${eth.getExecutionRpcUrl().replace("http", "ws").replace("8545", "8546")}`,
  );
  console.log(`   Ethereum Beacon: ${eth.getBeaconApiUrl()}`);
  console.log(`   Aptos API      : ${aptos.validatorApiUrl(0)}`);
  console.log("\n💡 To deploy contracts, run: bun run deploy");
  console.log("\n💡 To connect the web UI from another machine:");
  console.log("   1. Run `bun run dev` on your laptop");
  console.log(
    "   2. Open the app and click the network selector in the header",
  );
  console.log("   3. Enter this machine's IP address");
  console.log("   4. After deploying contracts, enter the contract addresses");
  console.log("\n🛑 Press Ctrl+C to stop all services\n");
}

async function cleanup(): Promise<void> {
  console.log("\n🧹 Cleaning up...");

  const cleanupPromises: Promise<void>[] = [];

  if (ethTestnet) {
    console.log("  Tearing down Ethereum testnet...");
    cleanupPromises.push(
      ethTestnet.teardown().catch((err: unknown) => {
        console.error("  Error tearing down Ethereum testnet:", err);
      }),
    );
  }

  if (aptosTestnet) {
    console.log("  Tearing down Aptos testnet...");
    cleanupPromises.push(
      aptosTestnet.teardown().catch((err: unknown) => {
        console.error("  Error tearing down Aptos testnet:", err);
      }),
    );
  }

  await Promise.all(cleanupPromises);
  console.log("✅ Cleanup complete");
}

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

registerCleanupHandlers();

// Keep the process alive by awaiting main
await main().catch(async (error) => {
  console.error("Fatal error:", error);
  await cleanup();
  process.exit(1);
});
