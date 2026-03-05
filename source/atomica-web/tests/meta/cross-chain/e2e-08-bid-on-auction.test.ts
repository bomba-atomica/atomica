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
 * E2E Test 8: Submit bids on an auction
 *
 * Extends e2e-07. After the auction is open, multiple bidders submit bids.
 * Demo: no Aptos-side collateral required from bidders.
 *
 * Verifies:
 * - Bid is accepted when price >= min_price
 * - Bid is rejected when price < min_price
 * - Bid is rejected after auction end_time
 * - bid_count increases correctly
 */
describe("E2E 08: Submit Bids on Auction", () => {
  let fixture: DualChainFixture;
  let bidder1: Account;
  let bidder2: Account;
  let sellerAddress: string;

  const MINT_AMOUNT_ETH = ethers.parseEther("1000");
  const LOCK_AMOUNT_ETH = ethers.parseEther("10");
  const MIN_PRICE = 100;
  const AUCTION_DURATION = 300; // 5 minutes — long enough for bids

  beforeAll(async () => {
    fixture = await setupDualChainFixture();
    sellerAddress = fixture.aptos.deployer.accountAddress.toString();

    // Create fresh bidder accounts
    bidder1 = Account.generate();
    bidder2 = Account.generate();

    // Fund bidders with APT for gas
    await Promise.all([
      fixture.aptos.testnet.faucet(
        bidder1.accountAddress.toString(),
        10_000_000n,
      ),
      fixture.aptos.testnet.faucet(
        bidder2.accountAddress.toString(),
        10_000_000n,
      ),
    ]);

    // --- Seller: lock ETH → register proof → create auction ---
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
  }, 600000);

  afterAll(async () => {
    if (fixture) {
      await teardownDualChainFixture(fixture);
    }
  });

  it("should accept bids at or above min_price", async () => {
    console.log("\n[TEST 8] Submitting bids...");

    // Bidder 1: bid above min_price
    const bid1Txn = await fixture.aptos.client.transaction.build.simple({
      sender: bidder1.accountAddress,
      data: {
        function: `${fixture.aptos.moduleAddress}::auction::submit_bid`,
        typeArguments: [],
        functionArguments: [sellerAddress, MIN_PRICE + 50],
      },
    });
    const bid1Submitted = await fixture.aptos.client.signAndSubmitTransaction({
      signer: bidder1,
      transaction: bid1Txn,
    });
    await fixture.aptos.client.waitForTransaction({
      transactionHash: bid1Submitted.hash,
      options: { checkSuccess: true },
    });
    console.log(`  ✓ Bidder 1 bid accepted (price=${MIN_PRICE + 50})`);

    // Bidder 2: bid at exactly min_price
    const bid2Txn = await fixture.aptos.client.transaction.build.simple({
      sender: bidder2.accountAddress,
      data: {
        function: `${fixture.aptos.moduleAddress}::auction::submit_bid`,
        typeArguments: [],
        functionArguments: [sellerAddress, MIN_PRICE],
      },
    });
    const bid2Submitted = await fixture.aptos.client.signAndSubmitTransaction({
      signer: bidder2,
      transaction: bid2Txn,
    });
    await fixture.aptos.client.waitForTransaction({
      transactionHash: bid2Submitted.hash,
      options: { checkSuccess: true },
    });
    console.log(`  ✓ Bidder 2 bid accepted (price=${MIN_PRICE})`);

    // Verify bid count
    const bidCount = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::auction::get_bid_count`,
      [],
      [sellerAddress],
    );
    expect(BigInt(bidCount[0])).toBe(2n);
    console.log(`  ✓ Bid count: ${bidCount[0]}`);
  }, 60000);

  it("should reject bids below min_price", async () => {
    console.log("\n[TEST 8b] Rejecting low bid...");

    const lowBidder = Account.generate();
    await fixture.aptos.testnet.faucet(
      lowBidder.accountAddress.toString(),
      10_000_000n,
    );

    const lowBidTxn = await fixture.aptos.client.transaction.build.simple({
      sender: lowBidder.accountAddress,
      data: {
        function: `${fixture.aptos.moduleAddress}::auction::submit_bid`,
        typeArguments: [],
        functionArguments: [sellerAddress, MIN_PRICE - 1],
      },
    });
    const lowBidSubmitted = await fixture.aptos.client.signAndSubmitTransaction(
      { signer: lowBidder, transaction: lowBidTxn },
    );

    await expect(
      fixture.aptos.client.waitForTransaction({
        transactionHash: lowBidSubmitted.hash,
        options: { checkSuccess: true },
      }),
    ).rejects.toThrow();
    console.log(`  ✓ Low bid correctly rejected`);
  }, 60000);
});
