/**
 * Transaction Verification Logic
 *
 * Implements Merkle-Patricia Trie reconstruction and verification for Ethereum transactions.
 * This proves that a specific transaction exists within the `transactionsRoot` of a block header.
 *
 * References:
 * - Ethereum Yellow Paper (Appendix D)
 * - EIP-2718 (Typed Transaction Envelope)
 * - EIP-1559 (Fee Market)
 */

import { RLP } from "@ethereumjs/rlp";
import { Trie } from "@ethereumjs/trie";
import type { Block, Transaction } from "./types";

export async function verifyTransactionProof(
    transaction: Transaction,
    block: Block,
    siblingTransactions: Transaction[],
): Promise<boolean> {
    const txHash = transaction.hash.toLowerCase();
    const targetInSiblings = siblingTransactions.find((tx) => tx.hash.toLowerCase() === txHash);

    if (!targetInSiblings) {
        return false;
    }

    const sortedTxs = [...siblingTransactions].sort((a, b) => {
        const indexA = parseInt(a.transactionIndex || "0", 16);
        const indexB = parseInt(b.transactionIndex || "0", 16);
        return indexA - indexB;
    });

    const trie = new Trie();

    for (let i = 0; i < sortedTxs.length; i++) {
        const tx = sortedTxs[i];
        const index = parseInt(tx.transactionIndex || "0", 16);

        if (index !== i) {
            throw new Error(`Transaction indices are not sequential. Expected ${i}, got ${index}`);
        }

        const key = Buffer.from((RLP.encode)(index));
        const value = encodeTransaction(tx);

        await trie.put(key, value);
    }

    const calculatedRoot = trie.root();
    const calculatedRootHex = "0x" + Buffer.from(calculatedRoot).toString("hex");
    const expectedRoot = block.transactionsRoot;

    return calculatedRootHex.toLowerCase() === expectedRoot.toLowerCase();
}

export function encodeTransaction(tx: Transaction): Uint8Array {
    const rlp = RLP as unknown;
    const txType = tx.type ? parseInt(tx.type, 16) : 0;

    if (txType === 2) {
        const chainId = Buffer.from(tx.chainId?.replace("0x", "") || "01", "hex");
        const nonce = Buffer.from(tx.nonce.replace("0x", ""), "hex");
        const maxPriorityFee = Buffer.from(
            tx.maxPriorityFeePerGas?.replace("0x", "") || "0",
            "hex",
        );
        const maxFee = Buffer.from(tx.maxFeePerGas?.replace("0x", "") || "0", "hex");
        const gasLimit = Buffer.from(tx.gas.replace("0x", ""), "hex");
        const to = tx.to === null ? Buffer.from([]) : Buffer.from(tx.to.replace("0x", ""), "hex");
        const value = Buffer.from(tx.value?.replace("0x", "") || "0", "hex");
        const data = Buffer.from((tx.input as string)?.replace("0x", "") || "", "hex");
        const accessList: never[] = [];
        const v = tx.v ? Buffer.from(tx.v.replace("0x", ""), "hex") : Buffer.from("01", "hex");
        const r = tx.r ? Buffer.from(tx.r.replace("0x", ""), "hex") : Buffer.from("00", "hex");
        const s = tx.s ? Buffer.from(tx.s.replace("0x", ""), "hex") : Buffer.from("00", "hex");

        const payload = rlp.encode([
            chainId,
            nonce,
            maxPriorityFee,
            maxFee,
            gasLimit,
            to,
            value,
            data,
            accessList,
            v,
            r,
            s,
        ]);
        const result = new Uint8Array(payload.length + 1);
        result[0] = 0x02;
        result.set(payload, 1);
        return result;
    }

    if (txType === 1) {
        const chainId = Buffer.from(tx.chainId?.replace("0x", "") || "01", "hex");
        const nonce = Buffer.from(tx.nonce.replace("0x", ""), "hex");
        const gasPrice = Buffer.from(tx.gasPrice?.replace("0x", "") || "0", "hex");
        const gasLimit = Buffer.from(tx.gas.replace("0x", ""), "hex");
        const to = tx.to === null ? Buffer.from([]) : Buffer.from(tx.to.replace("0x", ""), "hex");
        const value = Buffer.from(tx.value?.replace("0x", "") || "0", "hex");
        const data = Buffer.from((tx.input as string)?.replace("0x", "") || "", "hex");
        const accessList: never[] = [];
        const v = tx.v ? Buffer.from(tx.v.replace("0x", ""), "hex") : Buffer.from("01", "hex");
        const r = tx.r ? Buffer.from(tx.r.replace("0x", ""), "hex") : Buffer.from("00", "hex");
        const s = tx.s ? Buffer.from(tx.s.replace("0x", ""), "hex") : Buffer.from("00", "hex");

        const payload = rlp.encode([
            chainId,
            nonce,
            gasPrice,
            gasLimit,
            to,
            value,
            data,
            accessList,
            v,
            r,
            s,
        ]);
        const result = new Uint8Array(payload.length + 1);
        result[0] = 0x01;
        result.set(payload, 1);
        return result;
    }

    const nonce = Buffer.from(tx.nonce.replace("0x", ""), "hex");
    const gasPrice = Buffer.from(tx.gasPrice?.replace("0x", "") || "0", "hex");
    const gasLimit = Buffer.from(tx.gas.replace("0x", ""), "hex");
    const to = tx.to === null ? Buffer.from([]) : Buffer.from(tx.to.replace("0x", ""), "hex");
    const value = Buffer.from(tx.value?.replace("0x", "") || "0", "hex");
    const data = Buffer.from((tx.input as string)?.replace("0x", "") || "", "hex");

    if (tx.v && tx.r && tx.s) {
        const v = Buffer.from(tx.v.replace("0x", ""), "hex");
        const r = Buffer.from(tx.r.replace("0x", ""), "hex");
        const s = Buffer.from(tx.s.replace("0x", ""), "hex");
        return rlp.encode([nonce, gasPrice, gasLimit, to, value, data, v, r, s]);
    }
    return rlp.encode([nonce, gasPrice, gasLimit, to, value, data]);
}
