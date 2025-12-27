import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { DockerTestnet } from "../src/index";

describe("Docker Testnet SDK Verification", () => {
    let testnet: DockerTestnet;
    const NUM_VALIDATORS = 4;

    beforeAll(async () => {
        console.log("Initializing testnet...");
        testnet = await DockerTestnet.new(NUM_VALIDATORS);
    }, 300000); // 5 min timeout for setup

    afterAll(async () => {
        console.log("Tearing down...");
        if (testnet) {
            await testnet.teardown();
        }
    });

    test("should have correct number of validators", () => {
        expect(testnet.getNumValidators()).toBe(NUM_VALIDATORS);
    });

    test("should check validator connectivity and LedgerInfo", async () => {
        console.log("Checking validator connectivity and LedgerInfo...");
        for (let i = 0; i < NUM_VALIDATORS; i++) {
            const url = testnet.validatorApiUrl(i);
            console.log(`Validator ${i}: ${url}`);

            const info = await testnet.getLedgerInfo(i);
            console.log(`  Chain ID: ${info.chain_id}`);
            console.log(`  Epoch: ${info.epoch}`);
            console.log(`  Block Height: ${info.block_height}`);
            console.log(`  Ledger Version: ${info.ledger_version}`);

            expect(info.chain_id).toBe(4);
        }
    });

    test("should verify block production", async () => {
        console.log("\nVerifying block production...");
        const initialHeight = await testnet.getBlockHeight(0);
        console.log(`Initial Height: ${initialHeight}`);

        console.log("Waiting for 5 blocks...");
        await testnet.waitForBlocks(5, 30); // 5 blocks, 30s timeout

        const finalHeight = await testnet.getBlockHeight(0);
        console.log(`Final Height: ${finalHeight}`);

        expect(finalHeight).toBeGreaterThan(initialHeight);
        console.log("✓ Block production verified!");
    }, 60000); // 1 minute timeout
});
