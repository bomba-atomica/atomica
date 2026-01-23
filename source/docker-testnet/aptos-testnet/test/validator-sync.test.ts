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

describe("Validator Synchronization", () => {
    let testnet: DockerTestnet;
    const NUM_VALIDATORS = 2;

    beforeAll(async () => {
        testnet = await initializeTestnet(NUM_VALIDATORS);
    }, 300000); // 5 min timeout for setup

    afterAll(async () => {
        await performCleanup("Validator synchronization tests completed");
        setGlobalTestnet(undefined);
    });

    test("should verify all validators are in sync", async () => {
        expect(testnet).toBeDefined();

        console.log("\nVerifying validator synchronization...");
        const ledgerInfos = await Promise.all(
            Array.from({ length: NUM_VALIDATORS }, (_, i) => testnet.getLedgerInfo(i)),
        );

        // All validators should be in the same epoch
        const epochs = ledgerInfos.map((info) => info.epoch);
        const uniqueEpochs = new Set(epochs);
        console.log(`Epochs: ${epochs.join(", ")}`);
        expect(uniqueEpochs.size).toBe(1);

        // Block heights should be very close (within a few blocks)
        const blockHeights = ledgerInfos.map((info) => parseInt(info.block_height));
        const minHeight = Math.min(...blockHeights);
        const maxHeight = Math.max(...blockHeights);
        const heightDiff = maxHeight - minHeight;

        console.log(`Block heights: ${blockHeights.join(", ")} (diff: ${heightDiff})`);
        expect(heightDiff).toBeLessThanOrEqual(5); // Allow small differences due to timing

        console.log("✓ All validators are synchronized");
    });
});
