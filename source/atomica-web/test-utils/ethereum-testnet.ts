/**
 * Ethereum testnet lifecycle for browser test commands.
 *
 * Runs in Node.js (browser command handlers). Starts an Ethereum Docker
 * testnet, compiles + deploys FakeETH and FakeUSD, and returns the
 * connection info needed by the browser-side wallet mock.
 */

import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { ethers } from "ethers";
import { resolve as pathResolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, readFileSync } from "fs";
import { execSync } from "child_process";
import type { EthereumTestnetInfo } from "./browser-commands";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const EVM_CONTRACTS_DIR = pathResolve(THIS_DIR, "../../evm-contracts");

let testnet: EthereumDockerTestnet | null = null;

function ensureCompiled(): void {
  const outDir = pathResolve(EVM_CONTRACTS_DIR, "out");
  if (!existsSync(outDir)) {
    console.log("[Ethereum Testnet] Compiling Solidity contracts...");
    execSync("forge build", { cwd: EVM_CONTRACTS_DIR, stdio: "inherit" });
    console.log("[Ethereum Testnet] ✓ Compiled");
  }
}

function readArtifact(contractName: string): {
  abi: object[];
  bytecode: { object: string };
} {
  const artifactPath = pathResolve(
    EVM_CONTRACTS_DIR,
    "out",
    `${contractName}.sol`,
    `${contractName}.json`,
  );
  return JSON.parse(readFileSync(artifactPath, "utf-8"));
}

/**
 * Wait until geth's transaction indexer is ready by polling eth_blockNumber.
 * Geth returns -32000 "transaction indexing is in progress" on eth_getTransactionReceipt
 * for a short window after startup even though the health check has passed.
 * Waiting for block 1 ensures the indexer is fully caught up.
 */
async function waitForFirstBlock(
  provider: ethers.JsonRpcProvider,
): Promise<void> {
  console.log("[Ethereum Testnet] Waiting for first block...");
  for (let i = 0; i < 60; i++) {
    const block = await provider.getBlockNumber();
    if (block >= 1) {
      console.log(`[Ethereum Testnet] ✓ Block ${block} reached`);
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error("Timed out waiting for first block");
}

async function deployContract(
  signer: ethers.Wallet,
  artifact: { abi: object[]; bytecode: { object: string } },
  constructorArgs: unknown[] = [],
): Promise<string> {
  const factory = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode.object,
    signer,
  );
  const contract = await factory.deploy(...constructorArgs);
  await contract.waitForDeployment();
  return await contract.getAddress();
}

export async function setupEthereumTestnet(): Promise<EthereumTestnetInfo> {
  console.log("[Ethereum Testnet] Starting...");

  testnet = await EthereumDockerTestnet.start(4);
  await testnet.waitForHealthy(180);

  const rpcUrl = testnet.getExecutionRpcUrl();
  const chainId = await testnet.getChainId();
  const accounts = testnet.getTestAccounts();
  const signerPrivateKey = accounts[0].privateKey;

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(signerPrivateKey, provider);

  console.log(`[Ethereum Testnet] ✓ RPC: ${rpcUrl}, chainId: ${chainId}`);
  console.log(`[Ethereum Testnet] Deployer: ${signer.address}`);

  await waitForFirstBlock(provider);
  ensureCompiled();

  const fakeETHArtifact = readArtifact("FakeETH");
  const fakeETH = await deployContract(signer, fakeETHArtifact);
  console.log(`[Ethereum Testnet] ✓ FakeETH: ${fakeETH}`);

  const fakeUSDArtifact = readArtifact("FakeUSD");
  const fakeUSD = await deployContract(signer, fakeUSDArtifact);
  console.log(`[Ethereum Testnet] ✓ FakeUSD: ${fakeUSD}`);

  return { rpcUrl, fakeETH, fakeUSD, signerPrivateKey, chainId };
}

export async function teardownEthereumTestnet(): Promise<void> {
  if (testnet) {
    console.log("[Ethereum Testnet] Tearing down...");
    await testnet.teardown();
    testnet = null;
    console.log("[Ethereum Testnet] ✓ Stopped");
  }
}
