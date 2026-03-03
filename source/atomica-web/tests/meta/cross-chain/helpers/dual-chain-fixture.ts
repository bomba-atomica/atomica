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
  compileContracts,
  getFakeETHArtifact,
  getFakeUSDArtifact,
  getLockBoxArtifact,
  deployWithRetry,
} from "../../ethereum/solidity-compiler";
import {
  waitForModuleIndexed,
  verifyModuleCallable,
} from "../../aptos/helpers/module-indexing-utils";
import {
  APTOS_DEPLOYER_PRIVATE_KEY,
  ATOMICA_CONTRACT_ADDRESS,
} from "../../../../../shared/test-constants";

export interface DualChainFixture {
  eth: {
    testnet: EthereumDockerTestnet;
    provider: ethers.JsonRpcProvider;
    signer: ethers.Wallet;
    contracts: {
      fakeETH: string;
      fakeUSD: string;
      lockBox: string;
    };
  };
  aptos: {
    testnet: DockerTestnet;
    client: Aptos;
    account: Account;
    deployer: Account;
    moduleAddress: string;
  };
}

/**
 * Singleton instance of the dual-chain fixture.
 * Allows tests to share the same setup or create independent instances.
 */
let sharedFixture: DualChainFixture | null = null;

/**
 * Set up a complete dual-chain testnet environment (Ethereum + Aptos).
 *
 * This includes:
 * - Starting both testnets in parallel
 * - Deploying Ethereum contracts (FakeETH, FakeUSD, LockBox)
 * - Deploying Aptos Move modules (lock_receipt, registry, etc.)
 * - Waiting for module indexing with exponential backoff
 * - Initializing Aptos registries for FakeETH and FakeUSD
 *
 * @param options - Configuration options
 * @param options.useShared - If true, returns cached shared fixture (default: false)
 * @param options.ethereumSlots - Number of Ethereum validator slots (default: 4)
 * @param options.aptosSlots - Number of Aptos validator slots (default: 4)
 * @returns Complete dual-chain test fixture
 */
export async function setupDualChainFixture(
  options: {
    useShared?: boolean;
    ethereumSlots?: number;
    aptosSlots?: number;
  } = {},
): Promise<DualChainFixture> {
  const { useShared = false, ethereumSlots = 4, aptosSlots = 4 } = options;

  // Return cached fixture if requested
  if (useShared && sharedFixture) {
    console.log("[Dual-Chain Setup] Using cached shared fixture");
    return sharedFixture;
  }

  console.log("=".repeat(80));
  console.log("DUAL-CHAIN TESTNET SETUP");
  console.log("=".repeat(80));

  // ========== PHASE 1: Start Both Testnets ==========
  console.log("\n[PHASE 1] Starting testnets in parallel...");

  const [ethTestnet, aptosTestnet] = await Promise.all([
    EthereumDockerTestnet.start(ethereumSlots),
    DockerTestnet.new(aptosSlots),
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

  const ethProvider = new ethers.JsonRpcProvider(
    ethTestnet.getExecutionRpcUrl(),
  );
  const testAccounts = ethTestnet.getTestAccounts();
  const ethSigner = new ethers.Wallet(testAccounts[0].privateKey, ethProvider);

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
  const fakeEthAddress = await fakeEthContract.getAddress();

  // Wait for state to be indexed
  await new Promise((r) => setTimeout(r, 3000));

  // Verify FakeETH deployed correctly
  const fakeEthCode = await ethProvider.getCode(fakeEthAddress);
  if (fakeEthCode === "0x") {
    throw new Error(`FakeETH contract not deployed at ${fakeEthAddress}`);
  }
  console.log(`  ✓ FakeETH deployed at: ${fakeEthAddress}`);

  // Deploy FakeUSD
  console.log("  Deploying FakeUSD...");
  const fakeUSDArtifact = getFakeUSDArtifact();
  const FakeUSDFactory = new ethers.ContractFactory(
    fakeUSDArtifact.abi,
    fakeUSDArtifact.bytecode.object,
    ethSigner,
  );
  const fakeUsdContract = await deployWithRetry(FakeUSDFactory, ethSigner);
  const fakeUsdAddress = await fakeUsdContract.getAddress();

  // Wait for state to be indexed
  await new Promise((r) => setTimeout(r, 3000));

  // Verify FakeUSD deployed correctly
  const fakeUsdCode = await ethProvider.getCode(fakeUsdAddress);
  if (fakeUsdCode === "0x") {
    throw new Error(`FakeUSD contract not deployed at ${fakeUsdAddress}`);
  }
  console.log(`  ✓ FakeUSD deployed at: ${fakeUsdAddress}`);

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
  const lockBoxAddress = await lockBoxContract.getAddress();

  // Wait for state to be indexed
  await new Promise((r) => setTimeout(r, 3000));

  // Verify LockBox deployed correctly
  const lockBoxCode = await ethProvider.getCode(lockBoxAddress);
  if (lockBoxCode === "0x") {
    throw new Error(`LockBox contract not deployed at ${lockBoxAddress}`);
  }
  console.log(`  ✓ LockBox deployed at: ${lockBoxAddress}`);

  // ========== PHASE 3: Setup Aptos ==========
  console.log("\n[PHASE 3] Setting up Aptos...");

  const aptosConfig = new AptosConfig({
    network: Network.CUSTOM,
    fullnode: `${aptosTestnet.validatorApiUrl(0)}/v1`,
  });
  const aptosClient = new Aptos(aptosConfig);

  // Create test account
  const privateKey = new Ed25519PrivateKey("0x" + "1".repeat(64));
  const aptosAccount = Account.fromPrivateKey({ privateKey });

  // Create deployer account for contracts
  // Use the same key as localnet.ts for consistency
  const deployerPrivateKeyHex = APTOS_DEPLOYER_PRIVATE_KEY;
  const deployerPrivateKey = new Ed25519PrivateKey(deployerPrivateKeyHex);
  const aptosDeployer = Account.fromPrivateKey({
    privateKey: deployerPrivateKey,
  });
  const aptosModuleAddress = ATOMICA_CONTRACT_ADDRESS;

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
    deployerAddress: aptosModuleAddress,
    namedAddresses: {
      atomica: aptosModuleAddress,
    },
    initFunctions: [
      {
        functionId: `${aptosModuleAddress}::registry::initialize`,
        args: ["hex:0123456789abcdef"],
      },
      {
        functionId: `${aptosModuleAddress}::fake_eth::initialize`,
        args: [],
      },
      {
        functionId: `${aptosModuleAddress}::fake_usd::initialize`,
        args: [],
      },
    ],
    fundAmount: 10_000_000_000n, // 100 APT for deployment
  });
  console.log("  ✓ Contracts deployed");

  // Wait for modules to be indexed and verify they exist
  console.log("\n  Waiting for lock_receipt module to be indexed...");
  const indexResult = await waitForModuleIndexed(
    aptosClient,
    aptosModuleAddress,
    "lock_receipt",
    {
      maxWaitMs: 90000,
      exponentialBackoff: true,
      captureErrors: true,
    },
  );

  if (!indexResult.success) {
    console.error(
      `  ✗ Module indexing failed after ${indexResult.attempts} attempts (${indexResult.totalWaitMs}ms)`,
    );
    if (indexResult.errors.length > 0) {
      console.error(`  Last 5 errors:`);
      indexResult.errors.slice(-5).forEach((e, i) => {
        console.error(`    ${i + 1}. ${e.error}`);
      });
    }
    throw new Error("lock_receipt module failed to index within 90s");
  }

  // Verify module is callable
  console.log("\n  Verifying lock_receipt module is callable...");
  const isCallable = await verifyModuleCallable(
    aptosClient,
    aptosModuleAddress,
    "lock_receipt",
    "get_receipt_count",
    [
      `${aptosModuleAddress}::lock_receipt::Ethereum`,
      `${aptosModuleAddress}::lock_receipt::FakeETH`,
    ],
    [],
  );

  if (!isCallable) {
    console.warn("  ⚠ Module is indexed but may not be fully callable yet");
  } else {
    console.log("  ✓ Module is indexed and callable");
  }

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
  console.log("DUAL-CHAIN SETUP COMPLETE");
  console.log("=".repeat(80) + "\n");

  const fixture: DualChainFixture = {
    eth: {
      testnet: ethTestnet,
      provider: ethProvider,
      signer: ethSigner,
      contracts: {
        fakeETH: fakeEthAddress,
        fakeUSD: fakeUsdAddress,
        lockBox: lockBoxAddress,
      },
    },
    aptos: {
      testnet: aptosTestnet,
      client: aptosClient,
      account: aptosAccount,
      deployer: aptosDeployer,
      moduleAddress: aptosModuleAddress,
    },
  };

  // Cache if shared
  if (useShared) {
    sharedFixture = fixture;
  }

  return fixture;
}

/**
 * Tear down the dual-chain testnet and clean up resources.
 *
 * @param fixture - The dual-chain fixture to tear down
 */
export async function teardownDualChainFixture(
  fixture: DualChainFixture,
): Promise<void> {
  console.log("\n" + "=".repeat(80));
  console.log("DUAL-CHAIN TEARDOWN");
  console.log("=".repeat(80));

  await Promise.all([
    fixture.eth.testnet.teardown(),
    fixture.aptos.testnet.teardown(),
  ]);

  console.log("✓ Cleanup complete\n");

  // Clear shared fixture if this was it
  if (sharedFixture === fixture) {
    sharedFixture = null;
  }
}

/**
 * Helper function to initialize a registry on Aptos.
 */
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
  };

  const transaction = await client.transaction.build.simple({
    sender: account.accountAddress,
    data: payload,
  });

  const committedTxn = await client.signAndSubmitTransaction({
    signer: account,
    transaction,
  });

  await client.waitForTransaction({
    transactionHash: committedTxn.hash,
  });
}
