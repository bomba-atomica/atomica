import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { setupLocalnet, getTestnet } from "../src/localnet";

describe.sequential("Validator Connectivity", () => {
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

    test("should have correct number of validators", async () => {
        const testnet = getTestnet();
        expect(testnet).toBeDefined();
        expect(testnet.getNumValidators()).toBe(numValidators);
    });

    test("should check validator connectivity and LedgerInfo", async () => {
        const testnet = getTestnet();
        expect(testnet).toBeDefined();

        console.log("Checking validator connectivity and LedgerInfo...");
        for (let i = 0; i < numValidators; i++) {
            const url = testnet.validatorApiUrl(i);
            console.log(`Validator ${i}: ${url}`);

            const info = await testnet.getLedgerInfo(i);
            console.log(`  Chain ID: ${info.chain_id}`);
            console.log(`  Epoch: ${info.epoch}`);
            console.log(`  Block Height: ${info.block_height}`);
            console.log(`  Ledger Version: ${info.ledger_version}`);
            console.log(`  Node Role: ${info.node_role}`);

            expect(info.chain_id).toBe(4);
            expect(info.node_role).toBe("validator");

            expect(parseInt(info.epoch)).toBeGreaterThanOrEqual(0);

            if (parseInt(info.epoch) > 0) {
                expect(parseInt(info.block_height)).toBeGreaterThan(0);
            }
        }

        console.log("✓ All validators are healthy and responding");
    });
});
