/**
 * High-level proof verification functions
 *
 * Verifies account and storage proofs against state roots using MPT verification
 */

import { RLP } from "@ethereumjs/rlp";
import { keccak256 } from "ethereum-cryptography/keccak";
import { bytesToHex, hexToBytes } from "viem";
import { verifyMerkleProof, decodeNode } from "./mpt";
import type { VerificationResult, AccountState } from "./types";

function bytesToBigInt(bytes: Uint8Array): bigint {
    return BigInt(bytesToHex(bytes) || "0x0");
}

function ensureHex(value: string): `0x${string}` {
    return value.startsWith("0x") ? (value as `0x${string}`) : (`0x${value}` as `0x${string}`);
}

/**
 * Cryptographically verify an account proof against a state root
 *
 * @param accountProof - Array of RLP-encoded trie nodes (from eth_getProof)
 * @param stateRoot - State root hash from block header
 * @param address - Account address being proven
 * @returns Verification result with status and decoded account state
 */
export async function verifyAccountProof(
    accountProof: string[],
    stateRoot: string,
    address: string,
): Promise<VerificationResult> {
    try {
        const rootBuffer = hexToBytes(ensureHex(stateRoot));
        const addressBuffer = hexToBytes(ensureHex(address));
        const proofBuffers = accountProof.map((p) => hexToBytes(ensureHex(p)));

        const keyHash = keccak256(addressBuffer);
        const key = Buffer.from(keyHash);

        // MPT verification finds the leaf value if it exists, or null if it doesn't
        // We need to determine the expected behavior.
        // In verifyMerkleProof we pass the *expected* value.
        // But here we want to *find* the value from the proof and then verify it.
        // Actually verifyMerkleProof needs to be slightly adapted or we use it to verify against the *leaf node*.
        // The verifyMerkleProof implementation we wrote takes an expected value.
        // But in a real verifier, we usually walk the trie to *get* the value, and then return it.

        // Let's re-read the mpt.ts implementation.
        // It traverses and checks if it matches `value`.
        // If we don't know the value yet (which we don't, we are verifying the proof to GET the account state),
        // we can't use verifyMerkleProof exactly as is if it requires the value up front.
        // However, the leaf node in the proof *contains* the value.
        // So we can extract the value from the last node of the proof (if it's a leaf) and then verify.

        // 1. Decode the last node in the proof to get the potential value
        let claimedValue: Buffer | null = null;
        if (proofBuffers.length > 0) {
            try {
                const lastProofNode = proofBuffers[proofBuffers.length - 1];
                const decodedLast = decodeNode(Buffer.from(lastProofNode));

                if (decodedLast.type === "leaf") {
                    claimedValue = decodedLast.value;
                } else if (decodedLast.type === "branch" && decodedLast.value) {
                    claimedValue = decodedLast.value;
                }
            } catch (_e) {
                // Ignore decoding errors here, let verifyMerkleProof handle validity
            }
        }

        // Try to verify with this claimed value
        const isValid = verifyMerkleProof(
            proofBuffers.map((b) => Buffer.from(b)),
            Buffer.from(rootBuffer),
            key,
            claimedValue,
        );

        if (isValid) {
            if (claimedValue) {
                const accountState = decodeAccountState(claimedValue);
                return {
                    valid: true,
                    accountState,
                    proofNodes: proofBuffers.length,
                };
            } else {
                // Non-existence proof valid
                return { valid: true, proofNodes: proofBuffers.length };
            }
        }

        // If failed with claimed value, try with null (non-existence) just in case logic was off
        if (claimedValue !== null) {
            const isValidNonExist = verifyMerkleProof(
                proofBuffers.map((b) => Buffer.from(b)),
                Buffer.from(rootBuffer),
                key,
                null,
            );
            if (isValidNonExist) {
                return { valid: true, proofNodes: proofBuffers.length };
            }
        }

        return {
            valid: false,
            error: "Proof verification failed",
        };
    } catch (error) {
        return {
            valid: false,
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

/**
 * Verify a storage proof against a storage root
 *
 * @param storageProof - Array of RLP-encoded trie nodes
 * @param storageRoot - Storage root hash from account state
 * @param key - Storage slot key
 * @returns Verification result with storage value
 */
export async function verifyStorageProof(
    storageProof: string[],
    storageRoot: string,
    key: string,
): Promise<VerificationResult> {
    try {
        const rootBuffer = hexToBytes(ensureHex(storageRoot));
        // Storage keys are hashed with Keccak256
        const keyBuffer = hexToBytes(ensureHex(key));
        const pathKey = Buffer.from(keccak256(keyBuffer));
        const proofBuffers = storageProof.map((p) => hexToBytes(ensureHex(p)));

        // Same logic as account proof: find the claimed value from the last node
        let claimedValue: Buffer | null = null;
        if (proofBuffers.length > 0) {
            try {
                const lastProofNode = proofBuffers[proofBuffers.length - 1];
                const decodedLast = decodeNode(Buffer.from(lastProofNode));

                if (decodedLast.type === "leaf") {
                    claimedValue = decodedLast.value;
                } else if (decodedLast.type === "branch" && decodedLast.value) {
                    claimedValue = decodedLast.value;
                }
            } catch (_e) {
                // Ignore decoding errors
            }
        }

        const isValid = verifyMerkleProof(
            proofBuffers.map((b) => Buffer.from(b)),
            Buffer.from(rootBuffer),
            pathKey,
            claimedValue,
        );

        if (isValid) {
            return {
                valid: true,
                value: claimedValue ? bytesToHex(claimedValue) : "0x0", // Empty storage is 0
                proofNodes: proofBuffers.length,
            };
        }

        // Check non-existence
        if (
            verifyMerkleProof(
                proofBuffers.map((b) => Buffer.from(b)),
                Buffer.from(rootBuffer),
                pathKey,
                null,
            )
        ) {
            return { valid: true, value: "0x0", proofNodes: proofBuffers.length };
        }

        return { valid: false, error: "Storage proof verification failed" };
    } catch (error) {
        return { valid: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
}

/**
 * Decode account state from RLP-encoded account leaf node
 *
 * Account state is RLP-encoded as: [nonce, balance, storageHash, codeHash]
 *
 * @param leafNode - RLP-encoded account data
 * @returns Decoded account state
 */
export function decodeAccountState(leafNode: Buffer): AccountState {
    const decoded = RLP.decode(leafNode);

    if (!Array.isArray(decoded) || decoded.length !== 4) {
        throw new Error("Invalid account state RLP: expected 4 elements");
    }

    const [nonce, balance, storageHash, codeHash] = decoded as Buffer[];

    return {
        nonce: nonce.length === 0 ? 0 : Number(bytesToBigInt(nonce)),
        balance: balance.length === 0 ? 0n : bytesToBigInt(balance),
        storageHash: bytesToHex(storageHash),
        codeHash: bytesToHex(codeHash),
    };
}
