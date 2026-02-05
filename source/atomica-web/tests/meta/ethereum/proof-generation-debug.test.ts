/**
 * Deep Diagnostic: Storage Value Tracking
 *
 * This test tracks EXACTLY when and where the locked balance appears in storage.
 * Queries storage at multiple blocks to understand state propagation.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ethers } from "ethers";
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import {
  calculateLockedBalanceStorageKey,
  generateLockedBalanceProof,
} from "../../../src/lib/ethereum/proofs/index.js";
import {
  compileContracts,
  getFakeETHArtifact,
  getLockBoxArtifact,
  deployWithRetry,
} from "./solidity-compiler.js";
import { sendAndWaitForTx } from "../helpers/transaction-utils.js";

describe("DEBUG: Storage Value Propagation", () => {
  let testnet: EthereumDockerTestnet;
  let provider: ethers.Provider;
  let deployer: ethers.Wallet;

  let fakeETHAddress: string;
  let lockBoxAddress: string;

  let fakeETH: ethers.Contract;
  let lockBox: ethers.Contract;

  beforeAll(async () => {
    console.log("\n=== DEBUG SETUP ===");
    testnet = await EthereumDockerTestnet.start(4);
    await testnet.waitForHealthy(180);

    provider = new ethers.JsonRpcProvider(testnet.getExecutionRpcUrl());

    const testAccounts = testnet.getTestAccounts();
    deployer = new ethers.Wallet(testAccounts[0].privateKey, provider);

    await compileContracts();

    // Deploy FakeETH
    const fakeETHArtifact = getFakeETHArtifact();
    const FakeETHFactory = new ethers.ContractFactory(
      fakeETHArtifact.abi,
      fakeETHArtifact.bytecode.object,
      deployer,
    );

    fakeETH = await deployWithRetry(FakeETHFactory, deployer);
    await fakeETH.waitForDeployment();
    fakeETHAddress = await fakeETH.getAddress();

    // Deploy LockBox
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

  it("should track storage value across multiple blocks", async () => {
    console.log("\n=== TRACKING STORAGE VALUE ACROSS BLOCKS ===\n");

    const lockAmount = ethers.parseEther("50");
    const storageKey = calculateLockedBalanceStorageKey(
      deployer.address,
      fakeETHAddress,
    );

    // Check storage BEFORE locking
    console.log("📍 BEFORE LOCKING:");
    const beforeBlock = await provider.getBlockNumber();
    console.log(`  Current block: ${beforeBlock}`);

    try {
      const beforeProof = await generateLockedBalanceProof(
        provider,
        lockBoxAddress,
        deployer.address,
        fakeETHAddress,
        beforeBlock,
      );
      console.log(
        `  Storage value at block ${beforeBlock}: ${beforeProof.storageValue}`,
      );
      expect(beforeProof.storageValue).toBe(0n);
    } catch (error) {
      console.log(`  Could not generate proof: ${error.message}`);
    }

    // Lock tokens
    console.log("\n📝 LOCKING TOKENS:");
    let nonce = await deployer.getNonce();

    console.log(`  Minting ${ethers.formatEther(lockAmount)} ETH...`);
    const mintReceipt = await sendAndWaitForTx(
      fakeETH.mint(deployer.address, lockAmount, { nonce: nonce++ }),
      1,
    );
    console.log(`  ✓ Mint tx in block ${mintReceipt.blockNumber}`);

    console.log(`  Approving LockBox...`);
    const approveReceipt = await sendAndWaitForTx(
      fakeETH.approve(lockBoxAddress, lockAmount, { nonce: nonce++ }),
      1,
    );
    console.log(`  ✓ Approve tx in block ${approveReceipt.blockNumber}`);

    console.log(`  Locking tokens...`);
    const lockReceipt = await sendAndWaitForTx(
      lockBox.lock(fakeETHAddress, lockAmount, { nonce: nonce++ }),
      1,
    );
    console.log(
      `  ✓ Lock tx in block ${lockReceipt.blockNumber}, hash: ${lockReceipt.hash}`,
    );

    const lockBlock = lockReceipt.blockNumber;

    // Query storage AT THE LOCK BLOCK
    console.log(`\n📍 AT LOCK BLOCK (${lockBlock}):`);
    try {
      const atLockProof = await generateLockedBalanceProof(
        provider,
        lockBoxAddress,
        deployer.address,
        fakeETHAddress,
        lockBlock,
      );
      console.log(
        `  Storage value at block ${lockBlock}: ${atLockProof.storageValue}`,
      );
      console.log(`  Expected: ${lockAmount}`);
      console.log(`  Match: ${atLockProof.storageValue === lockAmount}`);
    } catch (error) {
      console.log(`  ERROR: ${error.message}`);
    }

    // Wait for next block and query
    console.log(`\n⏳ Waiting for block ${lockBlock + 1}...`);
    while ((await provider.getBlockNumber()) < lockBlock + 1) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    console.log(`\n📍 AT LOCK BLOCK + 1 (${lockBlock + 1}):`);
    try {
      const nextBlockProof = await generateLockedBalanceProof(
        provider,
        lockBoxAddress,
        deployer.address,
        fakeETHAddress,
        lockBlock + 1,
      );
      console.log(
        `  Storage value at block ${lockBlock + 1}: ${nextBlockProof.storageValue}`,
      );
      console.log(`  Expected: ${lockAmount}`);
      console.log(`  Match: ${nextBlockProof.storageValue === lockAmount}`);
    } catch (error) {
      console.log(`  ERROR: ${error.message}`);
    }

    // Try several more blocks
    for (let i = 2; i <= 5; i++) {
      const targetBlock = lockBlock + i;

      console.log(`\n⏳ Waiting for block ${targetBlock}...`);
      while ((await provider.getBlockNumber()) < targetBlock) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }

      console.log(`\n📍 AT LOCK BLOCK + ${i} (${targetBlock}):`);
      try {
        const proof = await generateLockedBalanceProof(
          provider,
          lockBoxAddress,
          deployer.address,
          fakeETHAddress,
          targetBlock,
        );
        console.log(
          `  Storage value at block ${targetBlock}: ${proof.storageValue}`,
        );
        console.log(`  Expected: ${lockAmount}`);
        console.log(`  Match: ${proof.storageValue === lockAmount}`);

        if (proof.storageValue === lockAmount) {
          console.log(
            `\n✅ FOUND: Storage value first appears at block ${targetBlock} (lock block + ${i})`,
          );
          break;
        }
      } catch (error) {
        console.log(`  ERROR: ${error.message}`);
      }
    }

    // Query at "latest" block
    console.log(`\n📍 AT LATEST BLOCK:`);
    const latestBlock = await provider.getBlockNumber();
    console.log(`  Current block: ${latestBlock}`);

    try {
      const latestProof = await generateLockedBalanceProof(
        provider,
        lockBoxAddress,
        deployer.address,
        fakeETHAddress,
      );
      console.log(`  Storage value at latest: ${latestProof.storageValue}`);
      console.log(`  Expected: ${lockAmount}`);
      console.log(`  Match: ${latestProof.storageValue === lockAmount}`);
    } catch (error) {
      console.log(`  ERROR: ${error.message}`);
    }

    // Also try reading directly from contract
    console.log(`\n📍 DIRECT CONTRACT READ:`);
    try {
      const directValue = await lockBox.getLockedBalance(
        deployer.address,
        fakeETHAddress,
      );
      console.log(`  Direct contract read: ${directValue}`);
      console.log(`  Expected: ${lockAmount}`);
      console.log(`  Match: ${directValue === lockAmount}`);
    } catch (error) {
      console.log(`  ERROR: ${error.message}`);
    }
  }, 180000); // 3 min timeout
});
