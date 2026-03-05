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
 * E2E Test 8: Create auction with minted FakeETH on Atomica
 *
 * Extends e2e-07 by calling auction::create_auction after minting FakeETH.
 * Verifies:
 * - Auction is created with correct parameters
 * - Seller's FakeETH balance decreased by auction amount
 * - auction::get_auction returns correct data
 */
describe("E2E 08: Create Auction with Minted FakeETH", () => {
  let fixture: DualChainFixture;

  const MINT_AMOUNT_ETH = ethers.parseEther("1000");
  const LOCK_AMOUNT_ETH = ethers.parseEther("10");
  // 1_000_000_000 FakeETH units minted from 10 ETH lock
  const AUCTION_AMOUNT = 500_000_000n; // Sell half
  const MIN_PRICE = 100n; // 100 FakeUSD per unit
  const AUCTION_DURATION = 300n; // 5 minutes in seconds
  const MPK_BYTES = new Uint8Array(0); // Empty for Demo

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

    // Generate and register proof
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
    const registeredTxn = await fixture.aptos.client.signAndSubmitTransaction({
      signer: fixture.aptos.deployer,
      transaction: registerTxn,
    });
    await fixture.aptos.client.waitForTransaction({
      transactionHash: registeredTxn.hash,
      options: { checkSuccess: true },
    });

    // Calculate lock_id and mint FakeETH on Atomica
    const lockIdData = Buffer.concat([
      Buffer.from(proof.blockHash.slice(2), "hex"),
      Buffer.from(fixture.eth.contracts.lockBox.slice(2), "hex"),
      Buffer.from(fixture.eth.signer.address.slice(2), "hex"),
      Buffer.from(fixture.eth.contracts.fakeETH.slice(2), "hex"),
      Buffer.from(storageKey.slice(2), "hex"),
    ]);
    const lockId = ethers.keccak256(lockIdData);

    const mintTxn = await fixture.aptos.client.transaction.build.simple({
      sender: fixture.aptos.deployer.accountAddress,
      data: {
        function: `${fixture.aptos.moduleAddress}::fake_eth::mint_from_lock`,
        typeArguments: [],
        functionArguments: [ethers.getBytes(lockId)],
      },
    });
    const mintedTxn = await fixture.aptos.client.signAndSubmitTransaction({
      signer: fixture.aptos.deployer,
      transaction: mintTxn,
    });
    await fixture.aptos.client.waitForTransaction({
      transactionHash: mintedTxn.hash,
      options: { checkSuccess: true },
    });
  }, 600000);

  afterAll(async () => {
    if (fixture) {
      await teardownDualChainFixture(fixture);
    }
  });

  it("should create auction with minted FakeETH and verify on-chain state", async () => {
    console.log("\n[TEST 8] Creating auction with FakeETH on Atomica...");

    const deployerAddress = fixture.aptos.deployer.accountAddress.toString();

    // Record seller's FakeETH balance before creating auction
    const balanceBefore = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::fake_eth::balance`,
      [],
      [deployerAddress],
    );
    const balanceBeforeBn = BigInt(balanceBefore[0]);
    console.log(`  FakeETH balance before: ${balanceBeforeBn}`);
    expect(balanceBeforeBn).toBeGreaterThanOrEqual(AUCTION_AMOUNT);

    // Create auction
    const createPayload = {
      function: `${fixture.aptos.moduleAddress}::auction::create_auction`,
      typeArguments: [],
      functionArguments: [
        AUCTION_AMOUNT.toString(),
        MIN_PRICE.toString(),
        AUCTION_DURATION.toString(),
        MPK_BYTES,
      ],
    };

    const createTxn = await fixture.aptos.client.transaction.build.simple({
      sender: fixture.aptos.deployer.accountAddress,
      data: createPayload,
    });
    const createdTxn = await fixture.aptos.client.signAndSubmitTransaction({
      signer: fixture.aptos.deployer,
      transaction: createTxn,
    });
    await fixture.aptos.client.waitForTransaction({
      transactionHash: createdTxn.hash,
      options: { checkSuccess: true },
    });
    console.log(`  ✓ create_auction confirmed: ${createdTxn.hash}`);

    // Verify auction exists
    const auctionExists = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::auction::auction_exists`,
      [],
      [deployerAddress],
    );
    expect(auctionExists[0]).toBe(true);
    console.log(`  ✓ Auction exists at seller address`);

    // Verify auction data: (seller, asset_amount, min_price, end_time, bid_count, settled)
    const auctionData = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::auction::get_auction`,
      [],
      [deployerAddress],
    );
    const [seller, assetAmount, minPrice, , bidCount, settled] = auctionData;
    console.log(`  Auction data:`);
    console.log(`    seller: ${seller}`);
    console.log(`    asset_amount: ${assetAmount}`);
    console.log(`    min_price: ${minPrice}`);
    console.log(`    bid_count: ${bidCount}`);
    console.log(`    settled: ${settled}`);

    expect(seller).toBe(deployerAddress);
    expect(BigInt(assetAmount)).toBe(AUCTION_AMOUNT);
    expect(BigInt(minPrice)).toBe(MIN_PRICE);
    expect(BigInt(bidCount)).toBe(0n);
    expect(settled).toBe(false);
    console.log(`  ✓ Auction parameters match`);

    // Verify seller's FakeETH balance decreased by auction amount
    const balanceAfter = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::fake_eth::balance`,
      [],
      [deployerAddress],
    );
    const balanceAfterBn = BigInt(balanceAfter[0]);
    console.log(`  FakeETH balance after: ${balanceAfterBn}`);
    expect(balanceBeforeBn - balanceAfterBn).toBe(AUCTION_AMOUNT);
    console.log(`  ✓ Seller balance decreased by auction amount`);
  }, 120000);
});
