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
import { join } from "path";
import {
  generateLockProof,
  calculateStorageKey,
} from "../../../src/lib/ethereum/proofs/generator";
import { ethereumToAptosAddress } from "../../../src/lib/ethereum/address-converter";
import {
  compileContracts,
  getFakeETHArtifact,
  getFakeUSDArtifact,
  getLockBoxArtifact,
  deployWithRetry,
} from "../ethereum/solidity-compiler";
import { sendAndWaitForTx } from "../helpers/transaction-utils.js";
import { stripHexPrefix } from "../helpers/hex-utils.js";

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
  let aptosDeployer: Account;
  let aptosModuleAddress: string;

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

    // Compile contracts
    await compileContracts();

    // Deploy FakeETH
    console.log("  Deploying FakeETH...");
    const fakeETHArtifact = getFakeETHArtifact();
    const FakeETHFactory = new ethers.ContractFactory(
      fakeETHArtifact.abi,
      fakeETHArtifact.bytecode.object,
      ethSigner,
    );
    const fakeEthContract = await deployWithRetry(FakeETHFactory, ethSigner);
    fakeEthAddress = await fakeEthContract.getAddress();

    // Wait for state to be indexed
    await new Promise((r) => setTimeout(r, 3000));

    // Verify FakeETH deployed correctly
    const fakeEthCode = await ethProvider.getCode(fakeEthAddress);
    if (fakeEthCode === "0x") {
      throw new Error(`FakeETH contract not deployed at ${fakeEthAddress}`);
    }
    console.log(`  ✓ FakeETH bytecode verified (${fakeEthCode.length} bytes)`);

    // Deploy FakeUSD
    console.log("  Deploying FakeUSD...");
    const fakeUSDArtifact = getFakeUSDArtifact();
    const FakeUSDFactory = new ethers.ContractFactory(
      fakeUSDArtifact.abi,
      fakeUSDArtifact.bytecode.object,
      ethSigner,
    );
    const fakeUsdContract = await deployWithRetry(FakeUSDFactory, ethSigner);
    fakeUsdAddress = await fakeUsdContract.getAddress();

    // Wait for state to be indexed
    await new Promise((r) => setTimeout(r, 3000));

    // Verify FakeUSD deployed correctly
    const fakeUsdCode = await ethProvider.getCode(fakeUsdAddress);
    if (fakeUsdCode === "0x") {
      throw new Error(`FakeUSD contract not deployed at ${fakeUsdAddress}`);
    }
    console.log(`  ✓ FakeUSD bytecode verified (${fakeUsdCode.length} bytes)`);

    // Deploy LockBox
    console.log("  Deploying LockBox...");
    const lockBoxArtifact = getLockBoxArtifact();
    const LockBoxFactory = new ethers.ContractFactory(
      lockBoxArtifact.abi,
      lockBoxArtifact.bytecode.object,
      ethSigner,
    );
    const lockBoxContract = await deployWithRetry(LockBoxFactory, ethSigner, [
      fakeEthAddress,
      fakeUsdAddress,
    ]);
    lockBoxAddress = await lockBoxContract.getAddress();

    // Wait for state to be indexed
    await new Promise((r) => setTimeout(r, 3000));

    // Verify LockBox deployed correctly
    const lockBoxCode = await ethProvider.getCode(lockBoxAddress);
    if (lockBoxCode === "0x") {
      throw new Error(`LockBox contract not deployed at ${lockBoxAddress}`);
    }
    console.log(`  ✓ LockBox bytecode verified (${lockBoxCode.length} bytes)`);

    console.log(`  ✓ FakeETH: ${fakeEthAddress}`);
    console.log(`  ✓ FakeUSD: ${fakeUsdAddress}`);
    console.log(`  ✓ LockBox: ${lockBoxAddress}`);

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

    // Create deployer account for contracts
    const deployerPrivateKeyHex = "0x" + "2".repeat(64);
    const deployerPrivateKey = new Ed25519PrivateKey(deployerPrivateKeyHex);
    aptosDeployer = Account.fromPrivateKey({ privateKey: deployerPrivateKey });
    aptosModuleAddress = aptosDeployer.accountAddress.toString();

    console.log(`✓ Aptos account: ${aptosAccount.accountAddress.toString()}`);
    console.log(`✓ Aptos deployer: ${aptosModuleAddress}`);

    // Fund accounts
    await Promise.all([
      aptosTestnet.faucet(aptosAccount.accountAddress.toString(), 100_000_000n),
      aptosTestnet.faucet(
        aptosModuleAddress,
        100_000_000_000n, // 1000 APT for deployment
      ),
    ]);
    console.log("✓ Accounts funded");

    // Deploy Aptos contracts
    console.log("\n  Deploying Aptos contracts...");
    const contractsDir = join(process.cwd(), "../atomica-move-contracts");

    await aptosTestnet.deployContracts({
      contractsDir,
      deployerPrivateKey: deployerPrivateKeyHex,
      namedAddresses: {
        atomica: aptosModuleAddress,
      },
      // Note: We'll initialize manually to verify the process
    });
    console.log("  ✓ Contracts deployed");

    // Wait extra time for Aptos indexing
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Initialize registries
    console.log("\n  Initializing Aptos registries...");

    try {
      await initializeRegistry(
        aptosClient,
        aptosDeployer,
        "FakeETH",
        aptosModuleAddress,
      );
      console.log("  ✓ FakeETH registry initialized");
    } catch (e: any) {
      console.log(`  ⚠ FakeETH registry: ${e.message}`);
    }

    try {
      await initializeRegistry(
        aptosClient,
        aptosDeployer,
        "FakeUSD",
        aptosModuleAddress,
      );
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

    // Mint FakeETH - use full ABI from compiled artifact
    const fakeETHArtifact = getFakeETHArtifact();
    const fakeEthContract = new ethers.Contract(
      fakeEthAddress,
      fakeETHArtifact.abi,
      ethSigner,
    );

    console.log(`  Minting ${ethers.formatEther(MINT_AMOUNT_ETH)} FakeETH...`);
    const mintEthReceipt = await sendAndWaitForTx(
      fakeEthContract.mint(ethSigner.address, MINT_AMOUNT_ETH),
      1,
    );
    console.log(
      `  ✓ Tx hash: ${mintEthReceipt.hash} (status: ${mintEthReceipt.status})`,
    );

    // Debug: Try direct eth_call to see raw response
    try {
      const callData = fakeEthContract.interface.encodeFunctionData(
        "balanceOf",
        [ethSigner.address],
      );
      const rawResult = await ethProvider.call({
        to: fakeEthAddress,
        data: callData,
      });
      console.log(
        `  Debug: Raw balanceOf result: ${rawResult} (length: ${rawResult.length})`,
      );
    } catch (error: any) {
      console.log(`  Debug: Direct eth_call failed: ${error.message}`);
    }

    const ethBalance = await fakeEthContract.balanceOf(ethSigner.address);
    expect(ethBalance).toBe(MINT_AMOUNT_ETH);
    console.log(`  ✓ Balance: ${ethers.formatEther(ethBalance)} FakeETH`);

    // Mint FakeUSD - use full ABI from compiled artifact
    const fakeUSDArtifact = getFakeUSDArtifact();
    const fakeUsdContract = new ethers.Contract(
      fakeUsdAddress,
      fakeUSDArtifact.abi,
      ethSigner,
    );

    console.log(
      `  Minting ${ethers.formatUnits(MINT_AMOUNT_USD, 6)} FakeUSD...`,
    );
    const mintUsdReceipt = await sendAndWaitForTx(
      fakeUsdContract.mint(ethSigner.address, MINT_AMOUNT_USD),
      1,
    );
    console.log(
      `  ✓ Tx hash: ${mintUsdReceipt.hash} (status: ${mintUsdReceipt.status})`,
    );

    const usdBalance = await fakeUsdContract.balanceOf(ethSigner.address);
    expect(usdBalance).toBe(MINT_AMOUNT_USD);
    console.log(`  ✓ Balance: ${ethers.formatUnits(usdBalance, 6)} FakeUSD`);
  }, 60000);

  // ============================================================
  // TEST 2: Lock FakeETH in LockBox
  // ============================================================
  it("should lock FakeETH in LockBox contract", async () => {
    console.log("\n[TEST 2] Locking FakeETH...");

    const fakeETHArtifact = getFakeETHArtifact();
    const fakeEthContract = new ethers.Contract(
      fakeEthAddress,
      fakeETHArtifact.abi,
      ethSigner,
    );

    const lockBoxArtifact = getLockBoxArtifact();
    const lockBoxContract = new ethers.Contract(
      lockBoxAddress,
      lockBoxArtifact.abi,
      ethSigner,
    );

    // Use nonce management for sequential transactions
    let nonce = await ethSigner.getNonce();

    // Approve
    console.log(
      `  Approving LockBox to spend ${ethers.formatEther(LOCK_AMOUNT_ETH)} FakeETH...`,
    );
    const approveReceipt = await sendAndWaitForTx(
      fakeEthContract.approve(lockBoxAddress, LOCK_AMOUNT_ETH, {
        nonce: nonce++,
      }),
      1,
    );
    console.log(`  ✓ Approved (status: ${approveReceipt.status})`);

    // Lock
    console.log(`  Locking ${ethers.formatEther(LOCK_AMOUNT_ETH)} FakeETH...`);
    const lockReceipt = await sendAndWaitForTx(
      lockBoxContract.lock(fakeEthAddress, LOCK_AMOUNT_ETH, { nonce: nonce++ }),
      1,
    );
    console.log(
      `  ✓ Tx hash: ${lockReceipt.hash} (status: ${lockReceipt.status})`,
    );
    console.log(`  ✓ Block: ${lockReceipt.blockNumber}`);

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
    (global as any).lockEthBlockNumber = lockReceipt.blockNumber;
  }, 60000);

  // ============================================================
  // TEST 3: Lock FakeUSD in LockBox
  // ============================================================
  it("should lock FakeUSD in LockBox contract", async () => {
    console.log("\n[TEST 3] Locking FakeUSD...");

    const fakeUSDArtifact = getFakeUSDArtifact();
    const fakeUsdContract = new ethers.Contract(
      fakeUsdAddress,
      fakeUSDArtifact.abi,
      ethSigner,
    );

    const lockBoxArtifact = getLockBoxArtifact();
    const lockBoxContract = new ethers.Contract(
      lockBoxAddress,
      lockBoxArtifact.abi,
      ethSigner,
    );

    // Use nonce management for sequential transactions
    let nonce = await ethSigner.getNonce();

    // Approve
    console.log(
      `  Approving LockBox to spend ${ethers.formatUnits(LOCK_AMOUNT_USD, 6)} FakeUSD...`,
    );
    const approveReceipt = await sendAndWaitForTx(
      fakeUsdContract.approve(lockBoxAddress, LOCK_AMOUNT_USD, {
        nonce: nonce++,
      }),
      1,
    );
    console.log(`  ✓ Approved (status: ${approveReceipt.status})`);

    // Lock
    console.log(
      `  Locking ${ethers.formatUnits(LOCK_AMOUNT_USD, 6)} FakeUSD...`,
    );
    const lockReceipt = await sendAndWaitForTx(
      lockBoxContract.lock(fakeUsdAddress, LOCK_AMOUNT_USD, { nonce: nonce++ }),
      1,
    );
    console.log(
      `  ✓ Tx hash: ${lockReceipt.hash} (status: ${lockReceipt.status})`,
    );
    console.log(`  ✓ Block: ${lockReceipt.blockNumber}`);

    // Verify locked balance
    const lockedBalance = await lockBoxContract.getLockedBalance(
      ethSigner.address,
      fakeUsdAddress,
    );
    expect(lockedBalance).toBe(LOCK_AMOUNT_USD);
    console.log(
      `  ✓ Locked balance: ${ethers.formatUnits(lockedBalance, 6)} FakeUSD`,
    );

    (global as any).lockUsdBlockNumber = lockReceipt.blockNumber;
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
    // Note: Query state at lockBlock + 1 to ensure transaction state is included
    console.log(`  Generating state proof for block ${lockBlockNumber + 1}...`);
    const proof = await generateLockProof(
      ethProvider,
      lockBoxAddress,
      ethSigner.address,
      fakeEthAddress,
      lockBlockNumber + 1,
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

    // Strip 0x prefix from all hex strings for Aptos
    const payload = {
      function: "atomica::lock_receipt::register_ethereum_lock",
      typeArguments: ["atomica::lock_receipt::FakeETH"],
      functionArguments: [
        proof.blockNumber,
        stripHexPrefix(proof.blockHash),
        stripHexPrefix(proof.stateRoot),
        stripHexPrefix(lockBoxAddress),
        stripHexPrefix(ethSigner.address),
        stripHexPrefix(fakeEthAddress),
        stripHexPrefix(storageKey),
        proof.storageValue,
        proof.accountProof.map(stripHexPrefix),
        proof.storageProof.map(stripHexPrefix),
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

    const result = await aptosClient.waitForTransaction({
      transactionHash: committedTxn.hash,
      options: { checkSuccess: true },
    });
    console.log(`  ✓ Tx hash: ${committedTxn.hash}`);
    console.log(`  ✓ Transaction confirmed in block ${result.version}`);

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
      `${aptosModuleAddress}::lock_receipt::is_lock_claimed` as any,
      [
        `${aptosModuleAddress}::lock_receipt::Ethereum`,
        `${aptosModuleAddress}::lock_receipt::FakeETH`,
      ],
      [lockId],
    );
    expect(isClaimed[0]).toBe(true);
    console.log("  ✓ Lock marked as claimed");

    // Get receipt details
    const receipt = await viewFunction(
      aptosClient,
      `${aptosModuleAddress}::lock_receipt::get_receipt` as any,
      [
        `${aptosModuleAddress}::lock_receipt::Ethereum`,
        `${aptosModuleAddress}::lock_receipt::FakeETH`,
      ],
      [lockId],
    );
    expect(receipt.length).toBeGreaterThan(0);

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
      `${aptosModuleAddress}::lock_receipt::get_receipt_count` as any,
      [
        `${aptosModuleAddress}::lock_receipt::Ethereum`,
        `${aptosModuleAddress}::lock_receipt::FakeETH`,
      ],
      [],
    );
    expect(receiptCount[0]).toBe(1);
    console.log(`  ✓ Receipt count: ${receiptCount[0]}`);

    const totalLocked = await viewFunction(
      aptosClient,
      `${aptosModuleAddress}::lock_receipt::get_total_locked` as any,
      [
        `${aptosModuleAddress}::lock_receipt::Ethereum`,
        `${aptosModuleAddress}::lock_receipt::FakeETH`,
      ],
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

    // Strip 0x prefix from all hex strings for Aptos
    const payload = {
      function: `${aptosModuleAddress}::lock_receipt::register_ethereum_lock`,
      typeArguments: [`${aptosModuleAddress}::lock_receipt::FakeETH`],
      functionArguments: [
        proof.blockNumber,
        stripHexPrefix(proof.blockHash),
        stripHexPrefix(proof.stateRoot),
        stripHexPrefix(lockBoxAddress),
        stripHexPrefix(ethSigner.address),
        stripHexPrefix(fakeEthAddress),
        stripHexPrefix(storageKey),
        proof.storageValue,
        proof.accountProof.map(stripHexPrefix),
        proof.storageProof.map(stripHexPrefix),
      ],
    } as any;

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
      `${aptosModuleAddress}::lock_receipt::get_receipt_count` as any,
      [
        `${aptosModuleAddress}::lock_receipt::Ethereum`,
        `${aptosModuleAddress}::lock_receipt::FakeETH`,
      ],
      [],
    );
    console.log(`  FakeETH receipts: ${ethCount[0]}`);

    // Check FakeUSD registry (should be 0)
    const usdCountCheck = await viewFunction(
      aptosClient,
      `${aptosModuleAddress}::lock_receipt::get_receipt_count` as any,
      [
        `${aptosModuleAddress}::lock_receipt::Ethereum`,
        `${aptosModuleAddress}::lock_receipt::FakeUSD`,
      ],
      [],
    );
    console.log(`  FakeUSD receipts: ${usdCountCheck[0]}`);

    expect(ethCount[0]).toBe(1);
    expect(usdCountCheck[0]).toBe(0); // No FakeUSD receipts yet
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
  moduleAddress: string,
): Promise<void> {
  const payload = {
    function: `${moduleAddress}::lock_receipt::initialize`,
    typeArguments: [
      `${moduleAddress}::lock_receipt::Ethereum`,
      `${moduleAddress}::lock_receipt::${assetType}`,
    ],
    functionArguments: [],
  } as any;

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
