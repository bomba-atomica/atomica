import { describe, expect, test } from "bun:test";
import { verifyTransactionProof, encodeTransaction } from "../src/transaction";
import type { Block, Transaction } from "../src/types";
import { RLP } from "@ethereumjs/rlp";
import { keccak256 } from "ethereum-cryptography/keccak";
import { Trie } from "@ethereumjs/trie";

// Mock data helpers
const mockAddress = "0x8943545177806ED17B9F23F0a21ee5948eCaa776";
const mockHash = "0x" + "a".repeat(64);

// Sample Legacy Transaction (Type 0)
// RLP([nonce, gasPrice, gasLimit, to, value, data, v, r, s])
const legacyTx: Transaction = {
    hash: mockHash,
    nonce: "0x1",
    gasPrice: "0x4a817c800", // 20 gwei
    gas: "0x5208", // 21000
    to: mockAddress,
    value: "0xde0b6b3a7640000", // 1 ETH
    input: "0x",
    v: "0x25", // 37 (ChainID 1)
    r: "0x123", // Needs valid hex
    s: "0x456", // Needs valid hex
    blockHash: null,
    blockNumber: null,
    transactionIndex: "0x1",
    from: mockAddress,
};

// Sample EIP-1559 Transaction (Type 2)
// 0x02 || RLP([chainId, nonce, maxPriorityFee, maxFee, gasLimit, to, value, data, accessList, v, r, s])
const eip1559Tx: Transaction = {
    hash: mockHash,
    type: "0x2",
    chainId: "0x1",
    nonce: "0x2",
    maxPriorityFeePerGas: "0x3b9aca00", // 1 gwei
    maxFeePerGas: "0x4a817c800", // 20 gwei
    gas: "0x5208",
    to: mockAddress,
    value: "0xde0b6b3a7640000",
    input: "0x",
    v: "0x1",
    r: "0x123",
    s: "0x456",
    gasPrice: "0x4a817c800", // Effective gas price (not part of encoding but in type)
    blockHash: null,
    blockNumber: null,
    transactionIndex: "0x1",
    from: mockAddress,
};

describe("Transaction Verification", () => {
    describe("encodeTransaction", () => {
        test("should encode legacy transaction correctly", () => {
            const encoded = encodeTransaction(legacyTx);
            expect(encoded).toBeInstanceOf(Uint8Array); // @ethereumjs/tx returns Uint8Array which Buffer inherits from

            // For legacy, it's just RLP list
            const decoded = RLP.decode(encoded);
            expect(Array.isArray(decoded)).toBe(true);
            // Legacy usually has 9 fields (nonce, gasPrice, gasLimit, to, value, data, v, r, s)
            // But implementation details might vary slightly on how we construct it from the interface
        });

        test("should encode EIP-1559 transaction correctly", () => {
            const encoded = encodeTransaction(eip1559Tx);
            expect(encoded).toBeInstanceOf(Uint8Array);

            // EIP-1559 starts with 0x02
            expect(encoded[0]).toBe(0x02);

            // The rest should be RLP
            const rlpPart = encoded.subarray(1);
            const decoded = RLP.decode(rlpPart);
            expect(Array.isArray(decoded)).toBe(true);
        });
    });

    describe("verifyTransactionProof", () => {
        test("should verify valid transaction proof with locally constructed MPT", async () => {
            // 1. Create a few mock transactions
            // IMPORTANT: Transaction indices must be sequential and match array order
            const txs = [
                { ...legacyTx, transactionIndex: "0x0" },
                { ...eip1559Tx, transactionIndex: "0x1" },
            ];

            // 2. Create MPT locally to generate the expected root
            const trie = new Trie();
            for (let i = 0; i < txs.length; i++) {
                const tx = txs[i];
                // Key is RLP encoded index
                const key = Buffer.from(RLP.encode(i));
                // Value is encoded transaction
                const value = encodeTransaction(tx);
                await trie.put(key, value);
            }

            const expectedRoot = "0x" + Buffer.from(trie.root()).toString("hex");

            // 3. Mock block with this root
            const block: Block = {
                number: "0x1",
                hash: mockHash,
                parentHash: mockHash,
                timestamp: "0x0",
                stateRoot: mockHash,
                transactionsRoot: expectedRoot, // CRITICAL: This must match
                receiptsRoot: mockHash,
            };

            // 4. Verify specific transaction (e.g., index 1)
            const targetTx = txs[1]; // eip1559Tx
            const isValid = await verifyTransactionProof(targetTx, block, txs);

            expect(isValid).toBe(true);
        });

        test("should fail if transaction root mismatch", async () => {
            const txs = [{ ...legacyTx, transactionIndex: "0x0" }];
            const block: Block = {
                number: "0x1",
                hash: mockHash,
                parentHash: mockHash,
                timestamp: "0x0",
                stateRoot: mockHash,
                transactionsRoot: "0x" + "0".repeat(64), // Wrong root
                receiptsRoot: mockHash,
            };

            const isValid = await verifyTransactionProof(legacyTx, block, txs);
            expect(isValid).toBe(false);
        });

        test("should fail if transaction index is missing in siblings", async () => {
            // If we pass a tx that IS NOT in the siblings list
            const txs = [{ ...legacyTx, transactionIndex: "0x0" }]; // Missing eip1559Tx
            const block: Block = {
                number: "0x1",
                hash: mockHash,
                parentHash: mockHash,
                timestamp: "0x0",
                stateRoot: mockHash,
                transactionsRoot: mockHash, // Doesn't matter, reconstruction will fail match
                receiptsRoot: mockHash,
            };

            // In this case, `eip1559Tx` is not in `txs`.
            // The function `verifyTransactionProof(target, block, siblings)`
            // usually assumes `siblings` includes `target` or is the full list.
            // If `siblings` IS the full list, then `target` must be in it.

            const isValid = await verifyTransactionProof(eip1559Tx, block, txs);
            expect(isValid).toBe(false);
        });
    });
});
