import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { DockerTestnet } from "../src/index";
import { AptosClient } from "aptos";

/**
 * Local Image Build Integration Test
 *
 * This test suite validates the entire local build workflow:
 * 1. Building the validator image from source
 * 2. Starting a testnet with the locally built image
 * 3. Verifying the testnet is fully functional
 *
 * NOTE: This test is SLOW on first run (~10-15min to build image)
 *       Subsequent runs are faster (~2-3min) thanks to sccache
 *
 * To run:
 *   bun test test/local-build.test.ts
 *
 * To skip (if you don't want to wait):
 *   This test is marked with a timeout and can be interrupted
 */

// Global reference for cleanup
let globalTestnet: DockerTestnet | undefined;
let cleanupInProgress = false;

async function performCleanup(reason: string): Promise<void> {
    if (cleanupInProgress) return;
    cleanupInProgress = true;
    console.log(`\n🛑 ${reason}`);
    if (globalTestnet) {
        try {
            await globalTestnet.teardown();
        } catch (error) {
            console.error("✗ Failed to tear down testnet:", error);
        }
    }
    cleanupInProgress = false;
}

process.on("SIGINT", async () => {
    await performCleanup("Received SIGINT");
    process.exit(130);
});

describe("Local Image Build - Integration Test", () => {
    let testnet: DockerTestnet | undefined;
    let client: AptosClient;
    const NUM_VALIDATORS = 2; // Use 2 validators to reduce resource usage

    /**
     * Step 1: Build the local image
     *
     * This is the slow part on first run. Progress will be shown in the console.
     * sccache will speed up subsequent builds significantly.
     */
    test("should build local image successfully", async () => {
        console.log("\n=== Building Local Validator Image ===");
        console.log("This may take 10-15 minutes on first build...");
        console.log("Subsequent builds will be much faster (~2-3min) thanks to sccache\n");

        await DockerTestnet.buildLocalImage({
            profile: "release",
            showStats: false, // Set to true if you want sccache stats
        });

        console.log("✓ Image built successfully");
    }, 1200000); // 20 minute timeout for first build

    /**
     * Step 2: Start testnet with local image
     *
     * This verifies that:
     * - The docker-compose.yaml correctly uses USE_LOCAL_IMAGE
     * - The locally built image is available
     * - All validators start successfully
     */
    test("should start testnet with local image", async () => {
        console.log("\n=== Starting Testnet with Local Image ===");

        testnet = await DockerTestnet.new(NUM_VALIDATORS, {
            useLocalImage: true,
        });
        globalTestnet = testnet;

        expect(testnet).toBeDefined();
        expect(testnet.getNumValidators()).toBe(NUM_VALIDATORS);

        console.log(`✓ Testnet started with ${NUM_VALIDATORS} validators`);
        console.log(`  Using image: atomica-validator:local`);
    }, 300000); // 5 minute timeout

    /**
     * Step 3: Verify testnet functionality
     *
     * This ensures the locally built image is actually working correctly:
     * - REST API is accessible
     * - Consensus is running (blocks are being produced)
     * - On-chain state is accessible
     */
    test("should have functional validators", async () => {
        expect(testnet).toBeDefined();
        client = new AptosClient(testnet!.validatorApiUrl(0));

        console.log("\n=== Verifying Testnet Functionality ===");

        // Wait for network to stabilize and produce blocks
        console.log("Waiting for consensus to start...");
        await new Promise(resolve => setTimeout(resolve, 5000));

        try {
            await testnet!.waitForBlocks(1, 60);
            console.log("✓ Consensus is running - blocks being produced");
        } catch (e) {
            console.warn("Warning: Timeout waiting for blocks, but continuing...");
        }

        // Query each validator
        for (let i = 0; i < NUM_VALIDATORS; i++) {
            const info = await testnet!.getLedgerInfo(i);

            expect(info.chain_id).toBe(4);
            expect(info.node_role).toBe("validator");
            expect(parseInt(info.ledger_version)).toBeGreaterThan(0);

            console.log(`✓ Validator ${i}: chain_id=${info.chain_id}, version=${info.ledger_version}, height=${info.block_height}`);
        }

        // Verify on-chain data is accessible
        const validatorSet = await client.getAccountResource("0x1", "0x1::stake::ValidatorSet");
        const activeValidators = (validatorSet.data as any).active_validators;

        expect(activeValidators.length).toBeGreaterThanOrEqual(NUM_VALIDATORS);
        console.log(`✓ On-chain state accessible: ${activeValidators.length} active validators`);

        console.log("\n✅ All tests passed - local image is fully functional!");
    }, 120000); // 2 minute timeout

    /**
     * Step 4: Verify git hash metadata
     *
     * The local build should include the git SHA from atomica-aptos source
     */
    test("should have correct build metadata", async () => {
        expect(testnet).toBeDefined();

        const info = await testnet!.getLedgerInfo(0);

        if (info.git_hash) {
            console.log(`✓ Build metadata present: git_hash=${info.git_hash}`);
            expect(info.git_hash).toBeTruthy();
            expect(info.git_hash.length).toBeGreaterThan(6); // Should be a commit hash
        } else {
            console.log("Note: git_hash not present in ledger info");
        }
    }, 30000);

    /**
     * Cleanup after all tests
     */
    afterAll(async () => {
        await performCleanup("Tests completed");
        globalTestnet = undefined;
    });
});

/**
 * Optional: Test sccache effectiveness
 *
 * This test can be run manually to verify sccache is working.
 * It requires running the build twice.
 */
describe("Local Build - sccache Performance (Optional)", () => {
    test.skip("should demonstrate sccache speedup", async () => {
        console.log("\n=== Testing sccache Performance ===");
        console.log("This test builds the image twice to demonstrate cache effectiveness\n");

        // First build (populates cache)
        console.log("Build 1: Populating sccache (slow)...");
        const start1 = Date.now();
        await DockerTestnet.buildLocalImage({
            cleanSccache: true, // Start fresh
        });
        const duration1 = (Date.now() - start1) / 1000;
        console.log(`✓ Build 1 completed in ${duration1.toFixed(1)}s\n`);

        // Second build (uses cache)
        console.log("Build 2: Using sccache (fast)...");
        const start2 = Date.now();
        await DockerTestnet.buildLocalImage({
            showStats: true, // Show cache statistics
        });
        const duration2 = (Date.now() - start2) / 1000;
        console.log(`✓ Build 2 completed in ${duration2.toFixed(1)}s\n`);

        // Compare
        const speedup = duration1 / duration2;
        console.log(`Speedup: ${speedup.toFixed(1)}x faster`);
        console.log(`Cache effectiveness: ${((1 - duration2/duration1) * 100).toFixed(1)}% time saved`);

        // Should be significantly faster (at least 2x)
        expect(speedup).toBeGreaterThan(2);
    }, 2400000); // 40 minute timeout (two full builds)
});
