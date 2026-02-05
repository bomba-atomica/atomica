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
 * E2E Test 3: Generate Ethereum State Proof for FakeETH Lock
 *
 * Verifies that:
 * - Storage keys match between on-chain and off-chain calculation
 * - eth_getProof returns non-zero values for locked balances
 * - Generated proof has valid structure
 * - Proof storage value matches actual locked amount
 */
describe("E2E 03: Generate Ethereum State Proof", () => {
  let fixture: DualChainFixture;
  let lockBlockNumber: number;

  const MINT_AMOUNT_ETH = ethers.parseEther("1000");
  const LOCK_AMOUNT_ETH = ethers.parseEther("10");

  beforeAll(async () => {
    fixture = await setupDualChainFixture();

    // Mint and lock FakeETH (dependencies from Tests 1 & 2)
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

    lockBlockNumber = lockReceipt.blockNumber!;
  }, 600000);

  afterAll(async () => {
    if (fixture) {
      await teardownDualChainFixture(fixture);
    }
  });

  it("should generate valid Ethereum state proof for FakeETH lock", async () => {
    console.log("\n[TEST 4] Generating FakeETH lock proof...");

    // Wait for finalization (12 blocks)
    console.log(
      `  Waiting for finalization (12 blocks from ${lockBlockNumber})...`,
    );
    await fixture.eth.testnet.waitForBlocks(12, 180);

    const currentBlock = await fixture.eth.provider.getBlockNumber();
    console.log(
      `  ✓ Block finalized (current: ${currentBlock}, confirmations: ${currentBlock - lockBlockNumber})`,
    );

    // Verify storage key calculation BEFORE generating proof
    console.log("\n  Verifying storage key calculation...");
    const lockBoxArtifact = getLockBoxArtifact();
    const lockBoxContract = new ethers.Contract(
      fixture.eth.contracts.lockBox,
      lockBoxArtifact.abi,
      fixture.eth.signer,
    );

    // Get storage key from contract's helper function
    const onChainStorageKey = await lockBoxContract.calculateStorageKey(
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
    );
    console.log(`    On-chain storage key: ${onChainStorageKey}`);

    // Calculate off-chain
    const offChainStorageKey = calculateStorageKey(
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
    );
    console.log(`    Off-chain storage key: ${offChainStorageKey}`);

    expect(onChainStorageKey).toBe(offChainStorageKey);
    console.log("  ✓ Storage keys match!");

    // Verify we can read the locked balance directly from contract
    const lockedBalanceFromContract = await lockBoxContract.getLockedBalance(
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
    );
    console.log(
      `    Locked balance from contract: ${ethers.formatEther(lockedBalanceFromContract)} FakeETH`,
    );
    expect(lockedBalanceFromContract).toBe(LOCK_AMOUNT_ETH);

    // Test eth_getProof directly BEFORE using our generator
    console.log(
      `\n  Testing eth_getProof directly at block ${lockBlockNumber}...`,
    );
    const blockHex = "0x" + lockBlockNumber.toString(16);
    const rawProof = await fixture.eth.provider.send("eth_getProof", [
      fixture.eth.contracts.lockBox,
      [offChainStorageKey],
      blockHex,
    ]);
    console.log(`    Raw eth_getProof response:`);
    console.log(`      Address: ${rawProof.address}`);
    console.log(`      Storage proofs: ${rawProof.storageProof.length} items`);

    if (rawProof.storageProof[0]) {
      console.log(`      Storage key: ${rawProof.storageProof[0].key}`);
      console.log(`      Storage value: ${rawProof.storageProof[0].value}`);

      const rawStorageValue = BigInt(rawProof.storageProof[0].value);
      expect(rawStorageValue).toBe(LOCK_AMOUNT_ETH);
      console.log(`    ✓ eth_getProof returned correct value!`);
    }

    // Generate proof at the lock block
    console.log(`\n  Generating state proof using our generator...`);
    const proof = await generateLockProof(
      fixture.eth.provider,
      fixture.eth.contracts.lockBox,
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
      lockBlockNumber,
    );

    console.log(`  ✓ Proof generated for block ${proof.blockNumber}`);
    console.log(`    Block hash: ${proof.blockHash}`);
    console.log(`    State root: ${proof.stateRoot}`);
    console.log(`    Account proof nodes: ${proof.accountProof.length}`);
    console.log(`    Storage proof nodes: ${proof.storageProof.length}`);
    console.log(`    Storage key: ${proof.storageKey}`);
    console.log(
      `    Storage value: ${proof.storageValue} (${ethers.formatEther(proof.storageValue)} ETH)`,
    );

    // Detailed validation
    console.log("\n  Validating proof structure...");
    expect(proof.accountProof.length).toBeGreaterThan(0);
    console.log(`    ✓ Account proof has ${proof.accountProof.length} nodes`);

    expect(proof.storageProof.length).toBeGreaterThan(0);
    console.log(`    ✓ Storage proof has ${proof.storageProof.length} nodes`);

    expect(BigInt(proof.storageValue)).toBe(LOCK_AMOUNT_ETH);
    console.log(`    ✓ Storage value matches locked amount`);
  }, 300000); // 5 min for finalization
});
