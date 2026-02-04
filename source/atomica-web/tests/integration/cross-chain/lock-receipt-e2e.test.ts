import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";
import { DockerTestnet } from "@atomica/docker-testnet";
import { ethers } from "ethers";
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import {
  generateLockProof,
  calculateStorageKey,
} from "../../../src/lib/ethereum/proofs/generator";
import { ethereumToAptosAddress } from "../../../src/lib/ethereum/address-converter";

/**
 * End-to-End Cross-Chain Lock Receipt Test
 *
 * This test verifies the complete flow:
 * 1. Ethereum user mints FakeETH and FakeUSD
 * 2. User locks assets in LockBox contract
 * 3. User generates state proof of locked assets
 * 4. User submits proof to Aptos chain
 * 5. Aptos creates lock receipt for the user
 */
describe("Cross-Chain Lock Receipt E2E", () => {
  let ethTestnet: EthereumDockerTestnet;
  let aptosTestnet: DockerTestnet;
  let ethProvider: ethers.JsonRpcProvider;
  let ethSigner: ethers.Wallet;
  let aptosClient: Aptos;
  let aptosAccount: Account;

  // Contract addresses (will be populated after deployment)
  let fakeEthAddress: string;
  let fakeUsdAddress: string;
  let lockBoxAddress: string;

  // Test amounts
  const MINT_AMOUNT_ETH = ethers.parseEther("1000"); // 1000 FakeETH
  const LOCK_AMOUNT_ETH = ethers.parseEther("10"); // 10 FakeETH
  const MINT_AMOUNT_USD = ethers.parseUnits("5000", 6); // 5000 FakeUSD (6 decimals)
  const LOCK_AMOUNT_USD = ethers.parseUnits("100", 6); // 100 FakeUSD

  beforeAll(async () => {
    console.log("=".repeat(80));
    console.log("STARTING DUAL TESTNET E2E TEST");
    console.log("=".repeat(80));

    // ========== PHASE 1: Start Both Testnets ==========
    console.log("\n[PHASE 1] Starting testnets in parallel...");

    [ethTestnet, aptosTestnet] = await Promise.all([
      EthereumDockerTestnet.start(4),
      DockerTestnet.new(4),
    ]);

    console.log("✓ Both testnets started");

    // Wait for health
    await Promise.all([
      ethTestnet.waitForHealthy(180),
      aptosTestnet.waitForBlocks(1, 120),
    ]);

    console.log("✓ Both testnets are healthy");

    // ========== PHASE 2: Setup Ethereum ==========
    console.log("\n[PHASE 2] Setting up Ethereum...");

    ethProvider = new ethers.JsonRpcProvider(ethTestnet.getExecutionRpcUrl());
    const testAccounts = ethTestnet.getTestAccounts();
    ethSigner = new ethers.Wallet(testAccounts[0].privateKey, ethProvider);

    console.log(`✓ Ethereum signer: ${ethSigner.address}`);

    const balance = await ethProvider.getBalance(ethSigner.address);
    console.log(`✓ ETH balance: ${ethers.formatEther(balance)} ETH`);

    // Deploy Ethereum contracts
    console.log("\n  Deploying Ethereum contracts...");

    // Note: These would be deployed via Foundry scripts
    // For now, using pre-deployed addresses from docker testnet
    // TODO: Implement actual deployment or use docker-compose pre-deployment
    fakeEthAddress = "0xb4B46bdAA835F8E4b4d8e208B6559cD267851051"; // From golden vectors
    fakeUsdAddress = "0x17435ccE3d1B4fA2e5f8A08eD921D57C6762A180";
    lockBoxAddress = "0x703848F4c85f18e3acd8196c8eC91eb0b7Bd0797";

    console.log(`  FakeETH: ${fakeEthAddress}`);
    console.log(`  FakeUSD: ${fakeUsdAddress}`);
    console.log(`  LockBox: ${lockBoxAddress}`);

    // ========== PHASE 3: Setup Aptos ==========
    console.log("\n[PHASE 3] Setting up Aptos...");

    const aptosConfig = new AptosConfig({
      network: Network.CUSTOM,
      fullnode: aptosTestnet.validatorApiUrl(0),
    });
    aptosClient = new Aptos(aptosConfig);

    // Create test account
    const privateKey = new Ed25519PrivateKey("0x" + "1".repeat(64));
    aptosAccount = Account.fromPrivateKey({ privateKey });

    console.log(`✓ Aptos account: ${aptosAccount.accountAddress.toString()}`);

    // Fund account
    await aptosTestnet.faucet(
      aptosAccount.accountAddress.toString(),
      100_000_000n,
    );
    console.log("✓ Account funded with 1 APT");

    // Deploy and initialize Aptos modules
    // Note: Modules should already be deployed in docker testnet
    // Initialize registries
    console.log("\n  Initializing Aptos registries...");

    try {
      await initializeRegistry(aptosClient, aptosAccount, "FakeETH");
      console.log("  ✓ FakeETH registry initialized");
    } catch (e: any) {
      console.log(`  ⚠ FakeETH registry: ${e.message}`);
    }

    try {
      await initializeRegistry(aptosClient, aptosAccount, "FakeUSD");
      console.log("  ✓ FakeUSD registry initialized");
    } catch (e: any) {
      console.log(`  ⚠ FakeUSD registry: ${e.message}`);
    }

    console.log("\n" + "=".repeat(80));
    console.log("SETUP COMPLETE - STARTING TESTS");
    console.log("=".repeat(80) + "\n");
  }, 600000); // 10 minute timeout for setup

  afterAll(async () => {
    console.log("\n" + "=".repeat(80));
    console.log("TEARING DOWN TESTNETS");
    console.log("=".repeat(80));

    if (ethTestnet && aptosTestnet) {
      await Promise.all([ethTestnet.teardown(), aptosTestnet.teardown()]);
    }

    console.log("✓ Cleanup complete\n");
  });

  // ============================================================
  // TEST 1: Mint FakeETH and FakeUSD on Ethereum
  // ============================================================
  it("should mint FakeETH and FakeUSD on Ethereum", async () => {
    console.log("\n[TEST 1] Minting FakeETH and FakeUSD...");

    // Mint FakeETH
    const fakeEthContract = new ethers.Contract(
      fakeEthAddress,
      [
        "function mint(uint256 amount)",
        "function balanceOf(address) view returns (uint256)",
      ],
      ethSigner,
    );

    console.log(`  Minting ${ethers.formatEther(MINT_AMOUNT_ETH)} FakeETH...`);
    const mintEthTx = await fakeEthContract.mint(MINT_AMOUNT_ETH);
    await mintEthTx.wait();
    console.log(`  ✓ Tx hash: ${mintEthTx.hash}`);

    const ethBalance = await fakeEthContract.balanceOf(ethSigner.address);
    expect(ethBalance).toBe(MINT_AMOUNT_ETH);
    console.log(`  ✓ Balance: ${ethers.formatEther(ethBalance)} FakeETH`);

    // Mint FakeUSD
    const fakeUsdContract = new ethers.Contract(
      fakeUsdAddress,
      [
        "function mint(uint256 amount)",
        "function balanceOf(address) view returns (uint256)",
      ],
      ethSigner,
    );

    console.log(
      `  Minting ${ethers.formatUnits(MINT_AMOUNT_USD, 6)} FakeUSD...`,
    );
    const mintUsdTx = await fakeUsdContract.mint(MINT_AMOUNT_USD);
    await mintUsdTx.wait();
    console.log(`  ✓ Tx hash: ${mintUsdTx.hash}`);

    const usdBalance = await fakeUsdContract.balanceOf(ethSigner.address);
    expect(usdBalance).toBe(MINT_AMOUNT_USD);
    console.log(`  ✓ Balance: ${ethers.formatUnits(usdBalance, 6)} FakeUSD`);
  }, 60000);

  // ============================================================
  // TEST 2: Lock FakeETH in LockBox
  // ============================================================
  it("should lock FakeETH in LockBox contract", async () => {
    console.log("\n[TEST 2] Locking FakeETH...");

    const fakeEthContract = new ethers.Contract(
      fakeEthAddress,
      ["function approve(address spender, uint256 amount)"],
      ethSigner,
    );

    const lockBoxContract = new ethers.Contract(
      lockBoxAddress,
      [
        "function lock(address token, uint256 amount)",
        "function getLockedBalance(address user, address token) view returns (uint256)",
      ],
      ethSigner,
    );

    // Approve
    console.log(
      `  Approving LockBox to spend ${ethers.formatEther(LOCK_AMOUNT_ETH)} FakeETH...`,
    );
    const approveTx = await fakeEthContract.approve(
      lockBoxAddress,
      LOCK_AMOUNT_ETH,
    );
    await approveTx.wait();
    console.log(`  ✓ Approved`);

    // Lock
    console.log(`  Locking ${ethers.formatEther(LOCK_AMOUNT_ETH)} FakeETH...`);
    const lockTx = await lockBoxContract.lock(fakeEthAddress, LOCK_AMOUNT_ETH);
    const lockReceipt = await lockTx.wait();
    console.log(`  ✓ Tx hash: ${lockTx.hash}`);
    console.log(`  ✓ Block: ${lockReceipt!.blockNumber}`);

    // Verify locked balance
    const lockedBalance = await lockBoxContract.getLockedBalance(
      ethSigner.address,
      fakeEthAddress,
    );
    expect(lockedBalance).toBe(LOCK_AMOUNT_ETH);
    console.log(
      `  ✓ Locked balance: ${ethers.formatEther(lockedBalance)} FakeETH`,
    );

    // Store block number for proof generation
    (global as any).lockEthBlockNumber = lockReceipt!.blockNumber;
  }, 60000);

  // ============================================================
  // TEST 3: Lock FakeUSD in LockBox
  // ============================================================
  it("should lock FakeUSD in LockBox contract", async () => {
    console.log("\n[TEST 3] Locking FakeUSD...");

    const fakeUsdContract = new ethers.Contract(
      fakeUsdAddress,
      ["function approve(address spender, uint256 amount)"],
      ethSigner,
    );

    const lockBoxContract = new ethers.Contract(
      lockBoxAddress,
      [
        "function lock(address token, uint256 amount)",
        "function getLockedBalance(address user, address token) view returns (uint256)",
      ],
      ethSigner,
    );

    // Approve
    console.log(
      `  Approving LockBox to spend ${ethers.formatUnits(LOCK_AMOUNT_USD, 6)} FakeUSD...`,
    );
    const approveTx = await fakeUsdContract.approve(
      lockBoxAddress,
      LOCK_AMOUNT_USD,
    );
    await approveTx.wait();
    console.log(`  ✓ Approved`);

    // Lock
    console.log(
      `  Locking ${ethers.formatUnits(LOCK_AMOUNT_USD, 6)} FakeUSD...`,
    );
    const lockTx = await lockBoxContract.lock(fakeUsdAddress, LOCK_AMOUNT_USD);
    const lockReceipt = await lockTx.wait();
    console.log(`  ✓ Tx hash: ${lockTx.hash}`);
    console.log(`  ✓ Block: ${lockReceipt!.blockNumber}`);

    // Verify locked balance
    const lockedBalance = await lockBoxContract.getLockedBalance(
      ethSigner.address,
      fakeUsdAddress,
    );
    expect(lockedBalance).toBe(LOCK_AMOUNT_USD);
    console.log(
      `  ✓ Locked balance: ${ethers.formatUnits(lockedBalance, 6)} FakeUSD`,
    );

    (global as any).lockUsdBlockNumber = lockReceipt!.blockNumber;
  }, 60000);

  // ============================================================
  // TEST 4: Generate Ethereum State Proof for FakeETH Lock
  // ============================================================
  it("should generate valid Ethereum state proof for FakeETH lock", async () => {
    console.log("\n[TEST 4] Generating FakeETH lock proof...");

    const lockBlockNumber = (global as any).lockEthBlockNumber as number;

    // Wait for finalization (12 blocks)
    console.log(
      `  Waiting for finalization (12 blocks from ${lockBlockNumber})...`,
    );
    await ethTestnet.waitForBlocks(12, 180);
    console.log("  ✓ Block finalized");

    // Generate proof
    console.log("  Generating state proof...");
    const proof = await generateLockProof(
      ethProvider,
      lockBoxAddress,
      ethSigner.address,
      fakeEthAddress,
      lockBlockNumber,
    );

    console.log(`  ✓ Proof generated for block ${proof.blockNumber}`);
    console.log(`    Block hash: ${proof.blockHash}`);
    console.log(`    State root: ${proof.stateRoot}`);
    console.log(`    Account proof nodes: ${proof.accountProof.length}`);
    console.log(`    Storage proof nodes: ${proof.storageProof.length}`);
    console.log(
      `    Storage value: ${proof.storageValue} (${ethers.formatEther(proof.storageValue)} ETH)`,
    );

    // Verify proof locally (optional)
    expect(proof.accountProof.length).toBeGreaterThan(0);
    expect(proof.storageProof.length).toBeGreaterThan(0);
    expect(BigInt(proof.storageValue)).toBe(LOCK_AMOUNT_ETH);

    // Store for next test
    (global as any).fakeEthProof = proof;
  }, 300000); // 5 min for finalization

  // ============================================================
  // TEST 5: Submit FakeETH Proof to Aptos and Create Receipt
  // ============================================================
  it("should submit FakeETH proof to Aptos and create lock receipt", async () => {
    console.log("\n[TEST 5] Submitting FakeETH proof to Aptos...");

    const proof = (global as any).fakeEthProof;

    // Calculate storage key
    const storageKey = calculateStorageKey(ethSigner.address, fakeEthAddress);
    console.log(`  Storage key: ${storageKey}`);

    // Convert Ethereum address to Aptos format
    const aptosUserAddress = ethereumToAptosAddress(ethSigner.address);
    console.log(`  Aptos user address: ${aptosUserAddress}`);

    // Submit proof to Aptos
    console.log("  Submitting proof transaction...");

    const payload = {
      function: "atomica::lock_receipt::register_ethereum_lock",
      typeArguments: ["atomica::lock_receipt::FakeETH"],
      functionArguments: [
        proof.blockNumber,
        proof.blockHash,
        proof.stateRoot,
        lockBoxAddress,
        ethSigner.address,
        fakeEthAddress,
        storageKey,
        proof.storageValue,
        proof.accountProof,
        proof.storageProof,
      ],
    };

    const txn = await aptosClient.transaction.build.simple({
      sender: aptosAccount.accountAddress,
      data: payload,
    });

    const committedTxn = await aptosClient.signAndSubmitTransaction({
      signer: aptosAccount,
      transaction: txn,
    });

    await aptosClient.waitForTransaction({
      transactionHash: committedTxn.hash,
    });
    console.log(`  ✓ Tx hash: ${committedTxn.hash}`);

    // Verify receipt was created
    console.log("  Verifying receipt...");

    // Calculate lock_id (same logic as in lock_receipt.move)
    const lockIdData = Buffer.concat([
      Buffer.from(proof.blockHash.slice(2), "hex"),
      Buffer.from(lockBoxAddress.slice(2), "hex"),
      Buffer.from(ethSigner.address.slice(2), "hex"),
      Buffer.from(fakeEthAddress.slice(2), "hex"),
      Buffer.from(storageKey.slice(2), "hex"),
    ]);
    const lockId = ethers.keccak256(lockIdData);
    console.log(`  Lock ID: ${lockId}`);

    // Check if lock is claimed
    const isClaimed = await viewFunction(
      aptosClient,
      "atomica::lock_receipt::is_lock_claimed",
      ["atomica::lock_receipt::Ethereum", "atomica::lock_receipt::FakeETH"],
      [lockId],
    );
    expect(isClaimed[0]).toBe(true);
    console.log("  ✓ Lock marked as claimed");

    // Get receipt details
    const receipt = await viewFunction(
      aptosClient,
      "atomica::lock_receipt::get_receipt",
      ["atomica::lock_receipt::Ethereum", "atomica::lock_receipt::FakeETH"],
      [lockId],
    );

    const [receiptUser, receiptAmount, receiptBlock, receiptStatus] = receipt;
    console.log(`  Receipt user: ${receiptUser}`);
    console.log(`  Receipt amount: ${receiptAmount}`);
    console.log(`  Receipt block: ${receiptBlock}`);
    console.log(`  Receipt status: ${receiptStatus} (0=ACTIVE)`);

    expect(receiptAmount).toBe(proof.storageValue);
    expect(receiptBlock).toBe(proof.blockNumber);
    expect(receiptStatus).toBe(0); // ACTIVE

    // Check registry metrics
    const receiptCount = await viewFunction(
      aptosClient,
      "atomica::lock_receipt::get_receipt_count",
      ["atomica::lock_receipt::Ethereum", "atomica::lock_receipt::FakeETH"],
      [],
    );
    expect(receiptCount[0]).toBe(1);
    console.log(`  ✓ Receipt count: ${receiptCount[0]}`);

    const totalLocked = await viewFunction(
      aptosClient,
      "atomica::lock_receipt::get_total_locked",
      ["atomica::lock_receipt::Ethereum", "atomica::lock_receipt::FakeETH"],
      [],
    );
    expect(totalLocked[0]).toBe(proof.storageValue);
    console.log(`  ✓ Total locked: ${totalLocked[0]}`);

    (global as any).fakeEthLockId = lockId;
  }, 120000);

  // ============================================================
  // TEST 6: Test Replay Attack Prevention
  // ============================================================
  it("should prevent replay attacks by rejecting duplicate proofs", async () => {
    console.log("\n[TEST 6] Testing replay attack prevention...");

    const proof = (global as any).fakeEthProof;
    const storageKey = calculateStorageKey(ethSigner.address, fakeEthAddress);

    console.log("  Attempting to submit same proof again...");

    const payload = {
      function: "atomica::lock_receipt::register_ethereum_lock",
      typeArguments: ["atomica::lock_receipt::FakeETH"],
      functionArguments: [
        proof.blockNumber,
        proof.blockHash,
        proof.stateRoot,
        lockBoxAddress,
        ethSigner.address,
        fakeEthAddress,
        storageKey,
        proof.storageValue,
        proof.accountProof,
        proof.storageProof,
      ],
    };

    try {
      const txn = await aptosClient.transaction.build.simple({
        sender: aptosAccount.accountAddress,
        data: payload,
      });

      const committedTxn = await aptosClient.signAndSubmitTransaction({
        signer: aptosAccount,
        transaction: txn,
      });

      await aptosClient.waitForTransaction({
        transactionHash: committedTxn.hash,
      });

      // If we get here, the test should fail
      expect(true).toBe(false); // Force failure
    } catch (error: any) {
      console.log("  ✓ Transaction rejected as expected");
      console.log(`    Error: ${error.message}`);
      expect(error.message).toContain("E_ALREADY_CLAIMED");
    }
  }, 60000);

  // ============================================================
  // TEST 7: Verify Type Isolation Between FakeETH and FakeUSD
  // ============================================================
  it("should maintain separate registries for FakeETH and FakeUSD", async () => {
    console.log("\n[TEST 7] Verifying type isolation...");

    // Check FakeETH registry
    const ethCount = await viewFunction(
      aptosClient,
      "atomica::lock_receipt::get_receipt_count",
      ["atomica::lock_receipt::Ethereum", "atomica::lock_receipt::FakeETH"],
      [],
    );
    console.log(`  FakeETH receipts: ${ethCount[0]}`);

    // Check FakeUSD registry (should be 0)
    const usdCount = await viewFunction(
      aptosClient,
      "atomica::lock_receipt::get_receipt_count",
      ["atomica::lock_receipt::Ethereum", "atomica::lock_receipt::FakeUSD"],
      [],
    );
    console.log(`  FakeUSD receipts: ${usdCount[0]}`);

    expect(ethCount[0]).toBe(1);
    expect(usdCount[0]).toBe(0); // No FakeUSD receipts yet
    console.log("  ✓ Registries are properly isolated");
  }, 30000);
});

// ============================================================
// Helper Functions
// ============================================================

async function initializeRegistry(
  client: Aptos,
  account: Account,
  assetType: "FakeETH" | "FakeUSD",
): Promise<void> {
  const payload = {
    function: "atomica::lock_receipt::initialize",
    typeArguments: [
      "atomica::lock_receipt::Ethereum",
      `atomica::lock_receipt::${assetType}`,
    ],
    functionArguments: [],
  };

  const txn = await client.transaction.build.simple({
    sender: account.accountAddress,
    data: payload,
  });

  const committedTxn = await client.signAndSubmitTransaction({
    signer: account,
    transaction: txn,
  });

  await client.waitForTransaction({ transactionHash: committedTxn.hash });
}

async function viewFunction(
  client: Aptos,
  functionName: string,
  typeArguments: string[],
  functionArguments: any[],
): Promise<any[]> {
  const payload = {
    function: functionName,
    typeArguments,
    functionArguments,
  };

  const result = await client.view({ payload });
  return result;
}
