/**
 * Simple test to verify basic eth_getProof behavior
 * Mirrors the state-proofs integration test approach
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ethers } from "ethers";
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { calculateLockedBalanceStorageKey } from "../../../src/lib/ethereum/proofs/index.js";
import {
  compileContracts,
  getFakeETHArtifact,
  getLockBoxArtifact,
  deployWithRetry,
} from "./solidity-compiler.js";

describe("Simple eth_getProof Test", () => {
  let testnet: EthereumDockerTestnet;
  let provider: ethers.Provider;
  let deployer: ethers.Wallet;

  let fakeETHAddress: string;
  let lockBoxAddress: string;

  let fakeETH: ethers.Contract;
  let lockBox: ethers.Contract;

  beforeAll(async () => {
    console.log("\n=== SETUP ===");
    testnet = await EthereumDockerTestnet.start(4);
    await testnet.waitForHealthy(180);

    provider = new ethers.JsonRpcProvider(testnet.getExecutionRpcUrl());

    const testAccounts = testnet.getTestAccounts();
    deployer = new ethers.Wallet(testAccounts[0].privateKey, provider);

    await compileContracts();

    const fakeETHArtifact = getFakeETHArtifact();
    const FakeETHFactory = new ethers.ContractFactory(
      fakeETHArtifact.abi,
      fakeETHArtifact.bytecode.object,
      deployer,
    );

    fakeETH = await deployWithRetry(FakeETHFactory, deployer);
    await fakeETH.waitForDeployment();
    fakeETHAddress = await fakeETH.getAddress();

    const lockBoxArtifact = getLockBoxArtifact();
    const LockBoxFactory = new ethers.ContractFactory(
      lockBoxArtifact.abi,
      lockBoxArtifact.bytecode.object,
      deployer,
    );

    lockBox = await deployWithRetry(LockBoxFactory, deployer, [
      fakeETHAddress,
      fakeETHAddress,
    ]);
    await lockBox.waitForDeployment();
    lockBoxAddress = await lockBox.getAddress();

    console.log(`FakeETH: ${fakeETHAddress}`);
    console.log(`LockBox: ${lockBoxAddress}`);
  }, 300000);

  afterAll(async () => {
    if (testnet) {
      await testnet.teardown();
    }
  });

  it("should get non-zero storage value via eth_getProof", async () => {
    console.log("\n=== TEST ===");

    const lockAmount = ethers.parseEther("50");

    // Step 1: Mint
    console.log("1. Minting tokens...");
    const mintTx = await fakeETH.mint(deployer.address, lockAmount);
    const mintReceipt = await mintTx.wait(1); // Wait for 1 confirmation
    console.log(`   Minted in block ${mintReceipt.blockNumber}`);

    // Step 2: Approve
    console.log("2. Approving LockBox...");
    const approveTx = await fakeETH.approve(lockBoxAddress, lockAmount);
    const approveReceipt = await approveTx.wait(1);
    console.log(`   Approved in block ${approveReceipt.blockNumber}`);

    // Step 3: Lock
    console.log("3. Locking tokens...");
    const lockTx = await lockBox.lock(fakeETHAddress, lockAmount);
    const lockReceipt = await lockTx.wait(1);
    const lockBlock = lockReceipt.blockNumber;
    console.log(`   Locked in block ${lockBlock}, tx: ${lockReceipt.hash}`);

    // Verify lock via direct contract read
    console.log("\n4. Verifying lock via contract read...");
    const directValue = await lockBox.getLockedBalance(
      deployer.address,
      fakeETHAddress,
    );
    console.log(
      `   Direct read: ${directValue} (${ethers.formatEther(directValue)} ETH)`,
    );
    expect(directValue).toBe(lockAmount);

    // Get storage key
    const storageKey = calculateLockedBalanceStorageKey(
      deployer.address,
      fakeETHAddress,
    );
    console.log(`\n5. Storage key: ${storageKey}`);

    // Try eth_getProof at the lock block with retries
    console.log(`\n6. Trying eth_getProof at block ${lockBlock}...`);

    for (let attempt = 0; attempt < 5; attempt++) {
      if (attempt > 0) {
        console.log(`   Attempt ${attempt + 1} after 2s delay...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      try {
        const proof = await provider.send("eth_getProof", [
          lockBoxAddress,
          [storageKey],
          `0x${lockBlock.toString(16)}`,
        ]);

        const storageValue = BigInt(proof.storageProof?.[0]?.value || "0x0");
        console.log(`   Storage value from eth_getProof: ${storageValue}`);
        console.log(`   Expected: ${lockAmount}`);
        console.log(`   Match: ${storageValue === lockAmount}`);

        if (storageValue === lockAmount) {
          console.log("\n✅ SUCCESS: eth_getProof returned correct value!");
          expect(storageValue).toBe(lockAmount);
          return; // Test passed
        }
      } catch (error) {
        console.log(`   Error: ${error.message}`);
      }
    }

    // If we got here, all attempts failed
    console.log(
      "\n❌ FAILED: eth_getProof never returned correct storage value",
    );
    console.log(
      "This suggests the Ethereum node doesn't properly support eth_getProof for storage",
    );
    throw new Error(
      "eth_getProof did not return correct storage value after 5 attempts",
    );
  }, 120000);
});
