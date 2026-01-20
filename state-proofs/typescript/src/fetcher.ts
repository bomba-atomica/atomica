/**
 * RPC client for fetching proofs from any Ethereum node
 *
 * Supports mainnet, testnets, Infura, Alchemy, local nodes, etc.
 */

import { createPublicClient, http, type Hex, type BlockTag } from "viem";
import { mainnet } from "viem/chains";
import type { EthereumProof, Block } from "./types";

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
    block: number | string,
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
 * @returns Block data including stateRoot, hash, number, etc.
 */
export async function fetchBlock(rpcUrl: string, block: number | string): Promise<Block> {
    const client = createPublicClient({
        chain: mainnet,
        transport: http(rpcUrl),
    });

    try {
        let blockData;
        // Handle BigInt block numbers which might come from receipts
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
            parentHash: blockData.parentHash,
            timestamp: `0x${blockData.timestamp.toString(16)}`,
            transactions: [], // We don't need txs for state verification
        };
    } catch (error) {
        throw new Error(
            `Failed to fetch block: ${error instanceof Error ? error.message : String(error)}`,
        );
    }
}
