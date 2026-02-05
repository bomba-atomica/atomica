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
import { viewFunction } from "./helpers/aptos-view-utils";

/**
 * E2E Test 6: Verify Type Isolation Between FakeETH and FakeUSD
 *
 * Verifies that:
 * - FakeETH and FakeUSD registries are separate
 * - Receipts are tracked independently by asset type
 * - Phantom types correctly isolate registries
 */
describe("E2E 06: Type Isolation", () => {
  let fixture: DualChainFixture;

  const MINT_AMOUNT_ETH = ethers.parseEther("1000");
  const LOCK_AMOUNT_ETH = ethers.parseEther("10");

  beforeAll(async () => {
    fixture = await setupDualChainFixture();

    // Submit FakeETH proof only (dependency from Test 5)
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

    const proof = await generateLockProof(
      fixture.eth.provider,
      fixture.eth.contracts.lockBox,
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
      lockBlockNumber,
    );

    const storageKey = calculateStorageKey(
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
    );

    // Submit FakeETH proof to Aptos
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

  it("should maintain separate registries for FakeETH and FakeUSD", async () => {
    console.log("\n[TEST 6] Verifying type isolation...");

    // Check FakeETH registry
    const ethCount = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::lock_receipt::get_receipt_count`,
      [
        `${fixture.aptos.moduleAddress}::lock_receipt::Ethereum`,
        `${fixture.aptos.moduleAddress}::lock_receipt::FakeETH`,
      ],
      [],
    );

    // Check FakeUSD registry
    const usdCount = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::lock_receipt::get_receipt_count`,
      [
        `${fixture.aptos.moduleAddress}::lock_receipt::Ethereum`,
        `${fixture.aptos.moduleAddress}::lock_receipt::FakeUSD`,
      ],
      [],
    );

    console.log(`  FakeETH receipts: ${ethCount[0]}`);
    console.log(`  FakeUSD receipts: ${usdCount[0]}`);

    expect(ethCount[0].toString()).toBe("1");
    expect(usdCount[0].toString()).toBe("0"); // No FakeUSD receipts yet
    console.log("  ✓ Registries are properly isolated");
  }, 30000);
});
