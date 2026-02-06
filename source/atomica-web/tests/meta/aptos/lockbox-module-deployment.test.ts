import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupLocalnet, getTestnet } from "../../../test-utils/localnet";
import {
  Aptos,
  AptosConfig,
  Network,
  Account,
  Ed25519PrivateKey,
} from "@aptos-labs/ts-sdk";
import { resolve as pathResolve } from "path";

/**
 * Test: Aptos LockBox Module Deployment Verification
 *
 * This meta test verifies that the lock_receipt Move module:
 * 1. Deploys successfully to the Aptos testnet
 * 2. Is properly indexed and accessible
 * 3. View functions can be called without 404 errors
 *
 * WHY ISOLATED?
 * The main E2E test (lock-receipt-e2e.test.ts) includes both Ethereum and Aptos.
 * When Aptos module deployment fails, it cascades to all subsequent tests.
 * This test isolates Aptos-only issues for faster debugging.
 *
 * PATTERN:
 * - Uses setupLocalnet() from test-utils/localnet (singleton, persistent)
 * - Uses describe.sequential() (required for localnet tests)
 * - Run with: bun run test:meta
 */

describe.sequential("Aptos LockBox Module Deployment", () => {
  let aptosClient: Aptos;
  let deployerAccount: Account;
  let deployerAddress: string;

  beforeAll(async () => {
    console.log("=".repeat(80));
    console.log("STARTING APTOS LOCKBOX MODULE DEPLOYMENT TEST");
    console.log("=".repeat(80));

    await setupLocalnet();

    const config = new AptosConfig({
      network: Network.CUSTOM,
      fullnode: "http://127.0.0.1:8080/v1",
    });
    aptosClient = new Aptos(config);

    const deployerPrivateKey = new Ed25519PrivateKey(
      "0x52a0d787625121df4e45d1d6a36f71dce7466710404f22ae3f21156828551717",
    );
    deployerAccount = Account.fromPrivateKey({
      privateKey: deployerPrivateKey,
    });
    deployerAddress = deployerAccount.accountAddress.toString();

    console.log(`✓ Deployer account: ${deployerAddress}`);
  }, 180000);

  afterAll(async () => {
    // No teardown - localnet persists for other tests
  });

  it("should deploy atomica-move-contracts including lock_receipt", async () => {
    console.log("\n[TEST 1] Deploying atomica-move-contracts...");

    const testnet = getTestnet();
    const contractsDir = pathResolve(
      process.cwd(),
      "../atomica-move-contracts",
    );

    await testnet.deployContracts({
      contractsDir,
      deployerPrivateKey: deployerAccount.privateKey.toString(),
      deployerAddress,
      namedAddresses: { atomica: deployerAddress },
      initFunctions: [
        {
          functionId: `${deployerAddress}::registry::initialize`,
          args: ["hex:0123456789abcdef"],
        },
        {
          functionId: `${deployerAddress}::fake_eth::initialize`,
          args: [],
        },
        {
          functionId: `${deployerAddress}::fake_usd::initialize`,
          args: [],
        },
      ],
      fundAmount: 10_000_000_000n,
    });

    console.log("✓ Contracts deployed");

    const modules = await aptosClient.getAccountModules({
      accountAddress: deployerAddress,
    });

    console.log(`  Found ${modules.length} modules:`);
    for (const module of modules) {
      console.log(`    - ${module.abi?.name || "unknown"}`);
    }

    const lockReceiptModule = modules.find(
      (m) => m.abi?.name === "lock_receipt",
    );
    expect(lockReceiptModule).toBeDefined();
    console.log("✓ lock_receipt module found");
  });

  it("should verify module has expected view functions", async () => {
    console.log("\n[TEST 2] Verifying module view functions...");

    const modules = await aptosClient.getAccountModules({
      accountAddress: deployerAddress,
    });

    const lockReceiptModule = modules.find(
      (m) => m.abi?.name === "lock_receipt",
    );
    expect(lockReceiptModule).toBeDefined();

    const exposedFunctions = lockReceiptModule.abi?.exposed_functions || [];

    const requiredFunctions = [
      "is_lock_claimed",
      "get_total_locked",
      "get_receipt_count",
      "get_receipt",
      "is_registry_initialized",
      "register_ethereum_lock",
    ];

    for (const funcName of requiredFunctions) {
      const hasFunction = exposedFunctions.some((f) => f.name === funcName);
      expect(hasFunction).toBe(true);
      console.log(`  ✓ Found: ${funcName}`);
    }
  });

  it("should initialize FakeETH registry for lock_receipt", async () => {
    console.log("\n[TEST 3] Initializing FakeETH registry...");

    const payload = {
      function: `${deployerAddress}::lock_receipt::initialize` as any,
      typeArguments: [
        `${deployerAddress}::lock_receipt::Ethereum`,
        `${deployerAddress}::lock_receipt::FakeETH`,
      ],
      functionArguments: [] as any[],
    };

    const txn = await aptosClient.transaction.build.simple({
      sender: deployerAccount.accountAddress,
      data: payload,
    });

    const committedTxn = await aptosClient.signAndSubmitTransaction({
      signer: deployerAccount,
      transaction: txn,
    });

    await aptosClient.waitForTransaction({
      transactionHash: committedTxn.hash,
      checkSuccess: true,
    });

    console.log("✓ FakeETH registry initialized");
  });

  it("should initialize FakeUSD registry for lock_receipt", async () => {
    console.log("\n[TEST 4] Initializing FakeUSD registry...");

    const payload = {
      function: `${deployerAddress}::lock_receipt::initialize` as any,
      typeArguments: [
        `${deployerAddress}::lock_receipt::Ethereum`,
        `${deployerAddress}::lock_receipt::FakeUSD`,
      ],
      functionArguments: [] as any[],
    };

    const txn = await aptosClient.transaction.build.simple({
      sender: deployerAccount.accountAddress,
      data: payload,
    });

    const committedTxn = await aptosClient.signAndSubmitTransaction({
      signer: deployerAccount,
      transaction: txn,
    });

    await aptosClient.waitForTransaction({
      transactionHash: committedTxn.hash,
      checkSuccess: true,
    });

    console.log("✓ FakeUSD registry initialized");
  });

  it("should call is_registry_initialized without 404 error (FakeETH)", async () => {
    console.log("\n[TEST 5] Calling is_registry_initialized for FakeETH...");

    const payload = {
      function:
        `${deployerAddress}::lock_receipt::is_registry_initialized` as any,
      typeArguments: [
        `${deployerAddress}::lock_receipt::Ethereum`,
        `${deployerAddress}::lock_receipt::FakeETH`,
      ],
      functionArguments: [] as any[],
    };

    try {
      const result = await aptosClient.view({ payload });
      console.log(
        `  ✓ is_registry_initialized(FakeETH) returned: ${JSON.stringify(result)}`,
      );
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toBe(true);
    } catch (error: any) {
      if (
        error.message.includes("not found") ||
        error.message.includes("404")
      ) {
        throw new Error(`View function returned 404: ${error.message}`);
      }
      throw error;
    }
  });

  it("should call is_registry_initialized without 404 error (FakeUSD)", async () => {
    console.log("\n[TEST 6] Calling is_registry_initialized for FakeUSD...");

    const payload = {
      function:
        `${deployerAddress}::lock_receipt::is_registry_initialized` as any,
      typeArguments: [
        `${deployerAddress}::lock_receipt::Ethereum`,
        `${deployerAddress}::lock_receipt::FakeUSD`,
      ],
      functionArguments: [] as any[],
    };

    try {
      const result = await aptosClient.view({ payload });
      console.log(
        `  ✓ is_registry_initialized(FakeUSD) returned: ${JSON.stringify(result)}`,
      );
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toBe(true);
    } catch (error: any) {
      if (
        error.message.includes("not found") ||
        error.message.includes("404")
      ) {
        throw new Error(`View function returned 404: ${error.message}`);
      }
      throw error;
    }
  });

  it("should call get_receipt_count without 404 error", async () => {
    console.log("\n[TEST 7] Calling get_receipt_count...");

    const payload = {
      function: `${deployerAddress}::lock_receipt::get_receipt_count` as any,
      typeArguments: [
        `${deployerAddress}::lock_receipt::Ethereum`,
        `${deployerAddress}::lock_receipt::FakeETH`,
      ],
      functionArguments: [] as any[],
    };

    try {
      const result = await aptosClient.view({ payload });
      console.log(`  ✓ get_receipt_count returned: ${JSON.stringify(result)}`);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    } catch (error: any) {
      if (
        error.message.includes("not found") ||
        error.message.includes("404")
      ) {
        throw new Error(`View function returned 404: ${error.message}`);
      }
      throw error;
    }
  });

  it("should call is_lock_claimed without 404 error", async () => {
    console.log("\n[TEST 8] Calling is_lock_claimed with fake lock_id...");

    const fakeLockId =
      "0x0000000000000000000000000000000000000000000000000000000000000000";
    const payload = {
      function: `${deployerAddress}::lock_receipt::is_lock_claimed` as any,
      typeArguments: [
        `${deployerAddress}::lock_receipt::Ethereum`,
        `${deployerAddress}::lock_receipt::FakeETH`,
      ],
      functionArguments: [fakeLockId],
    };

    try {
      const result = await aptosClient.view({ payload });
      console.log(`  ✓ is_lock_claimed returned: ${JSON.stringify(result)}`);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result[0]).toBe(false);
    } catch (error: any) {
      if (
        error.message.includes("not found") ||
        error.message.includes("404")
      ) {
        throw new Error(`View function returned 404: ${error.message}`);
      }
      throw error;
    }
  });

  it("should call get_total_locked without 404 error", async () => {
    console.log("\n[TEST 9] Calling get_total_locked...");

    const payload = {
      function: `${deployerAddress}::lock_receipt::get_total_locked` as any,
      typeArguments: [
        `${deployerAddress}::lock_receipt::Ethereum`,
        `${deployerAddress}::lock_receipt::FakeETH`,
      ],
      functionArguments: [] as any[],
    };

    try {
      const result = await aptosClient.view({ payload });
      console.log(`  ✓ get_total_locked returned: ${JSON.stringify(result)}`);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    } catch (error: any) {
      if (
        error.message.includes("not found") ||
        error.message.includes("404")
      ) {
        throw new Error(`View function returned 404: ${error.message}`);
      }
      throw error;
    }
  });

  it("should call get_receipt without 404 error (returns NOT_FOUND for non-existent receipt)", async () => {
    console.log(
      "\n[TEST 10] Calling get_receipt with fake lock_id (expecting NOT_FOUND)...",
    );

    const fakeLockId =
      "0x0000000000000000000000000000000000000000000000000000000000000000";
    const payload = {
      function: `${deployerAddress}::lock_receipt::get_receipt` as any,
      typeArguments: [
        `${deployerAddress}::lock_receipt::Ethereum`,
        `${deployerAddress}::lock_receipt::FakeETH`,
      ],
      functionArguments: [fakeLockId],
    };

    try {
      const result = await aptosClient.view({ payload });
      console.log(`  ✓ get_receipt returned: ${JSON.stringify(result)}`);
      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    } catch (error: any) {
      if (
        error.message.includes("not found") ||
        error.message.includes("404")
      ) {
        throw new Error(`View function returned 404: ${error.message}`);
      }
      if (error.message.includes("E_RECEIPT_NOT_FOUND")) {
        console.log(
          `  ✓ get_receipt correctly returned E_RECEIPT_NOT_FOUND for non-existent receipt`,
        );
        return;
      }
      throw error;
    }
  });
});
