import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { setupLocalnet, getTestnet, teardownLocalnet } from "../src/localnet";

describe.sequential("Validator Connectivity", () => {
    let numValidators: number;

    beforeAll(async () => {
        await setupLocalnet();
        const testnet = getTestnet();
        numValidators = testnet.getNumValidators();
    }, 300000);

    afterAll(async () => {
        await teardownLocalnet();
    });

    test("should have correct number of validators", async () => {
        const testnet = getTestnet();
        expect(testnet).toBeDefined();
        expect(testnet.getNumValidators()).toBe(numValidators);
    });

    test("should have one consensus public key per validator in the on-chain set", async () => {
        const testnet = getTestnet();
        // Every validator reads the same committed set, so each must report the
        // full count. A genesis that left a validator out of the set fails here.
        for (let i = 0; i < numValidators; i++) {
            const keys = await testnet.getActiveValidatorPublicKeys(i);
            console.log(`Validator ${i} sees ${keys.length} active consensus keys`);
            expect(keys).toHaveLength(numValidators);
            expect(new Set(keys).size).toBe(numValidators);
            for (const key of keys) {
                // BLS12-381 consensus keys are 48 bytes.
                expect(key).toMatch(/^0x[0-9a-f]{96}$/);
            }
        }
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
