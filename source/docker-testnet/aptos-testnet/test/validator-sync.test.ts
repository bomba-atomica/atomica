import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { setupLocalnet, getTestnet } from "../src/localnet";

describe.sequential("Validator Synchronization", () => {
    let numValidators: number;

    beforeAll(async () => {
        await setupLocalnet();
        const testnet = getTestnet();
        numValidators = testnet.getNumValidators();
    }, 300000);

    afterAll(async () => {
        const testnet = getTestnet();
        await testnet.teardown();
    });

    test("should verify all validators are in sync", async () => {
        const testnet = getTestnet();
        expect(testnet).toBeDefined();

        console.log("\nVerifying validator synchronization...");
        const ledgerInfos = await Promise.all(
            Array.from({ length: numValidators }, (_, i) => testnet.getLedgerInfo(i)),
        );

        const epochs = ledgerInfos.map((info) => info.epoch);
        const uniqueEpochs = new Set(epochs);
        console.log(`Epochs: ${epochs.join(", ")}`);
        expect(uniqueEpochs.size).toBe(1);

        const blockHeights = ledgerInfos.map((info) => parseInt(info.block_height));
        const minHeight = Math.min(...blockHeights);
        const maxHeight = Math.max(...blockHeights);
        const heightDiff = maxHeight - minHeight;

        console.log(`Block heights: ${blockHeights.join(", ")} (diff: ${heightDiff})`);
        expect(heightDiff).toBeLessThanOrEqual(5);

        console.log("✓ All validators are synchronized");
    });
});
