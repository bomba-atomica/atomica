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
 * E2E Test 7: Claim lock receipt and mint FakeETH on Atomica
 *
 * Extends the e2e-04 flow by calling fake_eth::mint_from_lock after
 * register_ethereum_lock, verifying that Atomica-side FakeETH balance
 * increases proportionally to the locked wei amount.
 *
 * Decimal conversion: 1 ETH locked (10^18 wei) → 10^8 FakeETH units (8 decimals)
 */
describe("E2E 07: Mint FakeETH on Atomica from Lock Receipt", () => {
  let fixture: DualChainFixture;
  let lockId: string;

  const MINT_AMOUNT_ETH = ethers.parseEther("1000");
  const LOCK_AMOUNT_ETH = ethers.parseEther("10");

  beforeAll(async () => {
    fixture = await setupDualChainFixture();

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

    // Mint → approve → lock
    await sendAndWaitForTx(
      fakeEthContract.mint(fixture.eth.signer.address, MINT_AMOUNT_ETH),
      1,
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
    await fixture.eth.testnet.waitForBlocks(12, 180);

    // Generate storage proof
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

    // Register lock on Aptos (admin signs on behalf of user — Demo I-D3)
    const registerPayload = {
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

    const registerTxn = await fixture.aptos.client.transaction.build.simple({
      sender: fixture.aptos.deployer.accountAddress,
      data: registerPayload,
    });
    const registeredTxn = await fixture.aptos.client.signAndSubmitTransaction({
      signer: fixture.aptos.deployer,
      transaction: registerTxn,
    });
    await fixture.aptos.client.waitForTransaction({
      transactionHash: registeredTxn.hash,
      options: { checkSuccess: true },
    });

    // Calculate lock_id for later assertions
    const lockIdData = Buffer.concat([
      Buffer.from(proof.blockHash.slice(2), "hex"),
      Buffer.from(fixture.eth.contracts.lockBox.slice(2), "hex"),
      Buffer.from(fixture.eth.signer.address.slice(2), "hex"),
      Buffer.from(fixture.eth.contracts.fakeETH.slice(2), "hex"),
      Buffer.from(storageKey.slice(2), "hex"),
    ]);
    lockId = ethers.keccak256(lockIdData);
  }, 600000);

  afterAll(async () => {
    if (fixture) {
      await teardownDualChainFixture(fixture);
    }
  });

  it("should mint FakeETH on Atomica from lock receipt", async () => {
    console.log("\n[TEST 7] Minting FakeETH on Atomica from lock receipt...");

    const deployerAddress = fixture.aptos.deployer.accountAddress.toString();

    // Check balance before mint
    const balanceBefore = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::fake_eth::balance`,
      [],
      [deployerAddress],
    );
    console.log(`  Balance before: ${balanceBefore[0]}`);

    // Call mint_from_lock
    const mintPayload = {
      function: `${fixture.aptos.moduleAddress}::fake_eth::mint_from_lock`,
      typeArguments: [],
      functionArguments: [ethers.getBytes(lockId)],
    };

    const mintTxn = await fixture.aptos.client.transaction.build.simple({
      sender: fixture.aptos.deployer.accountAddress,
      data: mintPayload,
    });
    const mintedTxn = await fixture.aptos.client.signAndSubmitTransaction({
      signer: fixture.aptos.deployer,
      transaction: mintTxn,
    });
    await fixture.aptos.client.waitForTransaction({
      transactionHash: mintedTxn.hash,
      options: { checkSuccess: true },
    });
    console.log(`  ✓ mint_from_lock confirmed: ${mintedTxn.hash}`);

    // Check balance after mint
    const balanceAfter = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::fake_eth::balance`,
      [],
      [deployerAddress],
    );
    console.log(`  Balance after: ${balanceAfter[0]}`);

    const minted = BigInt(balanceAfter[0]) - BigInt(balanceBefore[0]);
    console.log(`  Minted: ${minted} FakeETH units (8 decimals)`);

    // 10 ETH locked = 10 * 10^18 wei / 10^10 = 10 * 10^8 = 1_000_000_000 units
    const EXPECTED_MINTED = 1_000_000_000n;
    expect(minted).toBe(EXPECTED_MINTED);
    console.log(`  ✓ Minted amount matches expected (${EXPECTED_MINTED})`);

    // Verify receipt is now STATUS_CLAIMED (1)
    const receipt = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::lock_receipt::get_receipt`,
      [
        `${fixture.aptos.moduleAddress}::lock_receipt::Ethereum`,
        `${fixture.aptos.moduleAddress}::lock_receipt::FakeETH`,
      ],
      [ethers.getBytes(lockId)],
    );
    const [, , , receiptStatus] = receipt;
    expect(receiptStatus).toBe(1); // STATUS_CLAIMED
    console.log(`  ✓ Receipt status is CLAIMED (1)`);
  }, 120000);
});
