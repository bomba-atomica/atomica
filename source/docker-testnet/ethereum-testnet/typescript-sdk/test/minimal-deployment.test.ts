import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { EthereumDockerTestnet } from "../src/index";
import { ethers } from "ethers";
import {
  compileContracts,
  getMinimalTestArtifact,
  deployWithRetry,
} from "./helpers/solidity-compiler";

/**
 * Minimal Deployment Test
 *
 * This test attempts to deploy the simplest possible contract (MinimalTest)
 * to isolate whether the deployment issue is:
 * - A testnet/EVM configuration problem (if this fails)
 * - A contract-specific issue with FakeETH/LockBox (if this succeeds)
 */
describe("Minimal Contract Deployment Test", () => {
  let ethTestnet: EthereumDockerTestnet;
  let ethProvider: ethers.JsonRpcProvider;
  let ethSigner: ethers.Wallet;

  beforeAll(async () => {
    console.log("=".repeat(80));
    console.log("MINIMAL DEPLOYMENT TEST - ISOLATING THE ISSUE");
    console.log("=".repeat(80));

    // Start Ethereum testnet
    console.log("\n[PHASE 1] Starting Ethereum testnet...");
    ethTestnet = await EthereumDockerTestnet.start(4);
    await ethTestnet.waitForHealthy(180);
    console.log("✓ Ethereum testnet is healthy");

    // Setup provider and signer
    ethProvider = new ethers.JsonRpcProvider(ethTestnet.getExecutionRpcUrl());
    const testAccounts = ethTestnet.getTestAccounts();
    ethSigner = new ethers.Wallet(testAccounts[0].privateKey, ethProvider);

    console.log(`✓ Ethereum signer: ${ethSigner.address}`);

    const balance = await ethProvider.getBalance(ethSigner.address);
    console.log(`✓ ETH balance: ${ethers.formatEther(balance)} ETH`);

    // Compile contracts
    await compileContracts();
    console.log("✓ Contracts compiled\n");
  }, 300000); // 5 minute timeout

  afterAll(async () => {
    console.log("\n" + "=".repeat(80));
    console.log("TEARING DOWN TESTNET");
    console.log("=".repeat(80));

    if (ethTestnet) {
      await ethTestnet.teardown();
    }

    console.log("✓ Cleanup complete\n");
  });

  it("should deploy MinimalTest contract successfully", async () => {
    console.log("\n[TEST] Deploying MinimalTest contract...");
    console.log("This is the SIMPLEST possible contract:");
    console.log("  - No constructor parameters");
    console.log("  - No inheritance");
    console.log("  - Just one uint256 storage variable");
    console.log("");

    // Get artifact
    const minimalTestArtifact = getMinimalTestArtifact();
    console.log(
      `✓ Artifact loaded (ABI has ${minimalTestArtifact.abi.length} entries)`,
    );

    // Create factory
    const MinimalTestFactory = new ethers.ContractFactory(
      minimalTestArtifact.abi,
      minimalTestArtifact.bytecode.object,
      ethSigner,
    );

    console.log(`✓ Factory created`);
    console.log(
      `  Bytecode length: ${minimalTestArtifact.bytecode.object.length} characters\n`,
    );

    // Deploy
    console.log("Attempting deployment...");
    const minimalContract = await deployWithRetry(
      MinimalTestFactory,
      ethSigner,
    );
    const minimalAddress = await minimalContract.getAddress();

    console.log(`\n✓ Deployment function returned`);
    console.log(`  Address: ${minimalAddress}`);

    // Wait for state to be indexed
    console.log("\nWaiting 3 seconds for state indexing...");
    await new Promise((r) => setTimeout(r, 3000));

    // Check if contract actually exists
    console.log("\nVerifying contract existence...");
    const code = await ethProvider.getCode(minimalAddress);
    console.log(`  Bytecode at address: ${code}`);
    console.log(`  Length: ${code.length} characters`);

    if (code === "0x") {
      console.log("\n❌ FAILURE: Contract deployed but no bytecode exists!");
      console.log("This indicates a TESTNET/EVM ISSUE, not a contract issue.");
      throw new Error("Contract has no bytecode despite successful deployment");
    }

    console.log("\n✓ SUCCESS: Contract has bytecode!");

    // Try to call the getValue function
    console.log("\nTesting contract call...");
    const value = await minimalContract.getValue();
    console.log(`  getValue() returned: ${value}`);

    expect(value).toBe(42n);
    console.log("✓ Contract call successful!");

    console.log("\n" + "=".repeat(80));
    console.log("RESULT: MinimalTest deployed and works correctly!");
    console.log(
      "This means the issue is with FakeETH/LockBox contracts, not the testnet.",
    );
    console.log("=".repeat(80));
  }, 120000); // 2 minute timeout
});
