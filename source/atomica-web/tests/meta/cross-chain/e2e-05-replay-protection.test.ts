import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ethers } from "ethers";
import {
  getFakeETHArtifact,
  getLockBoxArtifact,
} from "../ethereum/solidity-compiler";
import { sendAndWaitForTx } from "../helpers/transaction-utils";
import {
  generateLockProof,
  calculateStorageKey,
} from "../../../src/lib/ethereum/proofs/generator";
import {
  setupDualChainFixture,
  teardownDualChainFixture,
  DualChainFixture,
} from "./helpers/dual-chain-fixture";

/**
 * E2E Test 5: Prevent Replay Attacks
 *
 * Verifies that:
 * - Duplicate proof submissions are rejected
 * - Error message contains E_ALREADY_CLAIMED
 * - Lock receipts cannot be created twice for same lock
 */
describe("E2E 05: Replay Attack Prevention", () => {
  let fixture: DualChainFixture;
  let proof: any;
  let storageKey: string;

  const MINT_AMOUNT_ETH = ethers.parseEther("1000");
  const LOCK_AMOUNT_ETH = ethers.parseEther("10");

  beforeAll(async () => {
    fixture = await setupDualChainFixture();

    // Complete full flow first (dependencies from Tests 1-5)
    const fakeETHArtifact = getFakeETHArtifact();
    const fakeEthContract = new ethers.Contract(
      fixture.eth.contracts.fakeETH,
      fakeETHArtifact.abi,
      fixture.eth.signer,
    );
    await sendAndWaitForTx(
      fakeEthContract.mint(fixture.eth.signer.address, MINT_AMOUNT_ETH),
      1,
    );

    const lockBoxArtifact = getLockBoxArtifact();
    const lockBoxContract = new ethers.Contract(
      fixture.eth.contracts.lockBox,
      lockBoxArtifact.abi,
      fixture.eth.signer,
    );

    let nonce = await fixture.eth.signer.getNonce();
    await sendAndWaitForTx(
      fakeEthContract.approve(fixture.eth.contracts.lockBox, LOCK_AMOUNT_ETH, {
        nonce: nonce++,
      }),
      1,
    );
    const lockReceipt = await sendAndWaitForTx(
      lockBoxContract.lock(fixture.eth.contracts.fakeETH, LOCK_AMOUNT_ETH, {
        nonce: nonce++,
      }),
      1,
    );

    const lockBlockNumber = lockReceipt.blockNumber!;

    // Wait for finalization and generate proof
    await fixture.eth.testnet.waitForBlocks(12, 180);

    proof = await generateLockProof(
      fixture.eth.provider,
      fixture.eth.contracts.lockBox,
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
      lockBlockNumber,
    );

    storageKey = calculateStorageKey(
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
    );

    // Submit proof once (should succeed)
    const payload = {
      function: `${fixture.aptos.moduleAddress}::lock_receipt::register_ethereum_lock`,
      typeArguments: [`${fixture.aptos.moduleAddress}::lock_receipt::FakeETH`],
      functionArguments: [
        proof.blockNumber,
        ethers.getBytes(proof.blockHash),
        ethers.getBytes(proof.stateRoot),
        ethers.getBytes(fixture.eth.contracts.lockBox),
        ethers.getBytes(fixture.eth.signer.address),
        ethers.getBytes(fixture.eth.contracts.fakeETH),
        ethers.getBytes(storageKey),
        proof.storageValue.toString(),
        proof.accountProof.map((p: string) => ethers.getBytes(p)),
        proof.storageProof.map((p: string) => ethers.getBytes(p)),
      ],
    };

    const txn = await fixture.aptos.client.transaction.build.simple({
      sender: fixture.aptos.deployer.accountAddress,
      data: payload,
    });

    const committedTxn = await fixture.aptos.client.signAndSubmitTransaction({
      signer: fixture.aptos.deployer,
      transaction: txn,
    });

    await fixture.aptos.client.waitForTransaction({
      transactionHash: committedTxn.hash,
      options: { checkSuccess: true },
    });
  }, 600000);

  afterAll(async () => {
    if (fixture) {
      await teardownDualChainFixture(fixture);
    }
  });

  it("should prevent replay attacks by rejecting duplicate proofs", async () => {
    console.log("\n[TEST 5] Testing replay attack prevention...");
    console.log("  Attempting to submit same proof again...");

    // Try to submit the same proof again (should fail)
    const payload = {
      function: `${fixture.aptos.moduleAddress}::lock_receipt::register_ethereum_lock`,
      typeArguments: [`${fixture.aptos.moduleAddress}::lock_receipt::FakeETH`],
      functionArguments: [
        proof.blockNumber,
        ethers.getBytes(proof.blockHash),
        ethers.getBytes(proof.stateRoot),
        ethers.getBytes(fixture.eth.contracts.lockBox),
        ethers.getBytes(fixture.eth.signer.address),
        ethers.getBytes(fixture.eth.contracts.fakeETH),
        ethers.getBytes(storageKey),
        proof.storageValue.toString(),
        proof.accountProof.map((p: string) => ethers.getBytes(p)),
        proof.storageProof.map((p: string) => ethers.getBytes(p)),
      ],
    };

    const txn = await fixture.aptos.client.transaction.build.simple({
      sender: fixture.aptos.deployer.accountAddress,
      data: payload,
    });

    try {
      const committedTxn = await fixture.aptos.client.signAndSubmitTransaction({
        signer: fixture.aptos.deployer,
        transaction: txn,
      });

      await fixture.aptos.client.waitForTransaction({
        transactionHash: committedTxn.hash,
      });

      // If we get here, the test should fail
      expect(true).toBe(false); // Force failure
      console.error(
        "  ✗ Duplicate proof was accepted (security vulnerability!)",
      );
    } catch (error: any) {
      console.log("  ✓ Transaction rejected as expected");
      console.log(`    Error: ${error.message}`);
      expect(error.message).toContain("E_ALREADY_CLAIMED");
    }
  }, 60000);
});
