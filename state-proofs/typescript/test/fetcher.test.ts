import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { fetchProof, fetchBlock } from "../src/fetcher";
import { startTestnet, stopTestnet, getRpcUrl, getTestAccounts } from "./helpers/testnet";

describe("Proof Fetching", () => {
    let testRpcUrl: string;
    let testAddress: string;

    beforeAll(async () => {
        // Start Docker testnet for integration tests
        await startTestnet();
        testRpcUrl = getRpcUrl();
        const accounts = getTestAccounts();
        testAddress = accounts[0].address;
    }, 300000);

    afterAll(async () => {
        await stopTestnet();
    }, 60000);

    test("should fetch account proof from RPC endpoint", async () => {
        const proof = await fetchProof(testRpcUrl, testAddress, [], "latest");

        // Verify proof structure
        expect(proof).toBeDefined();
        expect(proof.address.toLowerCase()).toBe(testAddress.toLowerCase());
        expect(proof.accountProof).toBeInstanceOf(Array);
        expect(proof.accountProof.length).toBeGreaterThan(0);

        // Each proof node should be a hex string
        for (const node of proof.accountProof) {
            expect(node).toMatch(/^0x[a-fA-F0-9]+$/);
        }

        // Should have balance and nonce
        expect(proof.balance).toMatch(/^0x[a-fA-F0-9]+$/);
        expect(proof.nonce).toMatch(/^0x[a-fA-F0-9]+$/);
    });

    test("should fetch block header with state root", async () => {
        const block = await fetchBlock(testRpcUrl, "latest");

        expect(block).toBeDefined();
        expect(block.stateRoot).toMatch(/^0x[a-fA-F0-9]{64}$/);
        expect(block.number).toBeDefined();
        expect(block.hash).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    test("should handle RPC errors gracefully", async () => {
        const invalidRpcUrl = "http://localhost:9999"; // Non-existent endpoint

        await expect(fetchProof(invalidRpcUrl, testAddress, [], "latest")).rejects.toThrow();
    });

    test("should work with different block identifiers", async () => {
        // Test with 'latest'
        const latestProof = await fetchProof(testRpcUrl, testAddress, [], "latest");
        expect(latestProof).toBeDefined();

        // Test with 'earliest' (genesis)
        const earliestProof = await fetchProof(testRpcUrl, testAddress, [], "earliest");
        expect(earliestProof).toBeDefined();

        // Test with block number
        const block = await fetchBlock(testRpcUrl, "latest");
        const blockNumber = parseInt(block.number, 16);
        const numberProof = await fetchProof(testRpcUrl, testAddress, [], blockNumber);
        expect(numberProof).toBeDefined();
    });

    test("should fetch storage proofs when storage keys provided", async () => {
        const storageKeys = ["0x0", "0x1"];
        const proof = await fetchProof(testRpcUrl, testAddress, storageKeys, "latest");

        expect(proof.storageProof).toBeInstanceOf(Array);
        expect(proof.storageProof.length).toBe(storageKeys.length);

        for (const storageProof of proof.storageProof) {
            expect(storageProof.key).toBeDefined();
            expect(storageProof.value).toBeDefined();
            expect(storageProof.proof).toBeInstanceOf(Array);
        }
    });

    test("should handle empty account (non-existent address)", async () => {
        const emptyAddress = "0x1111111111111111111111111111111111111111";
        const proof = await fetchProof(testRpcUrl, emptyAddress, [], "latest");

        expect(proof).toBeDefined();
        expect(proof.address.toLowerCase()).toBe(emptyAddress.toLowerCase());
        expect(BigInt(proof.balance)).toBe(BigInt(0));
        expect(BigInt(proof.nonce)).toBe(BigInt(0));
    });
});
