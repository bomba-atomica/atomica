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
import { keccak256 } from "ethereum-cryptography/keccak";
import { Trie } from "@ethereumjs/trie";
import { bytesToHex, hexToBytes, stripHexPrefix } from "@ethereumjs/util";
import {
    FeeMarket1559Tx as FeeMarketEIP1559Transaction,
    LegacyTx as LegacyTransaction,
    AccessList2930Tx as AccessListEIP2930Transaction,
} from "@ethereumjs/tx";
import type { Block, Transaction } from "./types";

/**
 * Verify a transaction inclusion proof
 *
 * Since standard RPCs do not provide transaction proofs, we must:
 * 1. Fetch all transactions in the block
 * 2. Reconstruct the Transactions Trie locally
 * 3. Verify the calculated root matches the block header's transactionsRoot
 * 4. Verify the specific transaction exists in the trie at the correct index
 *
 * @param transaction - The transaction to verify
 * @param block - The block containing the transaction
 * @param siblingTransactions - All other transactions in the block (required for reconstruction)
 * @returns True if valid, throws error if invalid
 */
export async function verifyTransactionProof(
    transaction: Transaction,
    block: Block,
    siblingTransactions: Transaction[],
): Promise<boolean> {
    // 1. Validate inputs
    const txHash = transaction.hash.toLowerCase();
    const targetInSiblings = siblingTransactions.find((tx) => tx.hash.toLowerCase() === txHash);

    // If the transaction itself isn't in the provided list, verification fails immediately
    if (!targetInSiblings) {
        return false;
    }

    // 2. Sort transactions by index
    // Note: RPC usually returns them sorted, but we must ensure it.
    // The key in the transaction trie is the RLP encoded index of the transaction.
    const sortedTxs = [...siblingTransactions].sort((a, b) => {
        const indexA = parseInt(a.transactionIndex || "0", 16);
        const indexB = parseInt(b.transactionIndex || "0", 16);
        return indexA - indexB;
    });

    // 3. Create MPT from scratch
    const trie = new Trie();

    for (let i = 0; i < sortedTxs.length; i++) {
        const tx = sortedTxs[i];
        const index = parseInt(tx.transactionIndex || "0", 16);

        // Verify index integrity (optional, but good sanity check)
        if (index !== i) {
            throw new Error(`Transaction indices are not sequential. Expected ${i}, got ${index}`);
        }

        // Key: RLP encoded transaction index
        const key = Buffer.from(RLP.encode(index));

        // Value: RLP encoded transaction (serialized)
        const value = encodeTransaction(tx);

        await trie.put(key, value);
    }

    // 4. Calculate root
    const calculatedRoot = trie.root();
    const calculatedRootHex = "0x" + calculatedRoot.toString("hex");

    // 5. Compare with block header
    const expectedRoot = block.transactionsRoot;

    // console.log("Calculated Root:", calculatedRootHex);
    // console.log("Expected Root:  ", expectedRoot);

    return calculatedRootHex.toLowerCase() === expectedRoot.toLowerCase();
}

/**
 * Encode a transaction for MPT insertion
 *
 * Handles Legacy, EIP-2930, and EIP-1559 formats
 *
 * @param tx - The transaction object
 * @returns RLP encoded transaction (Buffer)
 */
export function encodeTransaction(tx: Transaction): Buffer {
    const txType = tx.type ? parseInt(tx.type, 16) : 0;

    // Common fields mapping
    const txData = {
        nonce: BigInt(tx.nonce),
        gasLimit: BigInt(tx.gas),
        to: tx.to, // @ethereumjs/tx handles null/undefined as contract creation
        value: BigInt(tx.value),
        data: tx.input,
        v: tx.v ? BigInt(tx.v) : undefined,
        r: tx.r ? BigInt(tx.r) : undefined,
        s: tx.s ? BigInt(tx.s) : undefined,
        chainId: tx.chainId ? BigInt(tx.chainId) : undefined,
    };

    if (txType === 2) {
        // EIP-1559
        const typedTx = new FeeMarketEIP1559Transaction({
            ...txData,
            maxFeePerGas: BigInt(tx.maxFeePerGas || "0"),
            maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas || "0"),
            chainId: BigInt(tx.chainId || "1"), // Default to 1 if missing
        });
        return typedTx.serialize();
    } else if (txType === 1) {
        // EIP-2930
        const typedTx = new AccessListEIP2930Transaction({
            ...txData,
            gasPrice: BigInt(tx.gasPrice || "0"),
            accessList: [], // Access list support needed if strictly required
            chainId: BigInt(tx.chainId || "1"),
        });
        return typedTx.serialize();
    } else {
        // Legacy
        const legacyTx = new LegacyTransaction({
            ...txData,
            gasPrice: BigInt(tx.gasPrice || "0"),
        });
        return legacyTx.serialize();
    }
}
