/**
 * Isolated Proof Generation Step Tests
 *
 * This file systematically tests each step of proof generation in isolation
 * to identify where the hang/timeout occurs.
 *
 * Based on investigation plan: docs/PROOF_GENERATION_INVESTIGATION_PLAN.md
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

/**
 * Enhanced pollUntil with comprehensive logging
 * Tracks every attempt and provides detailed error context
 */
async function pollUntilWithLogging<T>(
  fn: () => Promise<T>,
  condition: (result: T) => boolean,
  options: {
    interval?: number;
    timeout?: number;
    description?: string;
  } = {},
): Promise<T> {
  const interval = options.interval ?? 500;
  const timeout = options.timeout ?? 30000;
  const description = options.description ?? "condition";
  const startTime = Date.now();

  let attemptCount = 0;
  let lastError: Error | null = null;
  let lastResult: T | null = null;

  console.log(`[pollUntil] Starting poll for: ${description}`);
  console.log(`[pollUntil] Interval: ${interval}ms, Timeout: ${timeout}ms`);

  while (Date.now() - startTime < timeout) {
    attemptCount++;
    const elapsed = Date.now() - startTime;

    try {
      console.log(
        `[pollUntil] Attempt ${attemptCount} at ${elapsed}ms for ${description}`,
      );

      const result = await fn();
      lastResult = result;
      lastError = null;

      console.log(`[pollUntil] Function succeeded, checking condition...`);

      if (condition(result)) {
        console.log(
          `[pollUntil] ✓ Condition met after ${attemptCount} attempts (${elapsed}ms)`,
        );
        return result;
      }

      console.log(
        `[pollUntil] Condition not yet met, waiting ${interval}ms...`,
      );
    } catch (error) {
      lastError = error as Error;
      console.log(`[pollUntil] Attempt failed: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  // Timeout reached
  const elapsed = Date.now() - startTime;
  const errorMsg = [
    `Timeout waiting for ${description} after ${attemptCount} attempts (${elapsed}ms)`,
    lastError ? `Last error: ${lastError.message}` : null,
    lastResult
      ? `Last result: ${JSON.stringify(lastResult, (_, v) => (typeof v === "bigint" ? v.toString() : v))}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  throw new Error(errorMsg);
}

describe.skip("Isolated: Proof Generation Step Tests (Diagnostic - skip by default)", () => {
  let testnet: EthereumDockerTestnet;
  let provider: ethers.Provider;
  let deployer: ethers.Wallet;

  let fakeETHAddress: string;
  let lockBoxAddress: string;

  let fakeETH: ethers.Contract;
  let lockBox: ethers.Contract;

  beforeAll(async () => {
    console.log("\n=== SETUP: Starting Ethereum testnet ===");
    testnet = await EthereumDockerTestnet.start(4);
    await testnet.waitForHealthy(180);

    provider = new ethers.JsonRpcProvider(testnet.getExecutionRpcUrl());

    const testAccounts = testnet.getTestAccounts();
    deployer = new ethers.Wallet(testAccounts[0].privateKey, provider);

    console.log("=== SETUP: Compiling contracts ===");
    await compileContracts();

    console.log("=== SETUP: Deploying contracts ===");

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

    // Deploy LockBox (with FakeETH as only token for simplicity)
    const lockBoxArtifact = getLockBoxArtifact();
    const LockBoxFactory = new ethers.ContractFactory(
      lockBoxArtifact.abi,
      lockBoxArtifact.bytecode.object,
      deployer,
    );

    lockBox = await deployWithRetry(LockBoxFactory, deployer, [
      fakeETHAddress,
      fakeETHAddress, // Using same token twice for constructor
    ]);
    await lockBox.waitForDeployment();
    lockBoxAddress = await lockBox.getAddress();

    console.log("=== SETUP: Contracts deployed ===");
    console.log(`  FakeETH: ${fakeETHAddress}`);
    console.log(`  LockBox: ${lockBoxAddress}`);
    console.log("=====================================\n");
  }, 300000);

  afterAll(async () => {
    if (testnet) {
      console.log("\n=== TEARDOWN: Stopping Ethereum testnet ===");
      await testnet.teardown();
    }
  });

  describe("Phase 1: Infrastructure Health Checks", () => {
    it("should verify Ethereum node is responsive and synced", async () => {
      console.log("\n--- Step: Node Health Check ---");
      const startTime = Date.now();

      // Check basic connectivity
      const blockNumber = await provider.getBlockNumber();
      console.log(`✓ Current block: ${blockNumber}`);

      // Check if node is syncing
      const syncing = await provider.send("eth_syncing", []);
      console.log(`✓ Syncing status: ${syncing}`);
      expect(syncing).toBe(false);

      // Check block production (wait for 2 blocks)
      const block1 = await provider.getBlockNumber();
      console.log(`  Waiting 15s to verify block production...`);
      await new Promise((resolve) => setTimeout(resolve, 15000));
      const block2 = await provider.getBlockNumber();

      console.log(`✓ Blocks produced in 15s: ${block2 - block1}`);
      expect(block2).toBeGreaterThan(block1);

      // Check eth_getProof support
      try {
        await provider.send("eth_getProof", [
          "0x0000000000000000000000000000000000000000",
          [],
          "latest",
        ]);
        console.log("✓ eth_getProof is supported");
      } catch (error) {
        console.error("✗ eth_getProof not supported:", error.message);
        throw new Error("Node does not support eth_getProof");
      }

      const elapsed = Date.now() - startTime;
      console.log(`✓ Node health check completed in ${elapsed}ms`);
    }, 30000);
  });

  describe("Phase 2: Token Locking (Step 1)", () => {
    it("should lock tokens and get block number within 30s", async () => {
      console.log("\n--- Step 1: Token Locking ---");
      const startTime = Date.now();
      const lockAmount = ethers.parseEther("50");

      // Mint tokens
      console.log(`  Minting ${ethers.formatEther(lockAmount)} ETH...`);
      const mintTx = await fakeETH.mint(deployer.address, lockAmount);
      await mintTx.wait();
      console.log(`  ✓ [${Date.now() - startTime}ms] Minted tokens`);

      // Approve LockBox
      console.log(`  Approving LockBox...`);
      const approveTx = await fakeETH.approve(lockBoxAddress, lockAmount);
      await approveTx.wait();
      console.log(`  ✓ [${Date.now() - startTime}ms] Approved LockBox`);

      // Lock tokens
      console.log(`  Locking tokens...`);
      const lockTx = await lockBox.lock(fakeETHAddress, lockAmount);
      const receipt = await lockTx.wait();
      console.log(
        `  ✓ [${Date.now() - startTime}ms] Lock tx mined at block ${receipt.blockNumber}`,
      );

      expect(receipt.status).toBe(1);
      expect(receipt.blockNumber).toBeGreaterThan(0);

      const elapsed = Date.now() - startTime;
      console.log(`✓ Token locking completed in ${elapsed}ms`);
      expect(elapsed).toBeLessThan(30000);
    }, 45000);
  });

  describe("Phase 3: Block Production (Step 2)", () => {
    it("should mine target block within 60s of lock", async () => {
      console.log("\n--- Step 2: Block Production & State Indexing ---");
      const startTime = Date.now();
      const lockAmount = ethers.parseEther("50");

      // Lock tokens first
      let nonce = await deployer.getNonce();
      await sendAndWaitForTx(
        fakeETH.mint(deployer.address, lockAmount, { nonce: nonce++ }),
        1,
      );
      await sendAndWaitForTx(
        fakeETH.approve(lockBoxAddress, lockAmount, { nonce: nonce++ }),
        1,
      );
      const lockReceipt = await sendAndWaitForTx(
        lockBox.lock(fakeETHAddress, lockAmount, { nonce: nonce++ }),
        1,
      );

      const lockBlock = lockReceipt.blockNumber;
      const targetBlock = lockBlock + 1;

      console.log(
        `  Lock mined at block ${lockBlock}, waiting for block ${targetBlock}`,
      );

      // Poll for target block
      await pollUntilWithLogging(
        async () => {
          const currentBlock = await provider.getBlockNumber();
          const elapsed = Date.now() - startTime;
          console.log(
            `    [${elapsed}ms] Current block: ${currentBlock}, Target: ${targetBlock}`,
          );
          return { currentBlock, targetBlock };
        },
        (result) => result.currentBlock >= result.targetBlock,
        {
          description: `block ${targetBlock} to be mined`,
          interval: 1000,
          timeout: 60000,
        },
      );

      const elapsed = Date.now() - startTime;
      console.log(`✓ Target block reached in ${elapsed}ms`);
      expect(elapsed).toBeLessThan(60000);
    }, 90000);
  });

  describe("Phase 4: Storage Key Calculation (Step 3)", () => {
    it("should calculate storage key correctly", async () => {
      console.log("\n--- Step 3: Storage Key Calculation ---");
      const startTime = Date.now();

      const storageKey = calculateLockedBalanceStorageKey(
        deployer.address,
        fakeETHAddress,
      );

      console.log(`  Calculated storage key: ${storageKey}`);

      // Verify against on-chain calculation
      const onChainKey = await lockBox.calculateStorageKey(
        deployer.address,
        fakeETHAddress,
      );

      console.log(`  On-chain storage key:  ${onChainKey}`);

      expect(storageKey.toLowerCase()).toBe(onChainKey.toLowerCase());
      expect(storageKey).toMatch(/^0x[0-9a-f]{64}$/i);

      const elapsed = Date.now() - startTime;
      console.log(`✓ Storage key calculation verified in ${elapsed}ms`);
    });
  });

  describe("Phase 5: eth_getProof RPC Call (Step 4) ⚠️ CRITICAL", () => {
    it("should fetch proof via eth_getProof within 10s", async () => {
      console.log("\n--- Step 4: eth_getProof RPC Call (CRITICAL TEST) ---");
      const startTime = Date.now();
      const lockAmount = ethers.parseEther("50");

      // Setup: Lock tokens
      console.log("  Setting up: locking tokens...");
      let nonce = await deployer.getNonce();
      await sendAndWaitForTx(
        fakeETH.mint(deployer.address, lockAmount, { nonce: nonce++ }),
        1,
      );
      await sendAndWaitForTx(
        fakeETH.approve(lockBoxAddress, lockAmount, { nonce: nonce++ }),
        1,
      );
      const lockReceipt = await sendAndWaitForTx(
        lockBox.lock(fakeETHAddress, lockAmount, { nonce: nonce++ }),
        1,
      );

      const targetBlock = lockReceipt.blockNumber + 1;
      console.log(`  ✓ Lock complete at block ${lockReceipt.blockNumber}`);

      // Wait for target block
      console.log(`  Waiting for block ${targetBlock}...`);
      await pollUntilWithLogging(
        async () => provider.getBlockNumber(),
        (current) => current >= targetBlock,
        { description: `block ${targetBlock}`, timeout: 60000, interval: 1000 },
      );
      console.log(`  ✓ Block ${targetBlock} reached`);

      // Calculate storage key
      const storageKey = calculateLockedBalanceStorageKey(
        deployer.address,
        fakeETHAddress,
      );
      console.log(`  Storage key: ${storageKey.slice(0, 20)}...`);

      // Direct eth_getProof call with timeout
      console.log(
        `\n  🔍 CRITICAL: Calling eth_getProof at block ${targetBlock}...`,
      );
      const proofStartTime = Date.now();

      const proofPromise = provider.send("eth_getProof", [
        lockBoxAddress,
        [storageKey],
        `0x${targetBlock.toString(16)}`,
      ]);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("eth_getProof timeout after 10s")),
          10000,
        ),
      );

      let proof;
      try {
        proof = await Promise.race([proofPromise, timeoutPromise]);
      } catch (error) {
        const elapsed = Date.now() - proofStartTime;
        console.error(`  ✗ eth_getProof FAILED after ${elapsed}ms`);
        console.error(`  Error: ${error.message}`);
        throw error;
      }

      const proofElapsed = Date.now() - proofStartTime;
      console.log(`  ✓ eth_getProof completed in ${proofElapsed}ms`);

      console.log(`  Proof structure:`, {
        accountProofLength: proof.accountProof?.length,
        storageProofLength: proof.storageProof?.[0]?.proof?.length,
        storageValue: proof.storageProof?.[0]?.value,
      });

      expect(proof).toBeDefined();
      expect(proof.accountProof).toBeDefined();
      expect(proof.storageProof).toBeDefined();
      expect(proofElapsed).toBeLessThan(10000);

      const totalElapsed = Date.now() - startTime;
      console.log(`✓ Total test time: ${totalElapsed}ms`);
    }, 90000);
  });

  describe("Phase 6: Full Proof Generation (Step 5)", () => {
    it("should generate complete proof within 60s", async () => {
      console.log("\n--- Step 5: Full Proof Generation ---");
      const startTime = Date.now();
      const lockAmount = ethers.parseEther("50");

      // Lock tokens
      let nonce = await deployer.getNonce();
      await sendAndWaitForTx(
        fakeETH.mint(deployer.address, lockAmount, { nonce: nonce++ }),
        1,
      );
      await sendAndWaitForTx(
        fakeETH.approve(lockBoxAddress, lockAmount, { nonce: nonce++ }),
        1,
      );
      const lockReceipt = await sendAndWaitForTx(
        lockBox.lock(fakeETHAddress, lockAmount, { nonce: nonce++ }),
        1,
      );

      const targetBlock = lockReceipt.blockNumber + 1;
      console.log(`  Target block: ${targetBlock}`);

      // Wait for target block
      await pollUntilWithLogging(
        async () => provider.getBlockNumber(),
        (current) => current >= targetBlock,
        { timeout: 60000, interval: 1000 },
      );

      // Generate proof using pollUntil with the actual expected value
      console.log(`  Generating proof with pollUntil...`);
      const proof = await pollUntilWithLogging(
        async () => {
          const currentBlock = await provider.getBlockNumber();
          if (currentBlock < targetBlock) {
            throw new Error(
              `Block ${targetBlock} not yet mined (current: ${currentBlock})`,
            );
          }

          return generateLockedBalanceProof(
            provider,
            lockBoxAddress,
            deployer.address,
            fakeETHAddress,
            targetBlock,
          );
        },
        (proof) => proof.storageValue === lockAmount,
        {
          description: `proof at block ${targetBlock} with correct balance`,
          interval: 2000,
          timeout: 60000,
        },
      );

      console.log(`  ✓ Proof generated successfully`);
      console.log(`    Block number: ${proof.blockNumber}`);
      console.log(`    Storage value: ${proof.storageValue}`);
      console.log(`    Account proof nodes: ${proof.accountProof.length}`);
      console.log(`    Storage proof nodes: ${proof.storageProof.length}`);

      expect(proof.storageValue).toBe(lockAmount);
      expect(proof.accountProof.length).toBeGreaterThan(0);
      expect(proof.storageProof.length).toBeGreaterThan(0);

      const elapsed = Date.now() - startTime;
      console.log(`✓ Full proof generation completed in ${elapsed}ms`);
      expect(elapsed).toBeLessThan(60000);
    }, 90000);
  });

  describe("Phase 7: Diagnostic - pollUntil Behavior", () => {
    it("should log detailed attempt information during proof generation", async () => {
      console.log("\n--- Diagnostic: pollUntil with Enhanced Logging ---");
      const lockAmount = ethers.parseEther("50");

      let nonce = await deployer.getNonce();
      await sendAndWaitForTx(
        fakeETH.mint(deployer.address, lockAmount, { nonce: nonce++ }),
        1,
      );
      await sendAndWaitForTx(
        fakeETH.approve(lockBoxAddress, lockAmount, { nonce: nonce++ }),
        1,
      );
      const lockReceipt = await sendAndWaitForTx(
        lockBox.lock(fakeETHAddress, lockAmount, { nonce: nonce++ }),
        1,
      );

      const targetBlock = lockReceipt.blockNumber + 1;

      console.log(`  Starting diagnostic poll for block ${targetBlock}...`);

      try {
        await pollUntilWithLogging(
          async () => {
            const currentBlock = await provider.getBlockNumber();
            console.log(`    Current: ${currentBlock}, Target: ${targetBlock}`);

            if (currentBlock < targetBlock) {
              throw new Error(
                `Block ${targetBlock} not yet mined (current: ${currentBlock})`,
              );
            }

            return generateLockedBalanceProof(
              provider,
              lockBoxAddress,
              deployer.address,
              fakeETHAddress,
              targetBlock,
            );
          },
          (proof) => {
            const matches = proof.storageValue === lockAmount;
            console.log(
              `    Storage value: ${proof.storageValue}, Expected: ${lockAmount}, Match: ${matches}`,
            );
            return matches;
          },
          {
            description: "proof with correct balance",
            interval: 2000,
            timeout: 60000,
          },
        );
        console.log("✓ Diagnostic poll succeeded");
      } catch (error) {
        console.error("Diagnostic poll error details:", error.message);
        throw error;
      }
    }, 90000);
  });
});
