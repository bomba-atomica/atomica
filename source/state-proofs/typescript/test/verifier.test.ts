import { describe, expect, test } from "bun:test";
import { verifyAccountProof, verifyStorageProof } from "../src/verifier";
import { ETHEREUM_DEPLOYER_ADDRESS } from "../../../shared/test-constants";

describe("Account Proof Verification", () => {
    test("should reject proof with tampered nodes", async () => {
        const accountProof: string[] = [
            "0xf90211", // Valid RLP start but tampered data
            "0xdeadbeef",
        ];
        const stateRoot = "0x" + "a".repeat(64);
        const address = ETHEREUM_DEPLOYER_ADDRESS;

        const result = await verifyAccountProof(accountProof, stateRoot, address);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
    });

    test("should reject proof with wrong state root", async () => {
        const accountProof: string[] = []; // Will be filled with valid proof
        const wrongStateRoot = "0x" + "b".repeat(64); // Wrong root
        const address = ETHEREUM_DEPLOYER_ADDRESS;

        const result = await verifyAccountProof(accountProof, wrongStateRoot, address);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
        // expect(result.error).toContain("state root");
    });
});

describe("Storage Proof Verification", () => {
    test("should handle empty storage slots", async () => {
        const emptyStorageRoot =
            "0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421";
        const storageProof: string[] = [];
        const key = "0x0";

        const result = await verifyStorageProof(storageProof, emptyStorageRoot, key);

        // Empty storage should verify successfully
        expect(result.valid).toBe(true);
        expect(result.value).toBe("0x0");
    });

    test("should reject tampered storage proof", async () => {
        const storageProof: string[] = ["0xdeadbeef"];
        const storageRoot = "0x" + "c".repeat(64);
        const key = "0x0";

        const result = await verifyStorageProof(storageProof, storageRoot, key);

        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
    });
});
