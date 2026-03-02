/**
 * Testnet-Only Orchestrator
 *
 * Starts both Ethereum and Aptos testnets, deploys contracts, and keeps them
 * running — without launching the web interface.
 *
 * Use this when hosting the testnets on a remote machine while developing the
 * web UI on a separate laptop. After startup, connect the web UI by entering
 * this machine's IP address in the testnet selector.
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { ethers } from "ethers";
import type { EthereumDockerTestnet } from "../../docker-testnet/ethereum-testnet/typescript-sdk/dist/index.js";
import type { DockerTestnet } from "../../docker-testnet/typescript-sdk/dist/index.js";
import {
  compileContracts,
  getFakeETHArtifact,
  getFakeUSDArtifact,
  getLockBoxArtifact,
  deployWithRetry,
} from "../tests/meta/ethereum/solidity-compiler.js";

// Dynamic imports to avoid module resolution issues
const { EthereumDockerTestnet: EthTestnet } =
  await import("../../docker-testnet/ethereum-testnet/typescript-sdk/dist/index.js");
const { DockerTestnet: AptosTestnet } =
  await import("../../docker-testnet/typescript-sdk/dist/index.js");

// Configuration
const DEPLOYER_ADDR =
  "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";
const NUM_ETH_VALIDATORS = 4;
const NUM_APTOS_VALIDATORS = 4;

// Global state
let ethTestnet: EthereumDockerTestnet | null = null;
let aptosTestnet: DockerTestnet | null = null;

/**
 * Main orchestrator function
 */
async function main() {
  console.log("═".repeat(60));
  console.log("  Atomica Testnet Orchestrator (no web UI)");
  console.log("  Ethereum + Aptos Testnets");
  console.log("═".repeat(60));

  try {
    // Step 1: Start both testnets in parallel
    console.log("\n🚀 Starting both testnets in parallel...");
    console.log(
      `  - Ethereum: ${NUM_ETH_VALIDATORS} validators (Geth + Lighthouse)`,
    );
    console.log(`  - Aptos: ${NUM_APTOS_VALIDATORS} validators`);

    [ethTestnet, aptosTestnet] = await Promise.all([
      EthTestnet.start(NUM_ETH_VALIDATORS),
      AptosTestnet.new(NUM_APTOS_VALIDATORS),
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

    // Step 2: Deploy contracts to Ethereum
    console.log("\n📦 Deploying ERC20 contracts to Ethereum...");
    const contractAddresses = await deployEthereumContracts(ethTestnet);

    // Step 3: Deploy contracts to Aptos
    console.log("\n📦 Deploying Move contracts to Aptos...");
    await deployAptosContracts(aptosTestnet);

    // Step 4: Print connection summary
    printConnectionInfo(ethTestnet, aptosTestnet, contractAddresses);

    // Keep process alive
    await new Promise(() => {
      /* Never resolves — run until Ctrl+C */
    });
  } catch (error) {
    console.error("\n❌ Error during orchestration:", error);
    await cleanup();
    process.exit(1);
  }
}

interface ContractAddresses {
  fakeETH: string;
  fakeUSD: string;
  lockBox: string;
}

/**
 * Deploy ERC20 contracts to Ethereum testnet.
 */
async function deployEthereumContracts(
  testnet: EthereumDockerTestnet,
): Promise<ContractAddresses> {
  const rpcUrl = testnet.getExecutionRpcUrl();
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const testAccounts = testnet.getTestAccounts();
  const signer = new ethers.Wallet(testAccounts[0].privateKey, provider);

  console.log(`  Deployer: ${signer.address}`);
  console.log(`  RPC: ${rpcUrl}`);

  await compileContracts();

  console.log("  Deploying FakeETH...");
  const fakeETHContract = await deployWithRetry(
    new ethers.ContractFactory(
      getFakeETHArtifact().abi,
      getFakeETHArtifact().bytecode.object,
      signer,
    ),
    signer,
  );
  const fakeETHAddress = await fakeETHContract.getAddress();
  console.log(`  ✓ FakeETH deployed at: ${fakeETHAddress}`);

  console.log("  Deploying FakeUSD...");
  const fakeUSDContract = await deployWithRetry(
    new ethers.ContractFactory(
      getFakeUSDArtifact().abi,
      getFakeUSDArtifact().bytecode.object,
      signer,
    ),
    signer,
  );
  const fakeUSDAddress = await fakeUSDContract.getAddress();
  console.log(`  ✓ FakeUSD deployed at: ${fakeUSDAddress}`);

  console.log("  Deploying LockBox...");
  const lockBoxContract = await deployWithRetry(
    new ethers.ContractFactory(
      getLockBoxArtifact().abi,
      getLockBoxArtifact().bytecode.object,
      signer,
    ),
    signer,
    [fakeETHAddress, fakeUSDAddress],
  );
  const lockBoxAddress = await lockBoxContract.getAddress();
  console.log(`  ✓ LockBox deployed at: ${lockBoxAddress}`);

  // Write .env.local so a local dev server on this machine picks up addresses
  const envLocal = [
    `VITE_ETH_RPC_URL=${rpcUrl}`,
    `VITE_FAKE_ETH_ADDRESS=${fakeETHAddress}`,
    `VITE_FAKE_USD_ADDRESS=${fakeUSDAddress}`,
    `VITE_LOCK_BOX_ADDRESS=${lockBoxAddress}`,
  ].join("\n");
  writeFileSync(join(process.cwd(), ".env.local"), envLocal);
  console.log("  ✓ Contract addresses written to .env.local");

  console.log("  ✅ Ethereum contracts deployed");
  return {
    fakeETH: fakeETHAddress,
    fakeUSD: fakeUSDAddress,
    lockBox: lockBoxAddress,
  };
}

/**
 * Deploy Move contracts to Aptos testnet
 */
async function deployAptosContracts(testnet: DockerTestnet): Promise<void> {
  const contractsDir = process.cwd() + "/../atomica-move-contracts";
  const deployerPrivateKey =
    "0x0000000000000000000000000000000000000000000000000000000000000001";

  console.log(`  Deployer: ${DEPLOYER_ADDR}`);

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
 * Print a clear connection summary so the developer knows what to enter in the
 * web UI's testnet selector.
 */
function printConnectionInfo(
  eth: EthereumDockerTestnet,
  aptos: DockerTestnet,
  contracts: ContractAddresses,
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
  console.log("\n📋 Deployed Contracts:");
  console.log(`   FakeETH  : ${contracts.fakeETH}`);
  console.log(`   FakeUSD  : ${contracts.fakeUSD}`);
  console.log(`   LockBox  : ${contracts.lockBox}`);
  console.log("\n💡 To connect the web UI from another machine:");
  console.log("   1. Run `bun run dev` on your laptop");
  console.log(
    "   2. Open the app and click the network selector in the header",
  );
  console.log("   3. Enter this machine's IP address");
  console.log(
    "   4. Copy the contract addresses above into the app if prompted",
  );
  console.log("\n🛑 Press Ctrl+C to stop all services\n");
}

/**
 * Clean up all resources
 */
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
main().catch(async (error) => {
  console.error("Fatal error:", error);
  await cleanup();
  process.exit(1);
});
