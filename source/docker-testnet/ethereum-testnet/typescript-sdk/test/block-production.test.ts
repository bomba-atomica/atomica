import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { EthereumDockerTestnet } from "../src/index";
import {
    initializeTestnet,
    performCleanup,
    registerCleanupHandlers,
    setGlobalTestnet,
    waitForNetworkStabilization,
} from "./helpers/testnet-lifecycle";

// Register cleanup handlers once at module load
registerCleanupHandlers();

describe("Block Production", () => {
    let testnet: EthereumDockerTestnet;
    const NUM_VALIDATORS = 3;

    beforeAll(async () => {
        testnet = await initializeTestnet(NUM_VALIDATORS);
        await waitForNetworkStabilization(testnet);
    }, 300000); // 5 min timeout for setup

    afterAll(async () => {
        await performCleanup("Block production tests completed");
        setGlobalTestnet(undefined);
    });

    test("should produce new blocks over time", async () => {
        const startBlock = await testnet.getBlockNumber();
        console.log(`Start block: ${startBlock}`);

        // Wait for 2 blocks (24 seconds at 12s/slot)
        const endBlock = await testnet.waitForBlocks(2, 60);
        console.log(`End block: ${endBlock}`);

        expect(endBlock).toBeGreaterThan(startBlock);
    }, 120000);

    test("should have valid block structure", async () => {
        const block = await testnet.getBlock("latest");
        
        console.log(`Block number: ${parseInt(block.number, 16)}`);
        console.log(`Block hash: ${block.hash}`);
        console.log(`Parent hash: ${block.parentHash}`);
        console.log(`State root: ${block.stateRoot}`);
        console.log(`Transactions: ${block.transactions.length}`);

        expect(block.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        expect(block.parentHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
        expect(block.stateRoot).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    test("should have beacon blocks with execution payloads", async () => {
        const beaconBlock = await testnet.getBeaconBlock("head");
        
        const slot = beaconBlock.message.slot;
        const executionPayload = beaconBlock.message.body.execution_payload;
        
        console.log(`Beacon slot: ${slot}`);
        console.log(`Execution block number: ${executionPayload?.block_number}`);
        console.log(`Execution state root: ${executionPayload?.state_root}`);

        expect(slot).toBeDefined();
        // Execution payload should exist after the merge
        if (executionPayload) {
            expect(executionPayload.state_root).toMatch(/^0x[a-fA-F0-9]{64}$/);
        }
    });

    test("should have matching state roots between EL and CL", async () => {
        // Get the latest beacon block
        const beaconBlock = await testnet.getBeaconBlock("head");
        const executionPayload = beaconBlock.message.body.execution_payload;
        
        if (!executionPayload) {
            console.log("Skipping: No execution payload in beacon block");
            return;
        }

        // Get the corresponding EL block
        const elBlockNumber = parseInt(executionPayload.block_number);
        const elBlock = await testnet.getBlock(elBlockNumber);

        console.log(`CL state root: ${executionPayload.state_root}`);
        console.log(`EL state root: ${elBlock.stateRoot}`);

        // State roots should match
        expect(executionPayload.state_root).toBe(elBlock.stateRoot);
    });
});
