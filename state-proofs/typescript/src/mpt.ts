/**
 * Core Merkle-Patricia Trie (MPT) verification logic
 *
 * Implements the Ethereum MPT specification for cryptographic proof verification
 */

import { RLP } from "@ethereumjs/rlp";
import { equalsBytes } from "@ethereumjs/util";
import { keccak256 } from "ethereum-cryptography/keccak";
import { type TrieNode } from "./types";

/**
 * Verify a Merkle-Patricia proof
 *
 * Traverses the proof nodes from root to leaf, verifying hashes at each level,
 * and confirms the final hash equals the expected root.
 *
 * @param proof - Array of RLP-encoded trie nodes (as Buffers)
 * @param root - Expected root hash
 * @param key - Trie key (Keccak-256 hash of address or storage slot)
 * @param value - Expected value at leaf (null for non-existence proof)
 * @returns True if proof is valid, false otherwise
 */
export function verifyMerkleProof(
    proof: Buffer[],
    root: Buffer,
    key: Buffer,
    value: Buffer | null,
): boolean {
    // 1. Validate inputs
    if (proof.length === 0) {
        // Empty proof is valid only if the root is the empty trie root
        // and we are proving non-existence (value is null)
        try {
            const emptyRoot = keccak256(Buffer.from("80", "hex")); // Hash of RLP empty string/list
            return equalsBytes(root, emptyRoot) && value === null;
        } catch (e) {
            console.error("Error in empty proof check:", e);
            throw e;
        }
    }

    // 2. Start verification from the root
    let expectedHash = root;
    const keyNibbles = keyToNibbles(key);
    let nibbleIndex = 0;

    for (let i = 0; i < proof.length; i++) {
        const rlpNode = proof[i];

        // a. Verify hash of node matches expected hash
        // For the first node, it must match the state root
        // For subsequent nodes, it must match the hash pointer from the parent
        // Note: If node length < 32 bytes, the "hash" is the node itself (raw RLP)
        // But in a proof, usually we are given the full node, and we hash it to check against parent.
        const nodeHash = hashNode(rlpNode);

        // Handling the case where the expected hash might be the node itself (if < 32 bytes)
        // In standard MPT proofs (EIP-1186), the proof array contains the full nodes.
        // We verify that keccak256(node) == expectedHash.
        if (!equalsBytes(nodeHash, expectedHash)) {
            // Edge case: if the expected hash is actually the raw RLP (for small nodes embedded in parent)
            // We check if the expected "hash" bytes are equal to the RLP node bytes
            if (!equalsBytes(rlpNode, expectedHash)) {
                return false;
            }
        }

        // b. Decode the node
        let node: TrieNode;
        try {
            node = decodeNode(rlpNode);
        } catch (e) {
            return false;
        }

        // c. Navigate based on node type
        if (node.type === "branch") {
            if (nibbleIndex === keyNibbles.length) {
                // We reached the end of the key at a branch node.
                // The value should be in the branch value slot (last element).
                if (value === null) {
                    return node.value === null || node.value.length === 0;
                }
                return node.value !== null && equalsBytes(node.value, value);
            }

            const nibble = keyNibbles[nibbleIndex];
            const childHash = node.children[nibble];

            if (childHash === null || childHash.length === 0) {
                // Path diverges - proving non-existence
                return value === null;
            }

            expectedHash = childHash;
            nibbleIndex += 1;
        } else if (node.type === "extension") {
            const { path: decodedPath } = decodeHexPrefix(node.path);

            // Check if key matches the extension path
            if (!matchPath(keyNibbles, decodedPath, nibbleIndex)) {
                // Path mismatch - proving non-existence
                return value === null;
            }

            nibbleIndex += decodedPath.length;
            expectedHash = node.next;
        } else if (node.type === "leaf") {
            const { path: decodedPath } = decodeHexPrefix(node.path);

            // Check if remaining key matches leaf path
            if (!matchPath(keyNibbles, decodedPath, nibbleIndex)) {
                // Path mismatch - proving non-existence
                return value === null;
            }

            // Check that we consumed the entire key
            if (nibbleIndex + decodedPath.length !== keyNibbles.length) {
                return value === null;
            }

            // Verify value
            if (value === null) {
                // We found a value but expected null - invalid proof
                return false;
            }

            return equalsBytes(node.value, value);
        }
    }

    // If we ran out of proof nodes but haven't fully matched the key/value
    return false;
}

/**
 * Hash a trie node using Keccak-256
 *
 * @param node - RLP-encoded trie node
 * @returns Keccak-256 hash of node (32 bytes)
 */
export function hashNode(node: Buffer): Buffer {
    return Buffer.from(keccak256(node));
}

/**
 * Decode an RLP-encoded trie node
 *
 * @param rlpNode - RLP-encoded node
 * @returns Decoded node with type information
 */
export function decodeNode(rlpNode: Buffer): TrieNode {
    const decoded = RLP.decode(rlpNode);

    if (!Array.isArray(decoded)) {
        throw new Error("Invalid RLP node: not a list");
    }

    // Branch node: 17 elements
    if (decoded.length === 17) {
        return {
            type: "branch",
            children: decoded.slice(0, 16) as (Buffer | null)[],
            value: decoded[16] as Buffer | null,
        };
    }

    // Leaf or Extension: 2 elements
    if (decoded.length === 2) {
        const path = decoded[0] as Buffer;
        const valueOrNext = decoded[1] as Buffer;

        // Check HP flags to determine type
        // First nibble of first byte
        const firstByte = path[0];
        const flag = firstByte >> 4;

        if (flag === 2 || flag === 3) {
            // Leaf
            return {
                type: "leaf",
                path: path,
                value: valueOrNext,
            };
        }

        if (flag === 0 || flag === 1) {
            // Extension
            return {
                type: "extension",
                path: path,
                next: valueOrNext,
            };
        }
    }

    throw new Error("Invalid RLP node: unknown type");
}

/**
 * Convert hex string key to nibble array
 *
 * @param key - Hex key (Buffer)
 * @returns Array of nibbles (0-15)
 */
export function keyToNibbles(key: Buffer): number[] {
    const nibbles: number[] = [];
    for (let i = 0; i < key.length; i++) {
        const byte = key[i];
        nibbles.push(byte >> 4);
        nibbles.push(byte & 0x0f);
    }
    return nibbles;
}

/**
 * Decode Hex-Prefix (HP) encoded path
 *
 * @param encodedPath - HP-encoded path buffer
 * @returns Decoded path nibbles and node type
 */
export function decodeHexPrefix(encodedPath: Buffer): {
    path: number[];
    isLeaf: boolean;
} {
    if (encodedPath.length === 0) {
        return { path: [], isLeaf: false };
    }

    const firstByte = encodedPath[0];
    const flag = firstByte >> 4;
    const isLeaf = flag === 2 || flag === 3;
    const isOdd = flag === 1 || flag === 3;

    const nibbles: number[] = [];

    // If odd, the second nibble of the first byte is the first path nibble
    if (isOdd) {
        nibbles.push(firstByte & 0x0f);
    }

    // Process remaining bytes
    for (let i = 1; i < encodedPath.length; i++) {
        const byte = encodedPath[i];
        nibbles.push(byte >> 4);
        nibbles.push(byte & 0x0f);
    }

    return { path: nibbles, isLeaf };
}

/**
 * Match key path with node path
 *
 * @param keyNibbles - Full key as nibble array
 * @param pathNibbles - Node's path nibbles
 * @param keyPos - Current position in key
 * @returns True if paths match
 */
export function matchPath(keyNibbles: number[], pathNibbles: number[], keyPos: number): boolean {
    if (pathNibbles.length > keyNibbles.length - keyPos) {
        return false;
    }

    for (let i = 0; i < pathNibbles.length; i++) {
        if (pathNibbles[i] !== keyNibbles[keyPos + i]) {
            return false;
        }
    }
    return true;
}
