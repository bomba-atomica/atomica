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
 * E2E Test 7: Create auction directly from a LockReceipt (canonical flow)
 *
 * FakeETH and FakeUSD exist only on Ethereum. On Aptos, a lock is represented
 * by a LockReceipt<Ethereum, FakeETH>. auction::create_auction consumes that
 * receipt (proving the seller locked assets on Ethereum) and opens the auction.
 * No Aptos-side FA minting is involved.
 *
 * Flow:
 *   1. Mint FakeETH on Ethereum
 *   2. Lock FakeETH in LockBox
 *   3. Generate storage proof
 *   4. register_ethereum_lock<FakeETH> → LockReceipt created in registry
 *   5. create_auction(lock_id, ...) → receipt claimed, Auction stored at seller address
 *   6. Assert: auction exists with correct amount (in wei from receipt)
 *   7. Assert: receipt is now STATUS_CLAIMED
 */
describe("E2E 07: Create Auction from Ethereum Lock Receipt", () => {
  let fixture: DualChainFixture;
  let lockId: string;
  let storageValue: bigint;

  const MINT_AMOUNT_ETH = ethers.parseEther("1000");
  const LOCK_AMOUNT_ETH = ethers.parseEther("10");
  const MIN_PRICE = 100; // 100 FakeUSD per unit
  const AUCTION_DURATION = 300; // 5 minutes

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

    // Mint → approve → lock on Ethereum
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

    await fixture.eth.testnet.waitForBlocks(12, 180);

    // Generate storage proof
    const proof = await generateLockProof(
      fixture.eth.provider,
      fixture.eth.contracts.lockBox,
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
      lockReceipt.blockNumber!,
    );
    storageValue = proof.storageValue;

    const storageKey = calculateStorageKey(
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
    );

    // Register lock on Aptos (admin/fee-payer signs — Demo I-D3)
    const registerTxn = await fixture.aptos.client.transaction.build.simple({
      sender: fixture.aptos.deployer.accountAddress,
      data: {
        function: `${fixture.aptos.moduleAddress}::lock_receipt::register_ethereum_lock`,
        typeArguments: [
          `${fixture.aptos.moduleAddress}::lock_receipt::FakeETH`,
        ],
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
      },
    });
    const regSubmitted = await fixture.aptos.client.signAndSubmitTransaction({
      signer: fixture.aptos.deployer,
      transaction: registerTxn,
    });
    await fixture.aptos.client.waitForTransaction({
      transactionHash: regSubmitted.hash,
      options: { checkSuccess: true },
    });

    // Compute lock_id
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

  it("should create auction by consuming the LockReceipt", async () => {
    console.log(
      "\n[TEST 7] Creating auction from LockReceipt (canonical flow)...",
    );

    const sellerAddress = fixture.aptos.deployer.accountAddress.toString();

    // Verify receipt is ACTIVE before creating auction
    const receiptBefore = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::lock_receipt::get_receipt`,
      [
        `${fixture.aptos.moduleAddress}::lock_receipt::Ethereum`,
        `${fixture.aptos.moduleAddress}::lock_receipt::FakeETH`,
      ],
      [ethers.getBytes(lockId)],
    );
    const [, , , statusBefore] = receiptBefore;
    expect(statusBefore).toBe(0); // STATUS_ACTIVE
    console.log(`  ✓ Receipt is ACTIVE before auction creation`);

    // Create auction — this claims the receipt
    const createTxn = await fixture.aptos.client.transaction.build.simple({
      sender: fixture.aptos.deployer.accountAddress,
      data: {
        function: `${fixture.aptos.moduleAddress}::auction::create_auction`,
        typeArguments: [],
        functionArguments: [
          ethers.getBytes(lockId),
          MIN_PRICE,
          AUCTION_DURATION,
          new Uint8Array(0), // mpk_bytes: empty for Demo
        ],
      },
    });
    const createSubmitted = await fixture.aptos.client.signAndSubmitTransaction(
      {
        signer: fixture.aptos.deployer,
        transaction: createTxn,
      },
    );
    await fixture.aptos.client.waitForTransaction({
      transactionHash: createSubmitted.hash,
      options: { checkSuccess: true },
    });
    console.log(`  ✓ create_auction confirmed: ${createSubmitted.hash}`);

    // Verify auction exists
    const exists = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::auction::auction_exists`,
      [],
      [sellerAddress],
    );
    expect(exists[0]).toBe(true);
    console.log(`  ✓ Auction exists at seller address`);

    // Verify auction data
    const auctionData = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::auction::get_auction`,
      [],
      [sellerAddress],
    );
    const [seller, amount, , minPrice, , bidCount, settled] = auctionData;
    console.log(
      `  Auction: seller=${seller}, amount=${amount}, min_price=${minPrice}`,
    );

    expect(seller).toBe(sellerAddress);
    // amount is the wei value from the receipt (same as storageValue)
    expect(BigInt(amount)).toBe(storageValue);
    expect(BigInt(minPrice)).toBe(BigInt(MIN_PRICE));
    expect(BigInt(bidCount)).toBe(0n);
    expect(settled).toBe(false);
    console.log(`  ✓ Auction amount matches locked wei: ${storageValue}`);

    // Verify receipt is now STATUS_CLAIMED (consumed by create_auction)
    const receiptAfter = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::lock_receipt::get_receipt`,
      [
        `${fixture.aptos.moduleAddress}::lock_receipt::Ethereum`,
        `${fixture.aptos.moduleAddress}::lock_receipt::FakeETH`,
      ],
      [ethers.getBytes(lockId)],
    );
    const [, , , statusAfter] = receiptAfter;
    expect(statusAfter).toBe(1); // STATUS_CLAIMED
    console.log(`  ✓ Receipt is CLAIMED — consumed by create_auction`);
  }, 120000);
});
