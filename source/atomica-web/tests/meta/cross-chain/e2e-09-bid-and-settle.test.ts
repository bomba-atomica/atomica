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
 * E2E Test 9: Submit bid, settle auction, verify transfers
 *
 * Full auction lifecycle:
 * 1. Seller: lock ETH → mint → create auction (short duration)
 * 2. Bidder: fund with FakeUSD (via Aptos faucet mint), submit bid
 * 3. Wait for auction end_time
 * 4. Anyone: settle auction
 * 5. Assert: winner received FakeETH, seller received FakeUSD, losers refunded
 *
 * Uses a very short auction duration (2s) so we don't have to wait long.
 */
describe("E2E 09: Bid and Settle Auction", () => {
  let fixture: DualChainFixture;
  let bidderAccount: Account;

  const MINT_AMOUNT_ETH = ethers.parseEther("1000");
  const LOCK_AMOUNT_ETH = ethers.parseEther("10");
  // 10 ETH → 1_000_000_000 FakeETH units on Aptos
  const AUCTION_AMOUNT = 1_000_000_000n;
  const MIN_PRICE = 50n;
  const AUCTION_DURATION = 2n; // 2 seconds — settle immediately after
  const BID_PRICE = 200n; // above min_price
  const COLLATERAL = 500n; // covers bid price with some extra

  // FakeUSD to give bidder via Aptos admin mint (legacy faucet path)
  const BIDDER_FAKEUSD = 1_000n;

  beforeAll(async () => {
    fixture = await setupDualChainFixture();

    // Create a fresh bidder account on Aptos
    bidderAccount = Account.generate();

    // Fund bidder with APT for gas
    await fixture.aptos.testnet.faucet(
      bidderAccount.accountAddress.toString(),
      10_000_000n,
    );

    // Mint FakeUSD to bidder: fake_usd::mint takes (account: &signer, amount: u64)
    // and mints to the caller. Bidder calls it directly.
    const bidderMintUsdTxn =
      await fixture.aptos.client.transaction.build.simple({
        sender: bidderAccount.accountAddress,
        data: {
          function: `${fixture.aptos.moduleAddress}::fake_usd::mint`,
          typeArguments: [],
          functionArguments: [BIDDER_FAKEUSD.toString()],
        },
      });
    const bidderMintedTxn = await fixture.aptos.client.signAndSubmitTransaction(
      {
        signer: bidderAccount,
        transaction: bidderMintUsdTxn,
      },
    );
    await fixture.aptos.client.waitForTransaction({
      transactionHash: bidderMintedTxn.hash,
      options: { checkSuccess: true },
    });

    // --- Seller flow: Ethereum lock → Atomica mint ---
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

    // Register lock
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

    // Mint FakeETH on Aptos
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
    const mintSubmitted = await fixture.aptos.client.signAndSubmitTransaction({
      signer: fixture.aptos.deployer,
      transaction: mintTxn,
    });
    await fixture.aptos.client.waitForTransaction({
      transactionHash: mintSubmitted.hash,
      options: { checkSuccess: true },
    });

    // Create auction with short duration (2 seconds)
    const createTxn = await fixture.aptos.client.transaction.build.simple({
      sender: fixture.aptos.deployer.accountAddress,
      data: {
        function: `${fixture.aptos.moduleAddress}::auction::create_auction`,
        typeArguments: [],
        functionArguments: [
          AUCTION_AMOUNT.toString(),
          MIN_PRICE.toString(),
          AUCTION_DURATION.toString(),
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

  it("should accept a bid, settle, and transfer assets correctly", async () => {
    console.log("\n[TEST 9] Bidding and settling auction...");

    const sellerAddress = fixture.aptos.deployer.accountAddress.toString();
    const bidderAddress = bidderAccount.accountAddress.toString();

    // Record balances before bid
    const sellerEthBefore = BigInt(
      (
        await viewFunction(
          fixture.aptos.client,
          `${fixture.aptos.moduleAddress}::fake_eth::balance`,
          [],
          [sellerAddress],
        )
      )[0],
    );
    const sellerUsdBefore = BigInt(
      (
        await viewFunction(
          fixture.aptos.client,
          `${fixture.aptos.moduleAddress}::fake_usd::balance`,
          [],
          [sellerAddress],
        )
      )[0],
    );
    const bidderEthBefore = BigInt(
      (
        await viewFunction(
          fixture.aptos.client,
          `${fixture.aptos.moduleAddress}::fake_eth::balance`,
          [],
          [bidderAddress],
        )
      )[0],
    );
    const bidderUsdBefore = BigInt(
      (
        await viewFunction(
          fixture.aptos.client,
          `${fixture.aptos.moduleAddress}::fake_usd::balance`,
          [],
          [bidderAddress],
        )
      )[0],
    );
    console.log(
      `  Seller ETH before: ${sellerEthBefore}, USD before: ${sellerUsdBefore}`,
    );
    console.log(
      `  Bidder ETH before: ${bidderEthBefore}, USD before: ${bidderUsdBefore}`,
    );

    // Submit bid (auction has 2s duration, so likely already expired — submit before that)
    const bidTxn = await fixture.aptos.client.transaction.build.simple({
      sender: bidderAccount.accountAddress,
      data: {
        function: `${fixture.aptos.moduleAddress}::auction::submit_bid`,
        typeArguments: [],
        functionArguments: [
          sellerAddress,
          COLLATERAL.toString(),
          BID_PRICE.toString(),
        ],
      },
    });
    const bidSubmitted = await fixture.aptos.client.signAndSubmitTransaction({
      signer: bidderAccount,
      transaction: bidTxn,
    });
    await fixture.aptos.client.waitForTransaction({
      transactionHash: bidSubmitted.hash,
      options: { checkSuccess: true },
    });
    console.log(`  ✓ Bid submitted: ${bidSubmitted.hash}`);

    // Wait for auction to expire (it's 2s; Aptos block time is ~1s)
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
    console.log(`  ✓ Settle confirmed: ${settleSubmitted.hash}`);

    // Check settled state
    const isSettled = await viewFunction(
      fixture.aptos.client,
      `${fixture.aptos.moduleAddress}::auction::is_settled`,
      [],
      [sellerAddress],
    );
    expect(isSettled[0]).toBe(true);
    console.log(`  ✓ Auction is settled`);

    // Verify balances after settlement
    const bidderEthAfter = BigInt(
      (
        await viewFunction(
          fixture.aptos.client,
          `${fixture.aptos.moduleAddress}::fake_eth::balance`,
          [],
          [bidderAddress],
        )
      )[0],
    );
    const sellerUsdAfter = BigInt(
      (
        await viewFunction(
          fixture.aptos.client,
          `${fixture.aptos.moduleAddress}::fake_usd::balance`,
          [],
          [sellerAddress],
        )
      )[0],
    );
    const bidderUsdAfter = BigInt(
      (
        await viewFunction(
          fixture.aptos.client,
          `${fixture.aptos.moduleAddress}::fake_usd::balance`,
          [],
          [bidderAddress],
        )
      )[0],
    );

    console.log(
      `  Bidder ETH after: ${bidderEthAfter} (gained ${bidderEthAfter - bidderEthBefore})`,
    );
    console.log(
      `  Seller USD after: ${sellerUsdAfter} (gained ${sellerUsdAfter - sellerUsdBefore})`,
    );
    console.log(
      `  Bidder USD after: ${bidderUsdAfter} (refunded ${bidderUsdAfter - bidderUsdBefore + COLLATERAL})`,
    );

    // Winner received all auctioned FakeETH
    expect(bidderEthAfter - bidderEthBefore).toBe(AUCTION_AMOUNT);
    console.log(`  ✓ Bidder received ${AUCTION_AMOUNT} FakeETH`);

    // Seller received clearing_price (= BID_PRICE, capped at COLLATERAL)
    const expectedPayment = BID_PRICE <= COLLATERAL ? BID_PRICE : COLLATERAL;
    expect(sellerUsdAfter - sellerUsdBefore).toBe(expectedPayment);
    console.log(`  ✓ Seller received ${expectedPayment} FakeUSD`);

    // Bidder net USD: paid clearing_price, excess collateral refunded
    // net = start - COLLATERAL + (COLLATERAL - expectedPayment) = start - expectedPayment
    expect(bidderUsdAfter).toBe(bidderUsdBefore - expectedPayment);
    console.log(`  ✓ Bidder refunded excess collateral`);
  }, 120000);
});
