import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { setupLocalnet, getTestnet, teardownLocalnet } from "../src/localnet";
import { checkValidatorSync } from "../src/sync-check";

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
        console.log(`Epochs: ${epochs.join(", ")}`);
        expect(new Set(epochs).size).toBe(1);

        // Every validator must commit 3 blocks past the highest height seen, and
        // all must agree on the block hash at that height. A halted validator or a
        // fork at equal height fails here.
        const result = await checkValidatorSync(
            {
                numValidators,
                getHeight: (i) => testnet.getBlockHeight(i),
                getBlockHash: (i, h) => testnet.getBlockHash(i, h),
            },
            { margin: 3, timeoutMs: 60_000 },
        );

        console.log(
            `Start max height ${result.maxHeight} (hash ${result.blockHash}); ` +
                `final heights: ${result.finalHeights.join(", ")}`,
        );
        console.log("✓ All validators are synchronized");
    }, 120000);
});
