/**
 * Dual Testnet Demo
 *
 * Starts both Ethereum and Aptos testnets, deploys contracts, and launches the webapp.
 * This is a convenience script for running the full demo locally.
 *
 * For more control, run separately:
 *   Terminal 1: bun run testnet   (starts testnets)
 *   Terminal 2: bun run deploy   (deploys contracts)
 *   Terminal 3: bun run dev      (starts webapp)
 */

import { spawn, ChildProcess } from "child_process";
import { writeFileSync } from "fs";
import { join } from "path";
import { ethers } from "ethers";
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { DockerTestnet } from "@atomica/docker-testnet";
import {
  compileContracts,
  getFakeETHArtifact,
  getFakeUSDArtifact,
  getLockBoxArtifact,
  deployWithRetry,
} from "../tests/meta/ethereum/solidity-compiler.js";
import { DEPLOYER_ADDR, DEPLOYER_PK } from "../test-utils/localnet";

const NUM_ETH_VALIDATORS = 4;
const NUM_APTOS_VALIDATORS = 4;
const WEBAPP_PORT = 4173;

let ethTestnet: EthereumDockerTestnet | null = null;
let aptosTestnet: DockerTestnet | null = null;
let webappProcess: ChildProcess | null = null;

async function main() {
  console.log("═".repeat(60));
  console.log("  Atomica Demo");
  console.log("  Ethereum + Aptos Testnets + Webapp");
  console.log("═".repeat(60));

  try {
    console.log("\n🚀 Starting testnets...");
    console.log(`  - Ethereum: ${NUM_ETH_VALIDATORS} validators`);
    console.log(`  - Aptos: ${NUM_APTOS_VALIDATORS} validators`);

    [ethTestnet, aptosTestnet] = await Promise.all([
      EthereumDockerTestnet.start(NUM_ETH_VALIDATORS),
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

    console.log("\n📦 Deploying contracts...");

    const ethAddresses = await deployEthereumContracts(ethTestnet);
    await deployAptosContracts(aptosTestnet);

    writeEnvLocal(ethAddresses);

    console.log("\n🌐 Starting webapp...");
    await launchWebapp();

    console.log("\n" + "═".repeat(60));
    console.log("  ✅ Demo Ready!");
    console.log("═".repeat(60));
    console.log(`\n📍 Open http://localhost:${WEBAPP_PORT}\n`);
    console.log("🛑 Press Ctrl+C to stop all services\n");

    await new Promise(() => {});
  } catch (error) {
    console.error("\n❌ Error:", error);
    await cleanup();
    process.exit(1);
  }
}

async function deployEthereumContracts(testnet: EthereumDockerTestnet) {
  const rpcUrl = testnet.getExecutionRpcUrl();
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const testAccounts = testnet.getTestAccounts();
  const signer = new ethers.Wallet(testAccounts[0].privateKey, provider);

  console.log(`  Ethereum RPC: ${rpcUrl}`);
  console.log(`  Deployer: ${await signer.getAddress()}`);

  await compileContracts();

  const fakeETH = await deployWithRetry(
    new ethers.ContractFactory(
      getFakeETHArtifact().abi,
      getFakeETHArtifact().bytecode.object,
      signer,
    ),
    signer,
  );
  const fakeETHAddress = await fakeETH.getAddress();
  console.log(`  ✓ FakeETH: ${fakeETHAddress}`);

  const fakeUSD = await deployWithRetry(
    new ethers.ContractFactory(
      getFakeUSDArtifact().abi,
      getFakeUSDArtifact().bytecode.object,
      signer,
    ),
    signer,
  );
  const fakeUSDAddress = await fakeUSD.getAddress();
  console.log(`  ✓ FakeUSD: ${fakeUSDAddress}`);

  const lockBox = await deployWithRetry(
    new ethers.ContractFactory(
      getLockBoxArtifact().abi,
      getLockBoxArtifact().bytecode.object,
      signer,
    ),
    signer,
    [fakeETHAddress, fakeUSDAddress],
  );
  const lockBoxAddress = await lockBox.getAddress();
  console.log(`  ✓ LockBox: ${lockBoxAddress}`);

  return {
    rpcUrl,
    fakeETH: fakeETHAddress,
    fakeUSD: fakeUSDAddress,
    lockBox: lockBoxAddress,
  };
}

async function deployAptosContracts(testnet: DockerTestnet) {
  const contractsDir = process.cwd() + "/../atomica-move-contracts";

  await testnet.deployContracts({
    contractsDir,
    deployerPrivateKey: DEPLOYER_PK,
    deployerAddress: DEPLOYER_ADDR,
    namedAddresses: { atomica: DEPLOYER_ADDR },
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

  console.log(`  ✓ Aptos contracts deployed`);
}

function writeEnvLocal(addresses: {
  rpcUrl: string;
  fakeETH: string;
  fakeUSD: string;
  lockBox: string;
}) {
  const envLocal = [
    `VITE_ETH_RPC_URL=${addresses.rpcUrl}`,
    `VITE_FAKE_ETH_ADDRESS=${addresses.fakeETH}`,
    `VITE_FAKE_USD_ADDRESS=${addresses.fakeUSD}`,
    `VITE_LOCK_BOX_ADDRESS=${addresses.lockBox}`,
  ].join("\n");
  writeFileSync(join(process.cwd(), ".env.local"), envLocal);
  console.log("  ✓ Written to .env.local");
}

async function launchWebapp(): Promise<void> {
  return new Promise((resolve, reject) => {
    webappProcess = spawn(
      "bun",
      ["run", "dev", "--port", String(WEBAPP_PORT)],
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
    );

    const timeout = setTimeout(
      () => reject(new Error("Webapp startup timeout")),
      30000,
    );

    webappProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      process.stdout.write(`  [webapp] ${output}`);
      if (
        output.includes("Local:") ||
        output.includes(`localhost:${WEBAPP_PORT}`)
      ) {
        clearTimeout(timeout);
        resolve();
      }
    });

    webappProcess.stderr?.on("data", (data: Buffer) => {
      process.stderr.write(`  [webapp] ${data.toString()}`);
    });

    webappProcess.on("error", (error) => {
      clearTimeout(timeout);
      reject(new Error(`Failed to start webapp: ${error.message}`));
    });
  });
}

async function cleanup(): Promise<void> {
  console.log("\n🧹 Cleaning up...");

  if (webappProcess && !webappProcess.killed) {
    webappProcess.kill("SIGTERM");
  }

  const promises: Promise<void>[] = [];

  if (ethTestnet) {
    promises.push(ethTestnet.teardown().catch(() => {}));
  }
  if (aptosTestnet) {
    promises.push(aptosTestnet.teardown().catch(() => {}));
  }

  await Promise.all(promises);
  console.log("✅ Done");
}

process.on("SIGINT", async () => {
  console.log("\n⚠️  Shutting down...");
  await cleanup();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await cleanup();
  process.exit(0);
});

main().catch(async (error) => {
  console.error("Fatal error:", error);
  await cleanup();
  process.exit(1);
});
