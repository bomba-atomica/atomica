/**
 * Localnet Management - Docker-based Single Validator Testnet
 *
 * This module provides a simplified interface for managing a single-validator
 * Docker testnet for development and testing. It wraps the @atomica/docker-testnet SDK.
 *
 * KEY CHANGES FROM OLD VERSION:
 * - ✅ No longer requires local `aptos` binary
 * - ✅ Uses Docker instead of `aptos node run-local-testnet`
 * - ✅ Production-like account funding (no HTTP faucet on port 8081)
 * - ✅ More reliable and portable
 *
 * USAGE PATTERNS:
 *
 * Meta Tests (Node.js):
 *   import { setupLocalnet, fundAccount, deployContracts } from "../../test-utils/localnet";
 *   await setupLocalnet();
 *   await fundAccount(address, 1_000_000_000);
 *   await deployContracts();
 *
 * Browser Tests (via commands):
 *   import { commands } from 'vitest/browser';
 *   await commands.setupLocalnet();
 *   await commands.fundAccount(address, 1_000_000_000);
 *   await commands.deployContracts();
 *
 * MIGRATION GUIDE:
 * - `setupLocalnet()` - Works the same, but uses Docker (1 validator)
 * - `fundAccount(address, amount)` - Now uses Core Resources account (not HTTP)
 * - `deployContracts()` - Works the same, uses AptosClient API
 * - `runAptosCmd()` - REMOVED (use AptosClient API instead)
 * - `killZombies()` - REMOVED (Docker handles cleanup)
 * - Ports: Validator on 8080 (no faucet on 8081 anymore)
 *
 * See: ../docker-testnet/typescript-sdk/README.md
 */

import { DockerTestnet } from "@atomica/docker-testnet";
import { resolve as pathResolve, dirname } from "path";
import { fileURLToPath } from "url";

/**
 * Global testnet instance (singleton for all tests in a process)
 */
let testnet: DockerTestnet | null = null;

/**
 * Flag indicating localnet has been set up and is ready
 */
let setupComplete = false;

/**
 * CRITICAL PATH CONSTANTS
 */
const TEST_SETUP_DIR = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = pathResolve(TEST_SETUP_DIR, "..");

/**
 * Fixed deployer private key for deployContracts() function.
 * This is a TEST KEY - never use in production!
 */
const DEPLOYER_PK =
  "0x52a0d787625121df4e45d1d6a36f71dce7466710404f22ae3f21156828551717";

/**
 * Address derived from DEPLOYER_PK.
 * Used as the deployment address for Atomica contracts.
 */
const DEPLOYER_ADDR =
  "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";

/** Path to atomica-move-contracts directory (relative to WEB_DIR) */
const CONTRACTS_DIR = pathResolve(WEB_DIR, "../atomica-move-contracts");

/**
 * Start Docker-based local testnet with a single validator.
 *
 * THIS IS THE MAIN ENTRY POINT for test infrastructure setup.
 *
 * WHAT IT DOES:
 * 1. Creates a fresh Docker testnet with 1 validator
 * 2. Waits for validator to be healthy (~30-45 seconds)
 * 3. Sets setupComplete = true
 *
 * IDEMPOTENCY:
 * - setupComplete flag prevents duplicate startup
 * - Safe to call multiple times
 *
 * PORTS:
 * - Validator API: http://127.0.0.1:8080
 * - No faucet service (funding via Core Resources account)
 *
 * USAGE:
 *   Meta Tests:
 *     import { setupLocalnet } from "../../test-utils/localnet";
 *
 *     describe.sequential("My Test", () => {
 *       beforeAll(async () => {
 *         await setupLocalnet();
 *       }, 120000);  // 2 min timeout
 *     });
 *
 *   Browser Tests:
 *     import { commands } from 'vitest/browser';
 *
 *     describe.sequential("My Browser Test", () => {
 *       beforeAll(async () => {
 *         await commands.setupLocalnet();
 *       }, 120000);
 *     });
 *
 * @throws Error if testnet fails to start
 */
export async function setupLocalnet(): Promise<void> {
  // Guard against double setup
  if (setupComplete && testnet) {
    console.log("[setupLocalnet] Already running, skipping setup");
    return;
  }

  console.log("Starting Docker-based localnet (1 validator)...");

  // Create a single-validator testnet
  testnet = await DockerTestnet.new(1);

  console.log("✓ Localnet ready");
  setupComplete = true;
}

/**
 * Fund an account using the Core Resources account (0xA550C18).
 *
 * WHAT IT DOES:
 * - Uses testnet.faucet() from docker-testnet SDK
 * - Transfers funds from Core Resources account
 * - Creates account if it doesn't exist
 * - Waits for balance to be queryable
 *
 * MIGRATION NOTE:
 * - Old: HTTP POST to http://127.0.0.1:8081/mint
 * - New: Direct blockchain transaction from Core Resources account
 * - More production-like and reliable
 *
 * USAGE:
 *   Meta Tests:
 *     import { fundAccount } from "../../test-utils/localnet";
 *     await fundAccount(account.accountAddress.toString(), 1_000_000_000);
 *
 *   Browser Tests:
 *     import { commands } from 'vitest/browser';
 *     await commands.fundAccount(address, 1_000_000_000);
 *
 * @param address - Aptos account address (0x... format)
 * @param amount - Amount in octas (default: 100_000_000 = 1 APT)
 * @returns Transaction hash from faucet
 * @throws Error if testnet not running or funding fails
 */
export async function fundAccount(
  address: string,
  amount: number = 100_000_000,
): Promise<string> {
  if (!testnet) {
    throw new Error("Localnet not running. Call setupLocalnet() first.");
  }

  console.log(`[fundAccount] Funding ${address} with ${amount} octas...`);

  // Convert number to bigint for SDK
  const txHash = await testnet.faucet(address, BigInt(amount));

  console.log(`[fundAccount] Success: ${txHash}`);
  return txHash;
}

/** Guard flag to prevent duplicate contract deployments */
let contractsDeployed = false;

/**
 * Deploy Atomica contracts to localnet.
 *
 * WHAT IT DOES:
 * 1. Uses Docker container's aptos CLI (no local binary needed!)
 * 2. Copies contracts into validator container
 * 3. Publishes atomica-move-contracts package
 * 4. Initializes registry module
 * 5. Initializes fake_eth module
 * 6. Initializes fake_usd module
 *
 * KEY BENEFIT:
 * - No local `aptos` binary needed AT ALL! ✅
 * - Uses aptos CLI from inside the Docker validator container
 * - Completely self-contained
 *
 * IMPORTANT:
 * - Localnet must be running first (call setupLocalnet())
 * - Takes ~30-60 seconds to complete
 * - Modules deployed: registry, fake_eth, fake_usd
 * - Contracts deployed to DEPLOYER_ADDR
 *
 * @throws Error if localnet not running or deployment fails
 */
export async function deployContracts(): Promise<void> {
  if (!testnet) {
    throw new Error("Localnet not running. Call setupLocalnet() first.");
  }

  // Guard against double deployment
  if (contractsDeployed) {
    console.log("[deployContracts] Already deployed, skipping");
    return;
  }

  console.log("Deploying Contracts using Docker container...");

  // Use SDK's deployContracts method - it uses aptos CLI from inside the container!
  await testnet.deployContracts({
    contractsDir: CONTRACTS_DIR,
    deployerPrivateKey: DEPLOYER_PK,
    deployerAddress: DEPLOYER_ADDR,
    namedAddresses: { atomica: "default" },
    initFunctions: [
      {
        functionId: "default::registry::initialize",
        args: ["hex:0123456789abcdef"],
      },
      {
        functionId: "default::fake_eth::initialize",
        args: [],
      },
      {
        functionId: "default::fake_usd::initialize",
        args: [],
      },
    ],
    fundAmount: 10_000_000_000n, // 100 APT
  });

  console.log("✓ Contracts Deployed!");
  contractsDeployed = true;
}

/**
 * Tear down the localnet and clean up all resources.
 *
 * WHAT IT DOES:
 * - Stops Docker testnet
 * - Removes all containers and volumes
 * - Resets state flags
 *
 * USAGE:
 *   await teardownLocalnet();
 *
 * NOTE: Usually not needed in tests (automatic cleanup on process exit)
 */
export async function teardownLocalnet(): Promise<void> {
  if (!testnet) {
    console.log("[teardownLocalnet] No testnet running");
    return;
  }

  console.log("Tearing down localnet...");
  await testnet.teardown();

  testnet = null;
  setupComplete = false;
  contractsDeployed = false;

  console.log("✓ Localnet torn down");
}

/**
 * Get the underlying Docker testnet instance.
 *
 * This is useful for advanced operations that need direct access to the testnet.
 *
 * @returns Docker testnet instance
 * @throws Error if testnet not running
 */
export function getTestnet(): DockerTestnet {
  if (!testnet) {
    throw new Error("Localnet not running. Call setupLocalnet() first.");
  }
  return testnet;
}
