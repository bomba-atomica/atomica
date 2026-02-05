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
import { ethereumToAptosAddress } from "../../../src/lib/ethereum/address-converter";
import {
  setupDualChainFixture,
  teardownDualChainFixture,
  DualChainFixture,
} from "./helpers/dual-chain-fixture";
import { viewFunction } from "./helpers/aptos-view-utils";

/**
 * E2E Test 4: Submit FakeETH Proof to Aptos and Create Lock Receipt
 *
 * Verifies that:
 * - Ethereum proof can be submitted to Aptos
 * - Lock receipt is created with correct data
 * - Lock is marked as claimed
 * - Receipt count is updated
 */
describe("E2E 04: Submit Proof to Aptos", () => {
  let fixture: DualChainFixture;
  let lockBlockNumber: number;
  let proof: any;

  const MINT_AMOUNT_ETH = ethers.parseEther("1000");
  const LOCK_AMOUNT_ETH = ethers.parseEther("10");

  beforeAll(async () => {
    fixture = await setupDualChainFixture();

    // Mint, lock, and generate proof (dependencies from Tests 1, 2, 4)
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

    // Wait for finalization
    await fixture.eth.testnet.waitForBlocks(12, 180);

    // Generate proof
    proof = await generateLockProof(
      fixture.eth.provider,
      fixture.eth.contracts.lockBox,
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
      lockBlockNumber,
    );
  }, 600000);

  afterAll(async () => {
    if (fixture) {
      await teardownDualChainFixture(fixture);
    }
  });

  it("should submit FakeETH proof to Aptos and create lock receipt", async () => {
    console.log("\n[TEST 4] Submitting FakeETH proof to Aptos...");

    // Calculate storage key
    const storageKey = calculateStorageKey(
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
    );
    console.log(`  Storage key: ${storageKey}`);

    // Verify storage key matches proof
    expect(storageKey).toBe(proof.storageKey);
    console.log(`  ✓ Storage key verified`);

    // Convert Ethereum address to Aptos format
    const aptosUserAddress = ethereumToAptosAddress(fixture.eth.signer.address);
    console.log(`  Aptos user address: ${aptosUserAddress}`);

    // Submit proof to Aptos
    console.log("\n  Building proof transaction...");

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

    console.log(`  Transaction payload:`);
    console.log(`    Function: ${payload.function}`);
    console.log(`    Block number: ${payload.functionArguments[0]}`);
    console.log(`    Storage value: ${payload.functionArguments[7]}`);
    console.log(
      `    Account proof nodes: ${payload.functionArguments[8].length}`,
    );
    console.log(
      `    Storage proof nodes: ${payload.functionArguments[9].length}`,
    );

    console.log("\n  Submitting transaction...");
    const txn = await fixture.aptos.client.transaction.build.simple({
      sender: fixture.aptos.deployer.accountAddress,
      data: payload,
    });

    const committedTxn = await fixture.aptos.client.signAndSubmitTransaction({
      signer: fixture.aptos.deployer,
      transaction: txn,
    });

    console.log(`  ✓ Transaction submitted: ${committedTxn.hash}`);

    const result = await fixture.aptos.client.waitForTransaction({
      transactionHash: committedTxn.hash,
      options: { checkSuccess: true },
    });
    console.log(`  ✓ Transaction confirmed in block ${result.version}`);

    // Verify receipt was created
    console.log("\n  Verifying receipt on Aptos...");

    // Calculate lock_id
    console.log("  Calculating lock ID...");
    const lockIdData = Buffer.concat([
      Buffer.from(proof.blockHash.slice(2), "hex"),
      Buffer.from(fixture.eth.contracts.lockBox.slice(2), "hex"),
      Buffer.from(fixture.eth.signer.address.slice(2), "hex"),
      Buffer.from(fixture.eth.contracts.fakeETH.slice(2), "hex"),
      Buffer.from(storageKey.slice(2), "hex"),
    ]);
    const lockId = ethers.keccak256(lockIdData);
    console.log(`    Lock ID: ${lockId}`);

    // Check if lock is claimed
    console.log("\n  Checking if lock is claimed...");
    const isClaimed = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::lock_receipt::is_lock_claimed`,
      [
        `${fixture.aptos.moduleAddress}::lock_receipt::Ethereum`,
        `${fixture.aptos.moduleAddress}::lock_receipt::FakeETH`,
      ],
      [ethers.getBytes(lockId)],
    );
    expect(isClaimed[0]).toBe(true);
    console.log("  ✓ Lock marked as claimed");

    // Get receipt details
    console.log("\n  Fetching receipt details...");
    const receipt = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::lock_receipt::get_receipt`,
      [
        `${fixture.aptos.moduleAddress}::lock_receipt::Ethereum`,
        `${fixture.aptos.moduleAddress}::lock_receipt::FakeETH`,
      ],
      [ethers.getBytes(lockId)],
    );
    expect(receipt.length).toBeGreaterThan(0);

    const [receiptUser, receiptAmount, receiptBlock, receiptStatus] = receipt;
    console.log(`    Receipt user: ${receiptUser}`);
    console.log(`    Receipt amount: ${receiptAmount}`);
    console.log(`    Receipt block: ${receiptBlock}`);
    console.log(`    Receipt status: ${receiptStatus} (0=ACTIVE)`);

    // Detailed validation
    console.log("\n  Validating receipt data...");

    expect(receiptAmount.toString()).toBe(proof.storageValue.toString());
    console.log(`    ✓ Amount matches proof`);

    expect(receiptBlock.toString()).toBe(proof.blockNumber.toString());
    console.log(`    ✓ Block number matches proof`);

    expect(receiptStatus).toBe(0); // ACTIVE
    console.log(`    ✓ Status is ACTIVE`);

    // Check registry metrics
    console.log("\n  Checking registry metrics...");
    const receiptCount = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::lock_receipt::get_receipt_count`,
      [
        `${fixture.aptos.moduleAddress}::lock_receipt::Ethereum`,
        `${fixture.aptos.moduleAddress}::lock_receipt::FakeETH`,
      ],
      [],
    );
    expect(receiptCount[0].toString()).toBe("1");
    console.log(`    ✓ Receipt count: ${receiptCount[0]}`);
  }, 300000);
});
