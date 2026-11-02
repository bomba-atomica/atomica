import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { setupLocalnet, getTestnet, teardownLocalnet } from "../src/localnet";

describe.sequential("Validator Synchronization", () => {
    let numValidators: number;

    beforeAll(async () => {
        await setupLocalnet();
        const testnet = getTestnet();
        numValidators = testnet.getNumValidators();
    }, 300000);

    afterAll(async () => {
        await teardownLocalnet();
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

        // Validators are sampled one by one while blocks land several times a
        // second, so a snapshot gap alone is noisy. Sync means every validator
        // reaches the highest height seen within a short window.
        const deadline = Date.now() + 30_000;
        let laggards: number[] = [];
        do {
            const now = await Promise.all(
                Array.from({ length: numValidators }, (_, i) => testnet.getLedgerInfo(i)),
            );
            laggards = now
                .map((info, i) => (parseInt(info.block_height) >= maxHeight ? -1 : i))
                .filter((i) => i >= 0);
            if (laggards.length === 0) break;
            await new Promise((r) => setTimeout(r, 500));
        } while (Date.now() < deadline);

        expect(laggards, `validators behind height ${maxHeight}`).toEqual([]);

        console.log("✓ All validators are synchronized");
    });
});
