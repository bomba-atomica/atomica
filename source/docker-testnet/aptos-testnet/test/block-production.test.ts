import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { setupLocalnet, getTestnet } from "../src/localnet";

describe.sequential("Block Production", () => {
    beforeAll(async () => {
        await setupLocalnet();
    }, 300000);

    afterAll(async () => {
        const testnet = getTestnet();
        await testnet.teardown();
    });

    test("should verify block production", async () => {
        const testnet = getTestnet();
        expect(testnet).toBeDefined();

        console.log("\nVerifying block production...");
        const initialHeight = await testnet.getBlockHeight(0);
        console.log(`Initial Height: ${initialHeight}`);

        console.log("Waiting for 5 blocks...");
        await testnet.waitForBlocks(5, 30);

        const finalHeight = await testnet.getBlockHeight(0);
        console.log(`Final Height: ${finalHeight}`);

        expect(finalHeight).toBeGreaterThan(initialHeight);
        expect(finalHeight - initialHeight).toBeGreaterThanOrEqual(5);
        console.log("✓ Block production verified!");
    }, 60000);
});
