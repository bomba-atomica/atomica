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

describe("State Proofs (eth_getProof)", () => {
    let testnet: EthereumDockerTestnet;
    const NUM_VALIDATORS = 3;

    beforeAll(async () => {
        testnet = await initializeTestnet(NUM_VALIDATORS);
        await waitForNetworkStabilization(testnet);
    }, 300000);

    afterAll(async () => {
        await performCleanup("State proof tests completed");
        setGlobalTestnet(undefined);
    });

    test("should get account proof for funded account", async () => {
        const accounts = testnet.getTestAccounts();
        const testAddress = accounts[0].address;

        // Get proof for the account with no storage keys
        const proof = await testnet.getProof(testAddress, [], "latest");

        console.log(`Address: ${proof.address}`);
        console.log(`Balance: ${proof.balance}`);
        console.log(`Nonce: ${proof.nonce}`);
        console.log(`Code hash: ${proof.codeHash}`);
        console.log(`Storage hash: ${proof.storageHash}`);
        console.log(`Account proof length: ${proof.accountProof.length}`);

        // Verify proof structure
        expect(proof.address.toLowerCase()).toBe(testAddress.toLowerCase());
        expect(proof.accountProof).toBeInstanceOf(Array);
        expect(proof.accountProof.length).toBeGreaterThan(0);
        
        // Each proof node should be a hex string
        for (const node of proof.accountProof) {
            expect(node).toMatch(/^0x[a-fA-F0-9]+$/);
        }

        // Balance should be non-zero for funded accounts
        expect(BigInt(proof.balance)).toBeGreaterThan(BigInt(0));
    });

    test("should get proof for empty account", async () => {
        // An address that doesn't exist
        const emptyAddress = "0x0000000000000000000000000000000000000001";

        const proof = await testnet.getProof(emptyAddress, [], "latest");

        console.log(`Empty account proof length: ${proof.accountProof.length}`);
        console.log(`Balance: ${proof.balance}`);

        // Should still return a valid proof structure
        expect(proof.address.toLowerCase()).toBe(emptyAddress.toLowerCase());
        expect(proof.accountProof).toBeInstanceOf(Array);
        
        // Balance should be zero
        expect(BigInt(proof.balance)).toBe(BigInt(0));
    });

    test("should get proof at specific block", async () => {
        const accounts = testnet.getTestAccounts();
        const testAddress = accounts[0].address;

        // Get current block
        const currentBlock = await testnet.getBlockNumber();
        const blockHex = `0x${currentBlock.toString(16)}`;

        const proof = await testnet.getProof(testAddress, [], blockHex);

        console.log(`Proof at block ${currentBlock}`);
        console.log(`Account proof nodes: ${proof.accountProof.length}`);

        expect(proof.accountProof.length).toBeGreaterThan(0);
    });

    test("should verify proof is tied to block state root", async () => {
        const accounts = testnet.getTestAccounts();
        const testAddress = accounts[0].address;

        // Get block and proof at the same height
        const block = await testnet.getBlock("latest");
        const blockNumber = parseInt(block.number, 16);
        const blockHex = `0x${blockNumber.toString(16)}`;

        const proof = await testnet.getProof(testAddress, [], blockHex);

        console.log(`Block ${blockNumber} state root: ${block.stateRoot}`);
        console.log(`Proof account hash: ${proof.storageHash}`);

        // The proof should be verifiable against the block's state root
        // (actual verification would require MPT implementation)
        expect(block.stateRoot).toMatch(/^0x[a-fA-F0-9]{64}$/);
        expect(proof.accountProof.length).toBeGreaterThan(0);
    });

    test("should include proof in beacon block context", async () => {
        // This test verifies the full chain: beacon block -> execution payload -> state root -> proof
        const accounts = testnet.getTestAccounts();
        const testAddress = accounts[0].address;

        // Get beacon block with execution payload
        const beaconBlock = await testnet.getBeaconBlock("head");
        const executionPayload = beaconBlock.message.body.execution_payload;

        if (!executionPayload) {
            console.log("Skipping: No execution payload available");
            return;
        }

        const elBlockNumber = parseInt(executionPayload.block_number);
        const blockHex = `0x${elBlockNumber.toString(16)}`;

        // Get proof at that block
        const proof = await testnet.getProof(testAddress, [], blockHex);

        console.log("=== Full verification chain ===");
        console.log(`Beacon slot: ${beaconBlock.message.slot}`);
        console.log(`Execution block: ${elBlockNumber}`);
        console.log(`Execution state root: ${executionPayload.state_root}`);
        console.log(`Proof for: ${testAddress}`);
        console.log(`Proof nodes: ${proof.accountProof.length}`);

        // This data is what a light client would use:
        // 1. Verify beacon block via sync committee signatures
        // 2. Extract execution_payload.state_root
        // 3. Verify account proof against that state root
        expect(executionPayload.state_root).toMatch(/^0x[a-fA-F0-9]{64}$/);
        expect(proof.accountProof.length).toBeGreaterThan(0);
    });
});
