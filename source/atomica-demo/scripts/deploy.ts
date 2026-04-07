#!/usr/bin/env bun
/**
 * Contract Deployment Script
 *
 * Deploys smart contracts to already-running Ethereum and Aptos testnets.
 * Assumes testnets are already running (started via `bun run testnet`).
 *
 * Usage:
 *   bun run deploy                    # Uses localhost:8545 / localhost:8080
 *   ETH_RPC_URL=<url> bun run deploy  # Custom Ethereum URL
 *
 * Environment variables (required):
 *   ETHEREUM_DEPLOYER_PRIVATE_KEY  - Ethereum deployer private key
 *   APTOS_DEPLOYER_ADDRESS    - Aptos deployer account address
 *   APTOS_DEPLOYER_PRIVATE_KEY - Aptos deployer private key
 *
 * Environment variables (optional):
 *   ETH_RPC_URL  - Ethereum JSON-RPC endpoint (default: localhost:8545)
 *   APTOS_URL    - Aptos API endpoint (default: localhost:8080)
 */

import { spawn } from "child_process";
import { ethers } from "ethers";
import {
  compileContracts,
  getFakeETHArtifact,
  getFakeUSDArtifact,
  getLockBoxArtifact,
  deployWithRetry,
} from "../tests/meta/ethereum/solidity-compiler.js";

const ETH_RPC_URL = process.env.ETH_RPC_URL || "http://localhost:8545";
const APTOS_URL = process.env.APTOS_URL || "http://localhost:8080";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not set`);
  return value;
}

const ETHEREUM_DEPLOYER_PRIVATE_KEY = requireEnv(
  "ETHEREUM_DEPLOYER_PRIVATE_KEY",
);
const APTOS_DEPLOYER_ADDRESS = requireEnv("APTOS_DEPLOYER_ADDRESS");
const APTOS_DEPLOYER_PRIVATE_KEY = requireEnv("APTOS_DEPLOYER_PRIVATE_KEY");

function execCommand(
  bin: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";

    const proc = spawn(bin, args);

    proc.stdout?.on("data", (d) => {
      stdout += d.toString();
    });

    proc.stderr?.on("data", (d) => {
      stderr += d.toString();
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(
          new Error(
            `Command failed (exit ${code}): ${bin} ${args.join(" ")}\n${stderr}`,
          ),
        );
      }
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to execute ${bin}: ${err.message}`));
    });
  });
}

async function deployEthereumContracts() {
  console.log("\n📦 Deploying ERC20 contracts to Ethereum...");
  console.log(`  RPC: ${ETH_RPC_URL}`);

  const provider = new ethers.JsonRpcProvider(ETH_RPC_URL);

  const ethSigner = new ethers.Wallet(ETHEREUM_DEPLOYER_PRIVATE_KEY, provider);

  const deployerAddress = await ethSigner.getAddress();
  console.log(`  Deployer: ${deployerAddress}`);

  const balance = await provider.getBalance(deployerAddress);
  console.log(`  Balance: ${ethers.formatEther(balance)} ETH`);

  if (balance === 0n) {
    throw new Error(
      "Deployer account has no ETH. Please ensure testnet is running and funded.",
    );
  }

  await compileContracts();

  console.log("  Deploying FakeETH...");
  const fakeETHContract = await deployWithRetry(
    new ethers.ContractFactory(
      getFakeETHArtifact().abi,
      getFakeETHArtifact().bytecode.object,
      ethSigner,
    ),
    ethSigner,
  );
  const fakeETHAddress = await fakeETHContract.getAddress();
  console.log(`  ✓ FakeETH deployed at: ${fakeETHAddress}`);

  console.log("  Deploying FakeUSD...");
  const fakeUSDContract = await deployWithRetry(
    new ethers.ContractFactory(
      getFakeUSDArtifact().abi,
      getFakeUSDArtifact().bytecode.object,
      ethSigner,
    ),
    ethSigner,
  );
  const fakeUSDAddress = await fakeUSDContract.getAddress();
  console.log(`  ✓ FakeUSD deployed at: ${fakeUSDAddress}`);

  console.log("  Deploying LockBox...");
  const lockBoxContract = await deployWithRetry(
    new ethers.ContractFactory(
      getLockBoxArtifact().abi,
      getLockBoxArtifact().bytecode.object,
      ethSigner,
    ),
    ethSigner,
    [fakeETHAddress, fakeUSDAddress],
  );
  const lockBoxAddress = await lockBoxContract.getAddress();
  console.log(`  ✓ LockBox deployed at: ${lockBoxAddress}`);

  console.log("  ✅ Ethereum contracts deployed");

  return {
    fakeETH: fakeETHAddress,
    fakeUSD: fakeUSDAddress,
    lockBox: lockBoxAddress,
  };
}

async function deployAptosContracts() {
  console.log("\n📦 Deploying Move contracts to Aptos...");
  console.log(`  API: ${APTOS_URL}`);

  const contractsDir = process.cwd() + "/../atomica-move-contracts";

  // Publish contracts using host's aptos CLI
  console.log("  Publishing contracts...");
  const publishArgs = [
    "move",
    "publish",
    "--package-dir",
    contractsDir,
    "--named-addresses",
    `atomica=${APTOS_DEPLOYER_ADDRESS}`,
    "--private-key",
    APTOS_DEPLOYER_PRIVATE_KEY,
    "--url",
    APTOS_URL,
    "--skip-fetch-latest-git-deps",
    "--assume-yes",
  ];

  await execCommand("aptos", publishArgs);
  console.log("  ✓ Contracts published");

  // Run initialization functions
  const initFunctions = [
    {
      functionId: `${APTOS_DEPLOYER_ADDRESS}::registry::initialize`,
      args: [
        "hex:0000000000000000000000000000000000000000000000000000000000000000",
      ],
    },
    { functionId: `${APTOS_DEPLOYER_ADDRESS}::fake_eth::initialize`, args: [] },
    { functionId: `${APTOS_DEPLOYER_ADDRESS}::fake_usd::initialize`, args: [] },
  ];

  for (const initFunc of initFunctions) {
    console.log(`  Initializing ${initFunc.functionId}...`);
    const runArgs = [
      "move",
      "run",
      "--function-id",
      initFunc.functionId,
      "--private-key",
      APTOS_DEPLOYER_PRIVATE_KEY,
      "--url",
      APTOS_URL,
      "--assume-yes",
    ];

    if (initFunc.args.length > 0) {
      runArgs.push("--args", ...initFunc.args);
    }

    await execCommand("aptos", runArgs);
    console.log(`  ✓ ${initFunc.functionId}`);
  }

  console.log("  ✅ Aptos contracts deployed");
}

async function main() {
  console.log("═".repeat(60));
  console.log("  Atomica Contract Deployment");
  console.log("═".repeat(60));

  console.log("\n📡 Configuration:");
  console.log(`   Ethereum RPC: ${ETH_RPC_URL}`);
  console.log(`   Aptos API: ${APTOS_URL}`);
  console.log(
    "\n⚠️  Ensure testnets are running (start with: bun run testnet)",
  );

  const ethAddresses = await deployEthereumContracts();

  await deployAptosContracts();

  console.log("\n" + "═".repeat(60));
  console.log("  ✅ Deployment Complete!");
  console.log("═".repeat(60));
  console.log("\n📋 Deployed Contracts:");
  console.log(`   Ethereum RPC: ${ETH_RPC_URL}`);
  console.log(`   FakeETH  : ${ethAddresses.fakeETH}`);
  console.log(`   FakeUSD  : ${ethAddresses.fakeUSD}`);
  console.log(`   LockBox  : ${ethAddresses.lockBox}`);
  console.log("\n💡 Start the web app with: bun run dev\n");
}

main().catch((error) => {
  console.error("\n❌ Deployment failed:", error);
  process.exit(1);
});
