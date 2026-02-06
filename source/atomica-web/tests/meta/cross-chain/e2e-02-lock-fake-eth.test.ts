import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ethers } from "ethers";
import {
  getFakeETHArtifact,
  getLockBoxArtifact,
} from "../ethereum/solidity-compiler";
import { sendAndWaitForTx } from "../helpers/transaction-utils";
import {
  setupDualChainFixture,
  teardownDualChainFixture,
  DualChainFixture,
} from "./helpers/dual-chain-fixture";

/**
 * E2E Test 2: Lock FakeETH in LockBox Contract
 *
 * Verifies that:
 * - FakeETH can be approved for LockBox
 * - FakeETH can be locked in LockBox
 * - Locked balance is correctly stored and retrievable
 * - Storage layout works with eth_getStorageAt
 */
describe("E2E 02: Lock FakeETH in LockBox", () => {
  let fixture: DualChainFixture;

  const MINT_AMOUNT_ETH = ethers.parseEther("1000");
  const LOCK_AMOUNT_ETH = ethers.parseEther("10");

  beforeAll(async () => {
    fixture = await setupDualChainFixture();

    // Mint FakeETH first (dependency from Test 1)
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
  }, 600000);

  afterAll(async () => {
    if (fixture) {
      await teardownDualChainFixture(fixture);
    }
  });

  it("should lock FakeETH in LockBox contract", async () => {
    console.log("\n[TEST 2] Locking FakeETH...");

    const fakeETHArtifact = getFakeETHArtifact();
    const fakeEthContract = new ethers.Contract(
      fixture.eth.contracts.fakeETH,
      fakeETHArtifact.abi,
      fixture.eth.signer,
    );

    const lockBoxArtifact = getLockBoxArtifact();
    const lockBoxContract = new ethers.Contract(
      fixture.eth.contracts.lockBox,
      lockBoxArtifact.abi,
      fixture.eth.signer,
    );

    // Use nonce management for sequential transactions
    let nonce = await fixture.eth.signer.getNonce();

    // Approve
    console.log(
      `  Approving LockBox to spend ${ethers.formatEther(LOCK_AMOUNT_ETH)} FakeETH...`,
    );
    const approveReceipt = await sendAndWaitForTx(
      fakeEthContract.approve(fixture.eth.contracts.lockBox, LOCK_AMOUNT_ETH, {
        nonce: nonce++,
      }),
      1,
    );
    console.log(`  ✓ Approved (status: ${approveReceipt.status})`);

    // Lock
    console.log(`  Locking ${ethers.formatEther(LOCK_AMOUNT_ETH)} FakeETH...`);
    const lockReceipt = await sendAndWaitForTx(
      lockBoxContract.lock(fixture.eth.contracts.fakeETH, LOCK_AMOUNT_ETH, {
        nonce: nonce++,
      }),
      1,
    );
    console.log(
      `  ✓ Tx hash: ${lockReceipt.hash} (status: ${lockReceipt.status})`,
    );
    console.log(`  ✓ Block: ${lockReceipt.blockNumber}`);

    // Verify locked balance using contract getter
    const lockedBalance = await lockBoxContract.getLockedBalance(
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
    );
    expect(lockedBalance).toBe(LOCK_AMOUNT_ETH);
    console.log(
      `  ✓ Locked balance: ${ethers.formatEther(lockedBalance)} FakeETH`,
    );

    // Verify storage key calculation
    console.log("\n  Verifying storage layout...");
    const lockKey = await lockBoxContract.getLockKey(
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
    );
    console.log(`    Lock key (composite): ${lockKey}`);

    const storageKey = await lockBoxContract.calculateStorageKey(
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
    );
    console.log(`    Storage key (slot 0): ${storageKey}`);

    // Try to read storage directly using eth_getStorageAt
    const storageValue = await fixture.eth.provider.getStorage(
      fixture.eth.contracts.lockBox,
      storageKey,
    );
    console.log(`    Direct storage read: ${storageValue}`);
    const storageValueBigInt = BigInt(storageValue);
    console.log(
      `    Storage value as uint256: ${storageValueBigInt} (${ethers.formatEther(storageValueBigInt)} ETH)`,
    );

    expect(storageValueBigInt).toBe(LOCK_AMOUNT_ETH);
    console.log(`  ✓ Storage value verified via eth_getStorageAt`);
  }, 60000);
});
