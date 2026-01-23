import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { DockerTestnet } from "../src/index";
import {
    initializeTestnet,
    performCleanup,
    registerCleanupHandlers,
    setGlobalTestnet,
} from "./helpers/testnet-lifecycle";

// Register cleanup handlers once at module load
registerCleanupHandlers();

describe("Block Production", () => {
    let testnet: DockerTestnet;
    const NUM_VALIDATORS = 2;

    beforeAll(async () => {
        testnet = await initializeTestnet(NUM_VALIDATORS);
    }, 300000); // 5 min timeout for setup

    afterAll(async () => {
        await performCleanup("Block production tests completed");
        setGlobalTestnet(undefined);
    });

    test("should verify block production", async () => {
        expect(testnet).toBeDefined();

        console.log("\nVerifying block production...");
        const initialHeight = await testnet.getBlockHeight(0);
        console.log(`Initial Height: ${initialHeight}`);

        console.log("Waiting for 5 blocks...");
        await testnet.waitForBlocks(5, 30); // 5 blocks, 30s timeout

        const finalHeight = await testnet.getBlockHeight(0);
        console.log(`Final Height: ${finalHeight}`);

        expect(finalHeight).toBeGreaterThan(initialHeight);
        expect(finalHeight - initialHeight).toBeGreaterThanOrEqual(5);
        console.log("✓ Block production verified!");
    }, 60000); // 1 minute timeout
});
