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
import { ethers } from "ethers";
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
// SCOUT(#239) EDIT: repoint to @atomica/aptos-docker-testnet; the script also imports ../tests/meta/ethereum/solidity-compiler.js and ../test-utils/localnet, which do not exist.
import { DockerTestnet } from "@atomica/docker-testnet";
import {
  compileContracts,
  getFakeETHArtifact,
  getFakeUSDArtifact,
  getLockBoxArtifact,
  deployWithRetry,
} from "../tests/meta/ethereum/solidity-compiler.js";
import { DEPLOYER_ADDR, DEPLOYER_PK } from "../test-utils/localnet";

/**
 * SIWE domain pinned in eth_proof: the host (with port) the webapp is served
 * on. Receipts belong to the Ethereum-derivable account of this domain.
 */
function siweDomain(): string {
  return (
    process.env.ATOMICA_SIWE_DOMAIN?.trim() ||
    `localhost:${process.env.VITE_WEBAPP_HTTP_PORT ?? "5173"}`
  );
}

/**
 * LockBox constructor inputs. LockBox releases a lock only on an Aptos
 * AuctionOutcome proven by the Aptos light client, or by reclaim after its
 * deadline. LIGHT_CLIENT is the AptosLightClient address
 * (evm-contracts/script/DeployAptosLightClient.s.sol). Unset: a stand-in
 * address, so outcomes cannot be recorded and every lock goes home by reclaim.
 */
const LIGHT_CLIENT =
  process.env.LIGHT_CLIENT?.trim() ||
  "0x000000000000000000000000000000000000dEaD";

/** BCS TypeTag of `<atomica>::auction::AuctionOutcome`. */
function auctionOutcomeTypeTag(atomicaAddress: string): string {
  const name = (s: string) =>
    ethers.concat([new Uint8Array([s.length]), ethers.toUtf8Bytes(s)]);
  return ethers.hexlify(
    ethers.concat([
      new Uint8Array([7]),
      ethers.zeroPadValue(atomicaAddress, 32),
      name("auction"),
      name("AuctionOutcome"),
      new Uint8Array([0]),
    ]),
  );
}

const NUM_ETH_VALIDATORS = 4;
const NUM_APTOS_VALIDATORS = 4;

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
    await deployAptosContracts(aptosTestnet, ethAddresses);

    process.env.VITE_ETH_RPC_URL = ethAddresses.rpcUrl;
    process.env.VITE_FAKE_ETH_ADDRESS = ethAddresses.fakeETH;
    process.env.VITE_FAKE_USD_ADDRESS = ethAddresses.fakeUSD;
    process.env.VITE_LOCK_BOX_ADDRESS = ethAddresses.lockBox;
    process.env.VITE_CONTRACT_ADDRESS = DEPLOYER_ADDR;
    console.log("  ✓ Chain config set in environment");

    console.log("\n🌐 Starting webapp...");
    await launchWebapp();

    console.log("\n" + "═".repeat(60));
    console.log("  ✅ Demo Ready!");
    console.log("═".repeat(60));
    const webappPort = process.env.VITE_WEBAPP_HTTP_PORT ?? "5173";
    console.log(`\n📍 Open https://localhost:${webappPort}\n`);
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
  // NonceManager: back-to-back deploys must not reuse a nonce.
  const signer = new ethers.NonceManager(
    new ethers.Wallet(testAccounts[0].privateKey, provider),
  );

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
    // No relayer: outcomes are proven through the Aptos light client.
    [
      fakeETHAddress,
      fakeUSDAddress,
      LIGHT_CLIENT,
      auctionOutcomeTypeTag(DEPLOYER_ADDR),
    ],
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

async function deployAptosContracts(
  testnet: DockerTestnet,
  eth: { lockBox: string; fakeETH: string; fakeUSD: string },
) {
  const contractsDir = process.cwd() + "/../atomica-move-contracts";

  await testnet.deployContracts({
    contractsDir,
    deployerPrivateKey: DEPLOYER_PK,
    deployerAddress: DEPLOYER_ADDR,
    namedAddresses: { atomica: DEPLOYER_ADDR },
    initFunctions: [
      // SCOUT(#238) REMOVE: the registry::initialize init function.
      {
        functionId: `${DEPLOYER_ADDR}::registry::initialize`,
        args: [
          "hex:0000000000000000000000000000000000000000000000000000000000000000",
        ],
      },
      { functionId: `${DEPLOYER_ADDR}::fake_eth::initialize`, args: [] },
      { functionId: `${DEPLOYER_ADDR}::fake_usd::initialize`, args: [] },
      // Pin the LockBox, the token behind each asset (issue 171) and the SIWE
      // domain of receipt owners (issue 197): the host the webapp is served on.
      {
        functionId: `${DEPLOYER_ADDR}::eth_proof::initialize`,
        args: [
          ...[eth.lockBox, eth.fakeETH, eth.fakeUSD].map(
            (addr) => `hex:${addr.slice(2)}`,
          ),
          `hex:${Buffer.from(siweDomain(), "utf8").toString("hex")}`,
        ],
      },
    ],
    fundAmount: 10_000_000_000n,
  });

  console.log(`  ✓ Aptos contracts deployed`);
}

async function launchWebapp(): Promise<void> {
  return new Promise((resolve, reject) => {
    webappProcess = spawn("bun", ["run", "dev"], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    const timeout = setTimeout(
      () => reject(new Error("Webapp startup timeout")),
      30000,
    );

    webappProcess.stdout?.on("data", (data: Buffer) => {
      const output = data.toString();
      process.stdout.write(`  [webapp] ${output}`);
      if (output.includes("Local:") || output.includes("localhost:")) {
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
