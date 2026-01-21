/**
 * RPC client for fetching proofs from any Ethereum node
 *
 * Supports mainnet, testnets, Infura, Alchemy, local nodes, etc.
 */

import { createPublicClient, http, type Hex, type BlockTag } from "viem";
import { mainnet } from "viem/chains";
import type { EthereumProof, Block, Transaction, Receipt } from "./types";

/**
 * Fetch account and storage proofs from an Ethereum RPC endpoint
 *
 * @param rpcUrl - Ethereum RPC endpoint URL
 * @param address - Account address to fetch proof for
 * @param storageKeys - Storage slot keys to include in proof
 * @param block - Block number or tag ('latest', 'finalized', 'safe')
 * @returns Proof data including accountProof and storageProof
 */
export async function fetchProof(
    rpcUrl: string,
    address: string,
    storageKeys: string[],
    block: number | string | bigint,
): Promise<EthereumProof> {
    const client = createPublicClient({
        chain: mainnet, // Chain ID doesn't matter for getProof usually, but viem needs one
        transport: http(rpcUrl),
    });

    try {
        let proof;
        // Handle BigInt block numbers which might come from receipts
        if (typeof block === "number" || typeof block === "bigint") {
            proof = await client.getProof({
                address: address as Hex,
                storageKeys: storageKeys as Hex[],
                blockNumber: BigInt(block),
            });
        } else {
            proof = await client.getProof({
                address: address as Hex,
                storageKeys: storageKeys as Hex[],
                blockTag: block as BlockTag,
            });
        }

        // Map viem result to EthereumProof
        return {
            address: proof.address,
            accountProof: proof.accountProof as string[],
            balance: `0x${proof.balance.toString(16)}`,
            codeHash: proof.codeHash,
            nonce: `0x${proof.nonce.toString(16)}`,
            storageHash: proof.storageHash,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            storageProof: proof.storageProof.map((sp: any) => ({
                key: sp.key,
                value: `0x${sp.value.toString(16)}`,
                proof: sp.proof as string[],
            })),
        };
    } catch (error) {
        throw new Error(
            `Failed to fetch proof: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/**
 * Fetch block header data including state root
 *
 * @param rpcUrl - Ethereum RPC endpoint URL
 * @param block - Block number or tag
 * @returns Block data including stateRoot, transactionsRoot, receiptsRoot
 */
export async function fetchBlock(rpcUrl: string, block: number | string | bigint): Promise<Block> {
    const client = createPublicClient({
        chain: mainnet,
        transport: http(rpcUrl),
    });

    try {
        let blockData;
        if (typeof block === "number" || typeof block === "bigint") {
            blockData = await client.getBlock({
                blockNumber: BigInt(block),
            });
        } else {
            blockData = await client.getBlock({
                blockTag: block as BlockTag,
            });
        }

        return {
            number: blockData.number ? `0x${blockData.number.toString(16)}` : "0x0",
            hash: blockData.hash || "",
            stateRoot: blockData.stateRoot,
            transactionsRoot: blockData.transactionsRoot || "",
            receiptsRoot: blockData.receiptsRoot || "",
            parentHash: blockData.parentHash,
            timestamp: `0x${blockData.timestamp.toString(16)}`,
            transactions: [],
        };
    } catch (error) {
        throw new Error(
            `Failed to fetch block: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/**
 * Fetch all transactions in a block
 *
 * @param rpcUrl - Ethereum RPC endpoint URL
 * @param block - Block number or tag
 * @returns Array of transaction objects
 */
export async function fetchBlockTransactions(
    rpcUrl: string,
    block: number | string | bigint,
): Promise<Transaction[]> {
    const client = createPublicClient({
        chain: mainnet,
        transport: http(rpcUrl),
    });

    try {
        let blockData;
        if (typeof block === "number" || typeof block === "bigint") {
            blockData = await client.getBlock({
                blockNumber: BigInt(block),
                includeTransactions: true,
            });
        } else {
            blockData = await client.getBlock({
                blockTag: block as BlockTag,
                includeTransactions: true,
            });
        }

        return (blockData.transactions || []).map((tx) => ({
            hash: tx.hash,
            nonce: `0x${tx.nonce.toString(16)}`,
            blockHash: tx.blockHash || null,
            blockNumber: tx.blockNumber ? `0x${tx.blockNumber.toString(16)}` : null,
            transactionIndex: tx.transactionIndex ? `0x${tx.transactionIndex.toString(16)}` : null,
            from: tx.from,
            to: tx.to || null,
            value: `0x${tx.value.toString(16)}`,
            gasPrice: tx.gasPrice ? `0x${tx.gasPrice.toString(16)}` : "0x0",
            gas: `0x${tx.gas.toString(16)}`,
            input: tx.input,
            type: tx.type ? `0x${Number(tx.type).toString(16)}` : undefined,
            v: tx.v !== undefined ? `0x${Number(tx.v).toString(16)}` : undefined,
            r: tx.r !== undefined ? `0x${Number(tx.r).toString(16)}` : undefined,
            s: tx.s !== undefined ? `0x${Number(tx.s).toString(16)}` : undefined,
            maxFeePerGas: tx.maxFeePerGas ? `0x${tx.maxFeePerGas.toString(16)}` : undefined,
            maxPriorityFeePerGas: tx.maxPriorityFeePerGas
                ? `0x${tx.maxPriorityFeePerGas.toString(16)}`
                : undefined,
            chainId: tx.chainId ? `0x${tx.chainId.toString(16)}` : undefined,
        }));
    } catch (error) {
        throw new Error(
            `Failed to fetch block transactions: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/**
 * Fetch all receipts in a block
 *
 * @param rpcUrl - Ethereum RPC endpoint URL
 * @param block - Block number or tag
 * @returns Array of receipt objects
 */
export async function fetchBlockReceipts(
    rpcUrl: string,
    block: number | string | bigint,
): Promise<Receipt[]> {
    const client = createPublicClient({
        chain: mainnet,
        transport: http(rpcUrl),
    });

    try {
        let blockData;
        if (typeof block === "number" || typeof block === "bigint") {
            blockData = await client.getBlock({
                blockNumber: BigInt(block),
                includeTransactions: true,
            });
        } else {
            blockData = await client.getBlock({
                blockTag: block as BlockTag,
                includeTransactions: true,
            });
        }

        const blockHash = blockData.hash;
        const blockNumberHex = blockData.number ? `0x${blockData.number.toString(16)}` : "0x0";

        const receipts: Receipt[] = [];
        if (blockData.transactions && blockData.transactions.length > 0) {
            for (const tx of blockData.transactions) {
                try {
                    const receipt = await client.getTransactionReceipt({ hash: tx.hash });
                    receipts.push({
                        transactionHash: receipt.transactionHash,
                        transactionIndex: `0x${receipt.transactionIndex.toString(16)}`,
                        blockHash: receipt.blockHash || blockHash,
                        blockNumber: receipt.blockNumber
                            ? `0x${receipt.blockNumber.toString(16)}`
                            : blockNumberHex,
                        from: receipt.from,
                        to: receipt.to === undefined ? null : receipt.to,
                        cumulativeGasUsed: `0x${receipt.cumulativeGasUsed.toString(16)}`,
                        gasUsed: `0x${receipt.gasUsed.toString(16)}`,
                        contractAddress: receipt.contractAddress ?? null,
                        logs: receipt.logs.map((log) => ({
                            address: log.address,
                            topics: log.topics,
                            data: log.data,
                            blockNumber: log.blockNumber
                                ? `0x${log.blockNumber.toString(16)}`
                                : "0x0",
                            transactionHash: log.transactionHash,
                            transactionIndex: log.transactionIndex
                                ? `0x${log.transactionIndex.toString(16)}`
                                : "0x0",
                            blockHash: log.blockHash,
                            logIndex: log.logIndex ? `0x${log.logIndex.toString(16)}` : "0x0",
                            removed: false,
                        })),
                        logsBloom: receipt.logsBloom,
                        status: receipt.status === "success" ? "0x1" : "0x0",
                        type:
                            receipt.type !== undefined
                                ? `0x${Number(receipt.type).toString(16)}`
                                : "0x0",
                    });
                } catch {
                    // Skip if receipt fetch fails for this transaction
                }
            }
        }

        return receipts;
    } catch (error) {
        throw new Error(
            `Failed to fetch block receipts: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/**
 * Fetch transaction receipt
 *
 * @param rpcUrl - Ethereum RPC endpoint URL
 * @param txHash - Transaction hash
 * @returns Transaction receipt with block number
 */
export async function fetchTransactionReceipt(rpcUrl: string, txHash: string) {
    const client = createPublicClient({
        chain: mainnet,
        transport: http(rpcUrl),
    });

    try {
        const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
        return {
            blockNumber: receipt.blockNumber,
            from: receipt.from,
            to: receipt.to,
            status: receipt.status,
        };
    } catch (error) {
        throw new Error(
            `Failed to fetch receipt: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/**
 * Fetch transaction details
 *
 * @param rpcUrl - Ethereum RPC endpoint URL
 * @param txHash - Transaction hash
 * @returns Transaction details (value, data, etc.)
 */
export async function fetchTransaction(rpcUrl: string, txHash: string) {
    const client = createPublicClient({
        chain: mainnet,
        transport: http(rpcUrl),
    });

    try {
        const tx = await client.getTransaction({ hash: txHash as Hex });
        return {
            from: tx.from,
            to: tx.to,
            value: tx.value,
            input: tx.input,
            nonce: tx.nonce,
        };
    } catch (error) {
        throw new Error(
            `Failed to fetch transaction: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}

/**
 * Fetch transaction receipt with full details
 *
 * @param rpcUrl - Ethereum RPC endpoint URL
 * @param txHash - Transaction hash
 * @returns Transaction receipt with full details including logs
 */
export async function fetchFullTransactionReceipt(rpcUrl: string, txHash: string) {
    const client = createPublicClient({
        chain: mainnet,
        transport: http(rpcUrl),
    });

    try {
        const receipt = await client.getTransactionReceipt({ hash: txHash as Hex });
        return {
            blockNumber: receipt.blockNumber,
            from: receipt.from,
            to: receipt.to,
            status: receipt.status === "success" ? "0x1" : "0x0",
            cumulativeGasUsed: receipt.cumulativeGasUsed,
            gasUsed: receipt.gasUsed,
            logsBloom: receipt.logsBloom,
            logs: receipt.logs.map((log) => ({
                address: log.address,
                topics: log.topics,
                data: log.data,
                blockNumber: log.blockNumber ? `0x${log.blockNumber.toString(16)}` : "0x0",
                transactionHash: log.transactionHash,
                transactionIndex: log.transactionIndex
                    ? `0x${log.transactionIndex.toString(16)}`
                    : "0x0",
                blockHash: log.blockHash,
                logIndex: log.logIndex ? `0x${log.logIndex.toString(16)}` : "0x0",
                removed: false,
            })),
            type: receipt.type !== undefined ? `0x${Number(receipt.type).toString(16)}` : "0x0",
            transactionIndex: receipt.transactionIndex,
            blockHash: receipt.blockHash,
            transactionHash: receipt.transactionHash,
        };
    } catch (error) {
        throw new Error(
            `Failed to fetch receipt: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}
