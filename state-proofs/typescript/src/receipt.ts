/**
 * Receipt Verification Logic
 *
 * Implements Merkle-Patricia Trie reconstruction and verification for Ethereum receipts.
 * This proves that a specific transaction execution result (logs, status) exists within the `receiptsRoot`.
 */

import { RLP } from "@ethereumjs/rlp";
import { Trie } from "@ethereumjs/trie";
import { hexToBytes, stripHexPrefix } from "@ethereumjs/util";
import type { Block, Receipt } from "./types";

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
    receipt: Receipt,
    block: Block,
    siblingReceipts: Receipt[],
): Promise<boolean> {
    // 1. Sort receipts by index
    // Note: RPC usually returns them sorted, but we must ensure it.
    const sortedReceipts = [...siblingReceipts].sort((a, b) => {
        const indexA = parseInt(a.transactionIndex || "0", 16);
        const indexB = parseInt(b.transactionIndex || "0", 16);
        return indexA - indexB;
    });

    // 2. Create MPT from scratch
    const trie = new Trie();

    for (let i = 0; i < sortedReceipts.length; i++) {
        const r = sortedReceipts[i];
        const index = parseInt(r.transactionIndex || "0", 16);

        // Verify index integrity
        if (index !== i) {
            throw new Error(`Receipt indices are not sequential. Expected ${i}, got ${index}`);
        }

        // Key: RLP encoded index
        const key = Buffer.from(RLP.encode(index));

        // Value: Encoded receipt
        const value = encodeReceipt(r);

        await trie.put(key, value);
    }

    // 3. Compare trie.root() with block.receiptsRoot
    const calculatedRoot = trie.root();
    const calculatedRootHex = "0x" + calculatedRoot.toString("hex");
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
    // Standard Receipt fields: [status/root, cumulativeGasUsed, logsBloom, logs]
    
    // 1. Status (Post-Byzantium) or Root (Pre-Byzantium)
    let statusOrRoot: Buffer;
    if (receipt.status !== undefined && receipt.status !== null) {
        // Status is 0 or 1. Encoded as byte (0x0 or 0x1) or empty buffer for 0? 
        // Actually for EIP-658: RLP(status) where status is 0 or 1.
        // If status is 0, RLP is 0x80 (empty string) ?? No, it's integer 0.
        // Let's use standard integer encoding.
        const statusInt = parseInt(receipt.status, 16);
        if (statusInt === 0) {
            statusOrRoot = Buffer.from([]); // RLP of 0 is 0x80 -> Empty buffer before encode?
            // RLP encoding of integer 0 is 0x80. RLP encoding of 1 is 0x01.
            // If we pass integer 0 to RLP.encode:
            // RLP.encode(0) -> <Buffer 80>
            // RLP.encode(1) -> <Buffer 01>
            
            // Wait, RLP input types. 
            // If we want the output to be the RLP of the status.
            statusOrRoot = Buffer.from(statusInt === 0 ? [] : [1]);
        } else {
            statusOrRoot = Buffer.from([statusInt]);
        }
    } else if (receipt.root) {
        statusOrRoot = hexToBytes(receipt.root);
    } else {
        // Default to success (1) if unknown? Or throw?
        // Modern receipts usually have status.
        statusOrRoot = Buffer.from([1]);
    }

    // 2. Cumulative Gas Used
    const cumulativeGas = BigInt(receipt.cumulativeGasUsed);

    // 3. Logs Bloom
    const bloom = hexToBytes(receipt.logsBloom);

    // 4. Logs
    const logs = receipt.logs.map(log => {
        // Log: [address, [topics], data]
        return [
            hexToBytes(log.address),
            log.topics.map(t => hexToBytes(t)),
            hexToBytes(log.data)
        ];
    });

    const receiptData = [
        statusOrRoot.length === 0 ? Buffer.from([]) : statusOrRoot, // Handle 0 properly
        cumulativeGas,
        bloom,
        logs
    ];
    
    // NOTE: Handling of status 0/1 in RLP is tricky.
    // If status is 1: RLP([0x01, ...])
    // If status is 0: RLP([0x, ...]) or RLP([0x80, ...])?
    // Geth encodes status 0 as 0x80 (empty byte string) inside the list?
    // Or just integer 0?
    // Let's check typical libraries. Most use integer 0 or 1.
    // If input to RLP.encode is integer 0, it outputs 0x80.
    // If input is buffer of length 0, it outputs 0x80.
    
    const encoded = RLP.encode(receiptData as any);

    // Handle Typed Receipts (EIP-2718)
    if (receipt.type && receipt.type !== "0x0" && receipt.type !== "0x00") {
        const typeInt = parseInt(receipt.type, 16);
        const typeByte = Buffer.from([typeInt]);
        return Buffer.concat([typeByte, encoded]);
    }

    return Buffer.from(encoded);
}
