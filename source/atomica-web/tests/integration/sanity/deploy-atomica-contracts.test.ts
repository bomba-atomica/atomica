// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLocalnet, teardownLocalnet, runAptosCmd, fundAccount } from '../../setup/localnet';
import { Aptos, AptosConfig, Network, Account } from '@aptos-labs/ts-sdk';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

/**
 * Test: Atomica Contract Deployment
 *
 * Purpose:
 * This test verifies that the Atomica Move smart contracts (fake_eth, fake_usd, registry)
 * can be compiled and deployed to the local testnet, and that they are discoverable
 * at the expected address with the correct module names.
 *
 * What the test does:
 * 1. Generates a deployer account with a new Ed25519 key pair
 * 2. Funds the deployer account with APT for gas fees
 * 3. Publishes the atomica-move-contracts package using the Aptos CLI
 * 4. Queries the blockchain to verify all expected modules were deployed:
 *    - registry
 *    - fake_eth
 *    - fake_usd
 * 5. Verifies each module contains the expected entry functions
 *
 * Expected modules and functions:
 * - registry: initialize, get_aptos_address, get_nonce
 * - fake_eth: initialize, mint, get_metadata
 * - fake_usd: initialize, mint, get_metadata
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = new AptosConfig({
    network: Network.CUSTOM,
    fullnode: "http://127.0.0.1:8080/v1",
    faucet: "http://127.0.0.1:8081"
});
const aptos = new Aptos(config);

describe.sequential('Atomica Contract Deployment', () => {
    beforeAll(async () => {
        await setupLocalnet();
    }, 120000);

    afterAll(async () => {
        await teardownLocalnet();
    });

    it('should deploy atomica contracts and verify modules exist', async () => {
        console.log("Starting Atomica contract deployment test...");

        // Generate deployer account
        const deployer = Account.generate();
        console.log(`Deployer address: ${deployer.accountAddress.toString()}`);

        // Fund deployer with 10 APT
        console.log("Funding deployer...");
        await fundAccount(deployer.accountAddress.toString(), 1_000_000_000);

        // Wait for funding to be indexed
        await new Promise(r => setTimeout(r, 1000));

        // Verify deployer was funded
        const fundedBalance = await aptos.getAccountAPTAmount({ accountAddress: deployer.accountAddress });
        console.log(`Deployer balance after funding: ${fundedBalance}`);
        expect(fundedBalance).toBe(1_000_000_000);

        // Path to atomica-move-contracts
        const CONTRACTS_DIR = resolve(__dirname, '../../../../atomica-move-contracts');
        console.log(`Contracts directory: ${CONTRACTS_DIR}`);

        // Publish the atomica-move-contracts package
        console.log("Publishing atomica contracts...");
        await runAptosCmd([
            "move", "publish",
            "--package-dir", CONTRACTS_DIR,
            "--named-addresses", `atomica=${deployer.accountAddress.toString()}`,
            "--private-key", deployer.privateKey.toString(),
            "--url", "http://127.0.0.1:8080",
            "--assume-yes"
        ]);

        // Wait for deployment to be indexed
        await new Promise(r => setTimeout(r, 2000));

        // Check if modules exist on-chain
        console.log("Verifying module deployment...");
        const modules = await aptos.getAccountModules({ accountAddress: deployer.accountAddress });
        console.log(`Found ${modules.length} module(s) at deployer address`);

        // Log all module names
        const moduleNames = modules.map(m => m.abi?.name || 'unknown');
        console.log(`Module names: ${moduleNames.join(', ')}`);

        // Verify expected modules exist
        const expectedModules = ['registry', 'fake_eth', 'fake_usd'];

        for (const expectedModule of expectedModules) {
            const module = modules.find(m => m.abi?.name === expectedModule);
            expect(module, `Module ${expectedModule} should be deployed`).toBeDefined();
            console.log(`✓ Module '${expectedModule}' found`);
        }

        // Verify registry module has expected functions
        const registryModule = modules.find(m => m.abi?.name === 'registry');
        expect(registryModule?.abi?.exposed_functions.some(f => f.name === 'initialize')).toBe(true);
        expect(registryModule?.abi?.exposed_functions.some(f => f.name === 'get_aptos_address')).toBe(true);
        expect(registryModule?.abi?.exposed_functions.some(f => f.name === 'get_nonce')).toBe(true);
        console.log("✓ Registry module has expected functions");

        // Verify fake_eth module has expected functions
        const fakeEthModule = modules.find(m => m.abi?.name === 'fake_eth');
        expect(fakeEthModule?.abi?.exposed_functions.some(f => f.name === 'initialize')).toBe(true);
        expect(fakeEthModule?.abi?.exposed_functions.some(f => f.name === 'mint')).toBe(true);
        expect(fakeEthModule?.abi?.exposed_functions.some(f => f.name === 'get_metadata')).toBe(true);
        console.log("✓ fake_eth module has expected functions");

        // Verify fake_usd module has expected functions
        const fakeUsdModule = modules.find(m => m.abi?.name === 'fake_usd');
        expect(fakeUsdModule?.abi?.exposed_functions.some(f => f.name === 'initialize')).toBe(true);
        expect(fakeUsdModule?.abi?.exposed_functions.some(f => f.name === 'mint')).toBe(true);
        expect(fakeUsdModule?.abi?.exposed_functions.some(f => f.name === 'get_metadata')).toBe(true);
        console.log("✓ fake_usd module has expected functions");

        // Check deployer's final balance (should be less than initial due to deployment gas)
        const finalBalance = await aptos.getAccountAPTAmount({ accountAddress: deployer.accountAddress });
        console.log(`Deployer final balance: ${finalBalance}`);
        const gasUsed = 1_000_000_000 - finalBalance;
        console.log(`Gas used for deployment: ${gasUsed} octas`);

        expect(finalBalance).toBeLessThan(1_000_000_000);
        expect(gasUsed).toBeGreaterThan(0);

        console.log("\n✅ All Atomica contracts deployed and verified successfully!");
    }, 180000); // 3 minutes timeout
});
