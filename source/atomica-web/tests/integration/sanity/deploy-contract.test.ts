// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLocalnet, teardownLocalnet, runAptosCmd, fundAccount } from '../../setup/localnet';
import { Aptos, AptosConfig, Network, Account } from '@aptos-labs/ts-sdk';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Test: Move Contract Deployment
 *
 * Purpose:
 * This test verifies that Move smart contracts can be compiled and deployed
 * to the local testnet. It demonstrates the complete contract deployment workflow
 * that developers will use when publishing their Move modules.
 *
 * What the test does:
 * 1. Generates a deployer account with a new Ed25519 key pair
 * 2. Funds the deployer account with 1,000,000,000 octas (10 APT) for gas fees
 * 3. Initializes the Aptos CLI with the deployer's private key
 * 4. Compiles and publishes the "noop" Move module using the Aptos CLI
 * 5. Queries the blockchain to verify the module was deployed
 * 6. Checks that the module's ABI contains the expected "do_nothing" function
 *
 * About the noop contract:
 * - Location: tests/fixtures/noop/
 * - Simple module with one public entry function: do_nothing()
 * - Used as a minimal test case to verify contract deployment works
 * - The function does nothing (hence "noop" = no operation)
 *
 * How Move contract deployment works on Aptos:
 * - Each account can publish Move modules under its address
 * - Module address is determined by the deployer's account address
 * - Named addresses in Move.toml are resolved at publish time
 * - The "noop=default" parameter maps the "noop" address to the deployer
 * - Deployment requires:
 *   1. aptos init: Configure CLI with deployer's private key
 *   2. aptos move publish: Compile and publish the module
 * - After deployment, the module is stored at the deployer's address
 * - Module ABI (Application Binary Interface) describes public functions
 *
 * Gas and deployment costs:
 * - Publishing a module requires gas fees (paid by deployer)
 * - Larger contracts cost more to deploy
 * - The noop contract is tiny, so deployment is cheap
 * - Deployer must be funded before publishing
 *
 * Common expectations:
 * - Module is deployed to the deployer's account address
 * - Module name matches the module definition ("noop")
 * - Module ABI contains all public/entry functions
 * - Functions can be called after deployment using entry function calls
 * - Modules are immutable once deployed (cannot be updated, only new versions)
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = new AptosConfig({
    network: Network.CUSTOM,
    fullnode: "http://127.0.0.1:8080/v1",
    faucet: "http://127.0.0.1:8081"
});
const aptos = new Aptos(config);

describe.sequential('Move Contract Deployment', () => {
    beforeAll(async () => {
        await setupLocalnet();
    }, 120000);

    afterAll(async () => {
        await teardownLocalnet();
    });

    it('should deploy a noop contract', async () => {
        console.log("Starting contract deployment test...");

        // Generate deployer account
        const deployer = Account.generate();
        console.log(`Deployer address: ${deployer.accountAddress.toString()}`);

        // Verify deployer starts with 0 balance
        const initialBalance = await aptos.getAccountAPTAmount({ accountAddress: deployer.accountAddress });
        console.log(`Deployer initial balance: ${initialBalance}`);
        expect(initialBalance).toBe(0);

        // Fund deployer with 1 billion octas (10 APT)
        console.log("Funding deployer...");
        await fundAccount(deployer.accountAddress.toString(), 1_000_000_000);

        // Wait a moment for funding to be indexed
        await new Promise(r => setTimeout(r, 1000));

        // Verify deployer was funded
        const fundedBalance = await aptos.getAccountAPTAmount({ accountAddress: deployer.accountAddress });
        console.log(`Deployer balance after funding: ${fundedBalance}`);
        expect(fundedBalance).toBe(1_000_000_000);

        // Path to noop contract
        const NOOP_DIR = resolve(__dirname, '../../fixtures/noop');
        console.log(`Noop contract directory: ${NOOP_DIR}`);

        // Compile and publish the noop module directly without aptos init
        // This avoids the side effect of aptos init auto-funding the account
        console.log("Publishing noop module...");
        await runAptosCmd([
            "move", "publish",
            "--named-addresses", `noop=${deployer.accountAddress.toString()}`,
            "--private-key", deployer.privateKey.toString(),
            "--url", "http://127.0.0.1:8080",
            "--assume-yes"
        ], NOOP_DIR);

        // Check if module exists on-chain
        console.log("Verifying module deployment...");
        const modules = await aptos.getAccountModules({ accountAddress: deployer.accountAddress });
        console.log(`Found ${modules.length} module(s) at deployer address`);

        const noopModule = modules.find(m => m.abi?.name === "noop");
        expect(noopModule).toBeDefined();
        console.log(`Noop module found: ${noopModule?.abi?.name}`);

        // Verify the module has the expected function
        const hasDoNothing = noopModule?.abi?.exposed_functions.some(f => f.name === "do_nothing");
        expect(hasDoNothing).toBe(true);
        console.log("Module has 'do_nothing' function: true");

        // Log all exposed functions
        const functionNames = noopModule?.abi?.exposed_functions.map(f => f.name) || [];
        console.log(`Exposed functions: ${functionNames.join(', ')}`);

        // Check deployer's final balance (should be less than initial 1B due to deployment gas)
        const finalBalance = await aptos.getAccountAPTAmount({ accountAddress: deployer.accountAddress });
        console.log(`Deployer final balance: ${finalBalance}`);
        const gasUsed = 1_000_000_000 - finalBalance;
        console.log(`Gas used for deployment: ${gasUsed} octas`);

        // Deployment gas should be relatively small (< 1M octas)
        expect(finalBalance).toBeLessThan(1_000_000_000);
        expect(gasUsed).toBeGreaterThan(0);
        expect(gasUsed).toBeLessThan(1_000_000); // Deployment should cost less than 1M octas
    }, 180000); // 180s timeout (3 minutes) - allows time for downloading git dependencies
});
