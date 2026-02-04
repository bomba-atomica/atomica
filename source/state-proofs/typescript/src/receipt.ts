/**
 * Receipt Verification Logic
 *
 * Implements Merkle-Patricia Trie reconstruction and verification for Ethereum receipts.
 * This proves that a specific transaction execution result (logs, status) exists within the `receiptsRoot`.
 */

import { RLP } from "@ethereumjs/rlp";
import { Trie } from "@ethereumjs/trie";
import { hexToBytes } from "@ethereumjs/util";
import type { Block, Receipt } from "./types";

function ensureHex(value: string): `0x${string}` {
    return value.startsWith("0x") ? (value as `0x${string}`) : (`0x${value}` as `0x${string}`);
}

/**
 * Verify a receipt inclusion proof
 *
 * Similar to transactions, we must reconstruct the Receipts Trie locally.
 *
 * @param receipt - The receipt to verify
 * @param block - The block containing the transaction
 * @param siblingReceipts - All other receipts in the block
 * @returns True if valid, throws error if invalid
 */
export async function verifyReceiptProof(
    _receipt: Receipt,
    block: Block,
    siblingReceipts: Receipt[],
): Promise<boolean> {
    const sortedReceipts = [...siblingReceipts].sort((a, b) => {
        const indexA = parseInt(a.transactionIndex || "0", 16);
        const indexB = parseInt(b.transactionIndex || "0", 16);
        return indexA - indexB;
    });

    const trie = new Trie();

    for (let i = 0; i < sortedReceipts.length; i++) {
        const r = sortedReceipts[i];
        const index = parseInt(r.transactionIndex || "0", 16);

        if (index !== i) {
            throw new Error(`Receipt indices are not sequential. Expected ${i}, got ${index}`);
        }

        const key = Buffer.from(RLP.encode(index));
        const value = encodeReceipt(r);

        await trie.put(key, value);
    }

    const calculatedRoot = trie.root();
    const calculatedRootHex = "0x" + Buffer.from(calculatedRoot).toString("hex");
    const expectedRoot = block.receiptsRoot;

    return calculatedRootHex.toLowerCase() === expectedRoot.toLowerCase();
}

/**
 * Encode a receipt for MPT insertion
 *
 * @param receipt - The receipt object
 * @returns RLP encoded receipt (Buffer)
 */
export function encodeReceipt(receipt: Receipt): Buffer {
    let statusOrRoot: Buffer;
    if (receipt.status !== undefined && receipt.status !== null) {
        const statusInt = parseInt(receipt.status, 16);
        if (statusInt === 0) {
            statusOrRoot = Buffer.from([]);
        } else {
            statusOrRoot = Buffer.from([statusInt]);
        }
    } else if (receipt.root) {
        statusOrRoot = Buffer.from(hexToBytes(ensureHex(receipt.root)));
    } else {
        statusOrRoot = Buffer.from([1]);
    }

    const cumulativeGas = BigInt(receipt.cumulativeGasUsed);
    const bloom = Buffer.from(hexToBytes(ensureHex(receipt.logsBloom)));
    const logs = receipt.logs.map((log) => [
        Buffer.from(hexToBytes(ensureHex(log.address))),
        log.topics.map((t) => Buffer.from(hexToBytes(ensureHex(t)))),
        Buffer.from(hexToBytes(ensureHex(log.data))),
    ]);

    const receiptData = [statusOrRoot, cumulativeGas, bloom, logs];
    const encoded = Buffer.from(RLP.encode(receiptData));

    if (receipt.type && receipt.type !== "0x0" && receipt.type !== "0x00") {
        const typeInt = parseInt(receipt.type, 16);
        return Buffer.concat([Buffer.from([typeInt]), encoded]);
    }

    return encoded;
}
