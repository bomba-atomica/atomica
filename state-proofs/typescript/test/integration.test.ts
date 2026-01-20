import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { fetchProof, fetchBlock } from "../src/fetcher";
import { verifyAccountProof } from "../src/verifier";
import { startTestnet, stopTestnet, getRpcUrl, getTestAccounts } from "./helpers/testnet";

describe("End-to-End Verification", () => {
    let rpcUrl: string;
    let testAddress: string;

    beforeAll(async () => {
        // Start Docker testnet
        await startTestnet();

        // Get RPC URL and test account from testnet
        rpcUrl = getRpcUrl();
        const accounts = getTestAccounts();
        testAddress = accounts[0].address;

        console.log("Test RPC URL:", rpcUrl);
        console.log("Test Address:", testAddress);
    }, 300000); // 5 minute timeout for testnet startup

    afterAll(async () => {
        // Cleanup testnet
        await stopTestnet();
    }, 60000); // 1 minute timeout for cleanup

    test("should fetch and verify account proof from live testnet", async () => {
        // Fetch proof from local testnet
        const proof = await fetchProof(rpcUrl, testAddress, [], "latest");
        expect(proof).toBeDefined();
        expect(proof.accountProof.length).toBeGreaterThan(0);

        // Fetch block header for state root
        const block = await fetchBlock(rpcUrl, "latest");
        expect(block.stateRoot).toBeDefined();

        // Verify proof cryptographically
        const result = await verifyAccountProof(proof.accountProof, block.stateRoot, testAddress);

        expect(result.valid).toBe(true);
        expect(result.accountState).toBeDefined();

        if (result.accountState) {
            console.log("Verified account state:");
            console.log("  Nonce:", result.accountState.nonce);
            console.log("  Balance:", result.accountState.balance.toString());
            console.log("  Storage Hash:", result.accountState.storageHash);
            console.log("  Code Hash:", result.accountState.codeHash);
        }
    });

    test("should verify account proof at specific block height", async () => {
        // Get current block
        const currentBlock = await fetchBlock(rpcUrl, "latest");
        const blockNumber = parseInt(currentBlock.number, 16);

        // Fetch proof at specific block
        const proof = await fetchProof(rpcUrl, testAddress, [], blockNumber);
        const block = await fetchBlock(rpcUrl, blockNumber);

        // Verify
        const result = await verifyAccountProof(proof.accountProof, block.stateRoot, testAddress);

        expect(result.valid).toBe(true);
    });

    test("should verify empty account proof", async () => {
        const emptyAddress = "0x1111111111111111111111111111111111111111";

        // Fetch proof for non-existent account
        const proof = await fetchProof(rpcUrl, emptyAddress, [], "latest");
        const block = await fetchBlock(rpcUrl, "latest");

        // Verify
        const result = await verifyAccountProof(proof.accountProof, block.stateRoot, emptyAddress);

        expect(result.valid).toBe(true);
        // For non-existent accounts, accountState should be undefined (or empty, depending on implementation)
        // Our implementation returns undefined for non-existence
        expect(result.accountState).toBeUndefined();
    });

    test("should detect tampered proof", async () => {
        // Fetch valid proof
        const proof = await fetchProof(rpcUrl, testAddress, [], "latest");
        const block = await fetchBlock(rpcUrl, "latest");

        // Tamper with proof
        const tamperedProof = [...proof.accountProof];
        tamperedProof[0] = "0xdeadbeef"; // Corrupt first node

        // Verify should fail
        const result = await verifyAccountProof(tamperedProof, block.stateRoot, testAddress);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
    });

    test("should detect wrong state root", async () => {
        // Fetch valid proof
        const proof = await fetchProof(rpcUrl, testAddress, [], "latest");

        // Use wrong state root
        const wrongStateRoot = "0x" + "a".repeat(64);

        // Verify should fail
        const result = await verifyAccountProof(proof.accountProof, wrongStateRoot, testAddress);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        // expect(result.error).toContain("root");
    });

    test("should verify proof matches beacon block execution payload", async () => {
        // This test verifies the full chain:
        // Beacon Block -> Execution Payload -> State Root -> Account Proof

        // For now, just verify against execution layer
        // Use 'latest' instead of 'finalized' as local testnet may not have finalized blocks yet
        const proof = await fetchProof(rpcUrl, testAddress, [], "latest");
        const block = await fetchBlock(rpcUrl, "latest");

        const result = await verifyAccountProof(proof.accountProof, block.stateRoot, testAddress);

        expect(result.valid).toBe(true);

        // TODO: Once beacon API integration is added, verify:
        // 1. Fetch beacon block at same height
        // 2. Extract execution_payload.state_root
        // 3. Verify it matches block.stateRoot
        // 4. Verify account proof against that state root
    });
});

describe("Storage Proof End-to-End", () => {
    // TODO: Add storage proof integration tests once we have a contract deployed
    test.skip("should verify storage proof for contract", async () => {
        // Will implement once we can deploy a test contract
    });
});
