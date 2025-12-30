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

describe("Validator Connectivity", () => {
    let testnet: DockerTestnet;
    const NUM_VALIDATORS = 2;

    beforeAll(async () => {
        testnet = await initializeTestnet(NUM_VALIDATORS);
    }, 300000); // 5 min timeout for setup

    afterAll(async () => {
        await performCleanup("Validator connectivity tests completed");
        setGlobalTestnet(undefined);
    });

    test("should have correct number of validators", () => {
        expect(testnet).toBeDefined();
        expect(testnet.getNumValidators()).toBe(NUM_VALIDATORS);
    });

    test("should check validator connectivity and LedgerInfo", async () => {
        expect(testnet).toBeDefined();

        console.log("Checking validator connectivity and LedgerInfo...");
        for (let i = 0; i < NUM_VALIDATORS; i++) {
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

            // Epoch should be >= 0 (at genesis or beyond)
            expect(parseInt(info.epoch)).toBeGreaterThanOrEqual(0);

            // If we're past genesis (epoch > 0), we should have blocks
            if (parseInt(info.epoch) > 0) {
                expect(parseInt(info.block_height)).toBeGreaterThan(0);
            }
        }

        console.log("✓ All validators are healthy and responding");
    });
});
