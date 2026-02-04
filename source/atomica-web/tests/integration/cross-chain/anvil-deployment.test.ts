import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ethers } from "ethers";
import { spawn, ChildProcess } from "child_process";
import {
  compileContracts,
  getMinimalTestArtifact,
  getFakeETHArtifact,
  deployWithRetry,
} from "../ethereum/solidity-compiler";

/**
 * Anvil Deployment Test
 *
 * This test uses Foundry's Anvil (a simple, fast local testnet)
 * instead of the complex ethereum-docker-testnet to isolate
 * whether the issue is with the testnet setup or something else.
 */
describe("Anvil Deployment Test", () => {
  let anvilProcess: ChildProcess;
  let ethProvider: ethers.JsonRpcProvider;
  let ethSigner: ethers.Wallet;

  beforeAll(async () => {
    console.log("=".repeat(80));
    console.log("ANVIL DEPLOYMENT TEST - USING SIMPLE TESTNET");
    console.log("=".repeat(80));

    // Start Anvil
    console.log("\n[PHASE 1] Starting Anvil...");
    anvilProcess = spawn("anvil", [
      "--port", "8545",
      "--accounts", "10",
      "--balance", "10000",
      "--gas-limit", "30000000",
      "--code-size-limit", "100000",
      "--block-time", "1",
    ]);

    // Wait for Anvil to start
    await new Promise((resolve) => {
      anvilProcess.stdout?.on("data", (data) => {
        const output = data.toString();
        if (output.includes("Listening on")) {
          console.log("✓ Anvil started");
          resolve(true);
        }
      });
    });

    // Give it an extra second
    await new Promise((r) => setTimeout(r, 1000));

    // Setup provider and signer
    ethProvider = new ethers.JsonRpcProvider("http://127.0.0.1:8545");

    // Anvil provides test accounts with known private keys
    const testPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    ethSigner = new ethers.Wallet(testPrivateKey, ethProvider);

    console.log(`✓ Ethereum signer: ${ethSigner.address}`);

    const balance = await ethProvider.getBalance(ethSigner.address);
    console.log(`✓ ETH balance: ${ethers.formatEther(balance)} ETH`);

    // Compile contracts
    await compileContracts();
    console.log("✓ Contracts compiled\n");
  }, 30000);

  afterAll(async () => {
    console.log("\n" + "=".repeat(80));
    console.log("STOPPING ANVIL");
    console.log("=".repeat(80));

    if (anvilProcess) {
      anvilProcess.kill();
      await new Promise((r) => setTimeout(r, 1000));
    }

    console.log("✓ Cleanup complete\n");
  });

  it("should deploy MinimalTest on Anvil", async () => {
    console.log("\n[TEST 1] Deploying MinimalTest on Anvil...");

    const minimalTestArtifact = getMinimalTestArtifact();
    const MinimalTestFactory = new ethers.ContractFactory(
      minimalTestArtifact.abi,
      minimalTestArtifact.bytecode.object,
      ethSigner,
    );

    const minimalContract = await deployWithRetry(MinimalTestFactory, ethSigner);
    const minimalAddress = await minimalContract.getAddress();

    console.log(`\n✓ Deployed at: ${minimalAddress}`);

    // Check bytecode
    const code = await ethProvider.getCode(minimalAddress);
    console.log(`✓ Bytecode length: ${code.length} characters`);

    if (code === '0x') {
      throw new Error("MinimalTest has no bytecode on Anvil!");
    }

    // Test calling the contract
    const value = await minimalContract.getValue();
    console.log(`✓ getValue() returned: ${value}`);
    expect(value).toBe(42n);

    console.log("\n✅ MinimalTest works on Anvil!");
  }, 30000);

  it("should deploy FakeETH on Anvil", async () => {
    console.log("\n[TEST 2] Deploying FakeETH on Anvil...");

    const fakeETHArtifact = getFakeETHArtifact();
    const FakeETHFactory = new ethers.ContractFactory(
      fakeETHArtifact.abi,
      fakeETHArtifact.bytecode.object,
      ethSigner,
    );

    const fakeEthContract = await deployWithRetry(FakeETHFactory, ethSigner);
    const fakeEthAddress = await fakeEthContract.getAddress();

    console.log(`\n✓ Deployed at: ${fakeEthAddress}`);

    // Check bytecode
    const code = await ethProvider.getCode(fakeEthAddress);
    console.log(`✓ Bytecode length: ${code.length} characters`);

    if (code === '0x') {
      throw new Error("FakeETH has no bytecode on Anvil!");
    }

    // Test minting
    console.log("\nTesting minting...");
    const mintAmount = ethers.parseEther("100");
    const mintTx = await fakeEthContract.mint(mintAmount);
    const receipt = await mintTx.wait();

    console.log(`✓ Mint transaction: ${mintTx.hash} (status: ${receipt.status})`);

    // Check balance
    const balance = await fakeEthContract.balanceOf(ethSigner.address);
    console.log(`✓ Balance: ${ethers.formatEther(balance)} FakeETH`);

    expect(balance).toBe(mintAmount);

    console.log("\n✅ FakeETH works on Anvil!");
  }, 30000);
});
