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
import {
    FeeMarket1559Tx as FeeMarketEIP1559Transaction,
    LegacyTx as LegacyTransaction,
    AccessList2930Tx as AccessListEIP2930Transaction,
} from "@ethereumjs/tx";
import type { Block, Transaction } from "./types";
import type { Hex } from "viem";

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

        const key = Buffer.from((RLP.encode as any)(index));
        const value = encodeTransaction(tx);

        await trie.put(key, value);
    }

    const calculatedRoot = trie.root();
    const calculatedRootHex = "0x" + Buffer.from(calculatedRoot).toString("hex");
    const expectedRoot = block.transactionsRoot;

    return calculatedRootHex.toLowerCase() === expectedRoot.toLowerCase();
}

export function encodeTransaction(tx: Transaction): Uint8Array {
    const txType = tx.type ? parseInt(tx.type, 16) : 0;
    const toValue: Hex | "" = tx.to === null ? "" : (tx.to as Hex);
    const dataValue: Hex = (tx.input as Hex) || "0x";

    const txData = {
        nonce: BigInt(tx.nonce),
        gasLimit: BigInt(tx.gas),
        to: toValue,
        value: BigInt(tx.value),
        data: dataValue,
        v: tx.v ? BigInt(tx.v) : undefined,
        r: tx.r ? BigInt(tx.r) : undefined,
        s: tx.s ? BigInt(tx.s) : undefined,
        chainId: tx.chainId ? BigInt(tx.chainId) : undefined,
    };

    if (txType === 2) {
        const typedTx = new FeeMarketEIP1559Transaction({
            ...txData,
            maxFeePerGas: BigInt(tx.maxFeePerGas || "0"),
            maxPriorityFeePerGas: BigInt(tx.maxPriorityFeePerGas || "0"),
            chainId: BigInt(tx.chainId || "1"),
        });
        return typedTx.serialize();
    } else if (txType === 1) {
        const typedTx = new AccessListEIP2930Transaction({
            ...txData,
            gasPrice: BigInt(tx.gasPrice || "0"),
            accessList: [],
            chainId: BigInt(tx.chainId || "1"),
        });
        return typedTx.serialize();
    } else {
        const legacyTx = new LegacyTransaction({
            ...txData,
            gasPrice: BigInt(tx.gasPrice || "0"),
        });
        return legacyTx.serialize();
    }
}
