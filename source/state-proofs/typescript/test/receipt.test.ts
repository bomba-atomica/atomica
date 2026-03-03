import { describe, expect, test } from "bun:test";
import { verifyReceiptProof, encodeReceipt } from "../src/receipt";
import type { Block, Receipt } from "../src/types";
import { RLP } from "@ethereumjs/rlp";
import { Trie } from "@ethereumjs/trie";
import { ETHEREUM_DEPLOYER_ADDRESS } from "../../../shared/test-constants";

const mockHash = "0x" + "b".repeat(64);
const mockAddress = ETHEREUM_DEPLOYER_ADDRESS as `0x${string}`;

// Sample Receipt (Legacy / Post-Byzantium)
// RLP([status, cumulativeGasUsed, logsBloom, logs])
const legacyReceipt: Receipt = {
    transactionHash: mockHash,
    transactionIndex: "0x0",
    blockHash: mockHash,
    blockNumber: "0x1",
    from: mockAddress,
    to: mockAddress,
    cumulativeGasUsed: "0x5208", // 21000
    gasUsed: "0x5208",
    contractAddress: null,
    logs: [],
    logsBloom: "0x" + "0".repeat(512), // Empty bloom
    status: "0x1", // Success
    type: "0x0", // Explicitly legacy
};

// Sample EIP-1559 Receipt (Type 2)
// 0x02 || RLP([status, cumulativeGasUsed, logsBloom, logs])
const eip1559Receipt: Receipt = {
    ...legacyReceipt,
    transactionIndex: "0x1",
    type: "0x2",
    cumulativeGasUsed: "0xa410", // 42000 (21000 + 21000)
};

describe("Receipt Verification", () => {
    describe("encodeReceipt", () => {
        test("should encode legacy receipt correctly", () => {
            const encoded = encodeReceipt(legacyReceipt);
            expect(encoded).toBeInstanceOf(Buffer);

            const decoded = RLP.decode(encoded);
            expect(Array.isArray(decoded)).toBe(true);
            // Expect 4 elements: status, cumulativeGas, bloom, logs
            expect(decoded.length).toBe(4);
        });

        test("should encode EIP-1559 receipt correctly", () => {
            const encoded = encodeReceipt(eip1559Receipt);
            expect(encoded).toBeInstanceOf(Buffer);

            // Starts with Type byte 0x02
            expect(encoded[0]).toBe(0x02);

            // Rest is RLP
            const decoded = RLP.decode(encoded.subarray(1));
            expect(Array.isArray(decoded)).toBe(true);
            expect(decoded.length).toBe(4);
        });
    });

    describe("verifyReceiptProof", () => {
        test("should verify valid receipt proof with locally constructed MPT", async () => {
            const receipts = [legacyReceipt, eip1559Receipt];

            // Calculate expected root locally
            const trie = new Trie();
            for (let i = 0; i < receipts.length; i++) {
                const index = Buffer.from(RLP.encode(i));
                const value = encodeReceipt(receipts[i]);
                await trie.put(index, value);
            }

            const expectedRoot = "0x" + Buffer.from(trie.root()).toString("hex");

            const block: Block = {
                number: "0x1",
                hash: mockHash,
                parentHash: mockHash,
                timestamp: "0x0",
                stateRoot: mockHash,
                transactionsRoot: mockHash,
                receiptsRoot: expectedRoot,
            };

            const isValid = await verifyReceiptProof(eip1559Receipt, block, receipts);
            expect(isValid).toBe(true);
        });

        test("should fail if receipts root mismatch", async () => {
            const receipts = [legacyReceipt];
            const block: Block = {
                number: "0x1",
                hash: mockHash,
                parentHash: mockHash,
                timestamp: "0x0",
                stateRoot: mockHash,
                transactionsRoot: mockHash,
                receiptsRoot: "0x" + "0".repeat(64), // Wrong root
            };

            const isValid = await verifyReceiptProof(legacyReceipt, block, receipts);
            expect(isValid).toBe(false);
        });
    });
});
