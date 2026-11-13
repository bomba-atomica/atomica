import { describe, expect, test } from "bun:test";
import { verifyMerkleProof, hashNode, decodeNode } from "../src/mpt";
import { RLP } from "@ethereumjs/rlp";
import { ETHEREUM_DEPLOYER_ADDRESS } from "../../../shared/test-constants";

describe("Merkle-Patricia Trie Core", () => {
    describe("verifyMerkleProof", () => {
        test("should reject proof with broken chain", () => {
            const invalidProof: Buffer[] = [
                Buffer.from("f8", "hex"), // Invalid RLP
            ];
            const root = Buffer.from("0".repeat(64), "hex");
            const key = Buffer.from("abc", "hex");
            const value = Buffer.from("val", "utf8");

            const isValid = verifyMerkleProof(invalidProof, root, key, value);

            expect(isValid).toBe(false);
        });

        test("should verify non-existence proof (null value)", () => {
            const proof: Buffer[] = []; // Proof of non-existence
            const root = Buffer.from(
                "56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421",
                "hex",
            ); // Empty trie root
            const key = Buffer.from("nonexistent", "hex");
            const value = null; // null indicates non-existence

            const isValid = verifyMerkleProof(proof, root, key, value);

            expect(isValid).toBe(true);
        });

        test("should handle empty proof array", () => {
            const emptyProof: Buffer[] = [];
            const root = Buffer.from("0".repeat(64), "hex");
            const key = Buffer.from("key", "hex");
            const value = Buffer.from("value", "utf8");

            const isValid = verifyMerkleProof(emptyProof, root, key, value);

            // Empty proof should only be valid for empty trie
            expect(isValid).toBe(false);
        });
    });

    describe("hashNode", () => {
        test("should hash node with Keccak-256", () => {
            const node = Buffer.from("f84401", "hex"); // Sample RLP node
            const hash = hashNode(node);

            expect(hash).toBeInstanceOf(Buffer);
            expect(hash.length).toBe(32); // Keccak-256 produces 32 bytes
        });

        test("should produce consistent hashes", () => {
            const node = Buffer.from("test data", "utf8");
            const hash1 = hashNode(node);
            const hash2 = hashNode(node);

            expect(hash1.equals(hash2)).toBe(true);
        });

        test("should produce different hashes for different input", () => {
            const node1 = Buffer.from("data1", "utf8");
            const node2 = Buffer.from("data2", "utf8");

            const hash1 = hashNode(node1);
            const hash2 = hashNode(node2);

            expect(hash1.equals(hash2)).toBe(false);
        });
    });

    describe("decodeNode", () => {
        test("should decode branch node", () => {
            // Branch node has 17 elements (16 children + value)
            const branchItems: Buffer[] = new Array(17).fill(Buffer.from([]));
            const branchNode = Buffer.from(RLP.encode(branchItems));

            const decoded = decodeNode(branchNode);

            expect(decoded).toBeDefined();
            expect(decoded.type).toBe("branch");
            // Branch node should have type or children array
        });

        test("should decode extension node", () => {
            // Extension node has 2 elements [encoded path, next node]
            // Path must have valid HP encoding (e.g., 0x00... for extension even)
            const path = Buffer.from("0001", "hex");
            const next = Buffer.from("1234", "hex");
            const extensionItems = [path, next];
            const extensionNode = Buffer.from(RLP.encode(extensionItems));

            const decoded = decodeNode(extensionNode);

            expect(decoded).toBeDefined();
            expect(decoded.type).toBe("extension");
        });

        test("should decode leaf node", () => {
            // Leaf node has 2 elements [encoded path, value]
            // Path must have valid HP encoding for leaf (e.g., 0x20... for leaf even)
            const path = Buffer.from("2001", "hex");
            const val = Buffer.from("val", "utf8");
            const leafItems = [path, val];
            const leafNode = Buffer.from(RLP.encode(leafItems));

            const decoded = decodeNode(leafNode);

            expect(decoded).toBeDefined();
            expect(decoded.type).toBe("leaf");
        });

        test("should handle invalid RLP encoding", () => {
            const invalidRlp = Buffer.from("zz", "hex");

            expect(() => {
                decodeNode(invalidRlp);
            }).toThrow();
        });
    });

    describe("Account Key Hashing", () => {
        test("should produce consistent key for same address", () => {
            const address = ETHEREUM_DEPLOYER_ADDRESS;

            // Hashing should be deterministic
            const key1 = hashNode(Buffer.from(address.slice(2), "hex"));
            const key2 = hashNode(Buffer.from(address.slice(2), "hex"));

            expect(key1.equals(key2)).toBe(true);
        });
    });
});
