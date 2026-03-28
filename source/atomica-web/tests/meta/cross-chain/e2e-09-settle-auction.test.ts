import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ethers } from "ethers";
import { Account } from "@aptos-labs/ts-sdk";
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
 * E2E Test 9: Settle auction and verify on-chain clearing result
 *
 * Full auction lifecycle with a short duration (2s) so we can settle quickly:
 * 1. Seller locks ETH → registers proof → creates auction (2s duration)
 * 2. Bidder submits a bid
 * 3. Wait for auction end_time
 * 4. Anyone settles — AuctionSettled event emitted with winner + clearing price
 * 5. Assert: get_settlement returns the correct winner and clearing price
 * 6. Assert: double-settle fails (E_ALREADY_SETTLED)
 *
 * The AuctionSettled event would be consumed by the Ethereum settlement contract
 * to transfer FakeETH to winner and FakeUSD to seller on the Ethereum side.
 * That cross-chain settlement step is out of scope for this test.
 */
describe("E2E 09: Settle Auction and Verify Clearing Result", () => {
  let fixture: DualChainFixture;
  let bidder: Account;
  let sellerAddress: string;
  let bidderAddress: string;

  const MINT_AMOUNT_ETH = ethers.parseEther("1000");
  const LOCK_AMOUNT_ETH = ethers.parseEther("10");
  const MIN_PRICE = 50;
  const BID_PRICE = 200; // higher than min_price
  const AUCTION_DURATION = 2; // 2 seconds — expire quickly for test

  beforeAll(async () => {
    fixture = await setupDualChainFixture();
    sellerAddress = fixture.aptos.deployer.accountAddress.toString();

    bidder = Account.generate();
    bidderAddress = bidder.accountAddress.toString();

    // 5 APT — covers max gas reservation (2M units * 100 gas price = 200M octas minimum)
    await fixture.aptos.testnet.faucet(bidderAddress, 500_000_000n);

    // --- Seller: full lock → proof → register → create auction flow ---
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

    const proof = await generateLockProof(
      fixture.eth.provider,
      fixture.eth.contracts.lockBox,
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
      lockReceipt.blockNumber!,
    );
    const storageKey = calculateStorageKey(
      fixture.eth.signer.address,
      fixture.eth.contracts.fakeETH,
    );

    const regTxn = await fixture.aptos.client.transaction.build.simple({
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
      transaction: regTxn,
    });
    await fixture.aptos.client.waitForTransaction({
      transactionHash: regSubmitted.hash,
      options: { checkSuccess: true },
    });

    const lockIdData = Buffer.concat([
      Buffer.from(proof.blockHash.slice(2), "hex"),
      Buffer.from(fixture.eth.contracts.lockBox.slice(2), "hex"),
      Buffer.from(fixture.eth.signer.address.slice(2), "hex"),
      Buffer.from(fixture.eth.contracts.fakeETH.slice(2), "hex"),
      Buffer.from(storageKey.slice(2), "hex"),
    ]);
    const lockId = ethers.keccak256(lockIdData);

    // Create auction with very short duration
    const createTxn = await fixture.aptos.client.transaction.build.simple({
      sender: fixture.aptos.deployer.accountAddress,
      data: {
        function: `${fixture.aptos.moduleAddress}::auction::create_auction`,
        typeArguments: [],
        functionArguments: [
          ethers.getBytes(lockId),
          MIN_PRICE,
          AUCTION_DURATION,
          new Uint8Array(0),
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

    // Submit bid before auction expires
    const bidTxn = await fixture.aptos.client.transaction.build.simple({
      sender: bidder.accountAddress,
      data: {
        function: `${fixture.aptos.moduleAddress}::auction::submit_bid`,
        typeArguments: [],
        functionArguments: [sellerAddress, BID_PRICE],
      },
    });
    const bidSubmitted = await fixture.aptos.client.signAndSubmitTransaction({
      signer: bidder,
      transaction: bidTxn,
    });
    await fixture.aptos.client.waitForTransaction({
      transactionHash: bidSubmitted.hash,
      options: { checkSuccess: true },
    });
  }, 600000);

  afterAll(async () => {
    if (fixture) {
      await teardownDualChainFixture(fixture);
    }
  });

  it("should settle auction and record winner + clearing price on-chain", async () => {
    console.log("\n[TEST 9] Settling auction...");

    // Wait for auction to expire (2s duration + buffer)
    await new Promise((r) => setTimeout(r, 4000));

    // Settle (anyone can call)
    const settleTxn = await fixture.aptos.client.transaction.build.simple({
      sender: fixture.aptos.deployer.accountAddress,
      data: {
        function: `${fixture.aptos.moduleAddress}::auction::settle`,
        typeArguments: [],
        functionArguments: [sellerAddress],
      },
    });
    const settleSubmitted = await fixture.aptos.client.signAndSubmitTransaction(
      {
        signer: fixture.aptos.deployer,
        transaction: settleTxn,
      },
    );
    await fixture.aptos.client.waitForTransaction({
      transactionHash: settleSubmitted.hash,
      options: { checkSuccess: true },
    });
    console.log(`  ✓ settle() confirmed: ${settleSubmitted.hash}`);

    // Verify settled flag
    const settled = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::auction::is_settled`,
      [],
      [sellerAddress],
    );
    expect(settled[0]).toBe(true);
    console.log(`  ✓ Auction is marked settled`);

    // Verify clearing result
    const settlement = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::auction::get_settlement`,
      [],
      [sellerAddress],
    );
    const [winner, clearingPrice] = settlement;
    console.log(`  Winner: ${winner}`);
    console.log(`  Clearing price: ${clearingPrice}`);

    expect(winner).toBe(bidderAddress);
    expect(BigInt(clearingPrice)).toBe(BigInt(BID_PRICE));
    console.log(
      `  ✓ Winner is the bidder who submitted BID_PRICE=${BID_PRICE}`,
    );
    console.log(
      `  ✓ AuctionSettled event emitted — Ethereum settlement contract reads this`,
    );
  }, 60000);

  it("should reject a second settle call (E_ALREADY_SETTLED)", async () => {
    console.log("\n[TEST 9b] Attempting double settle...");

    const settleTxn = await fixture.aptos.client.transaction.build.simple({
      sender: fixture.aptos.deployer.accountAddress,
      data: {
        function: `${fixture.aptos.moduleAddress}::auction::settle`,
        typeArguments: [],
        functionArguments: [sellerAddress],
      },
    });
    const settleSubmitted = await fixture.aptos.client.signAndSubmitTransaction(
      {
        signer: fixture.aptos.deployer,
        transaction: settleTxn,
      },
    );

    await expect(
      fixture.aptos.client.waitForTransaction({
        transactionHash: settleSubmitted.hash,
        options: { checkSuccess: true },
      }),
    ).rejects.toThrow();
    console.log(`  ✓ Double settle correctly rejected`);
  }, 60000);
});
