/**
 * LockBox-Specific Proof Generation
 *
 * Generates state proofs for LockBox contract locked balances.
 * Uses @atomica/state-proof-verifier for core proof fetching and verification.
 */
import { ethers } from "ethers";
import { fetchProof, } from "@atomica/state-proof-verifier";
import { calculateLockedBalanceStorageKey } from "./storage-key";
/**
 * Generate state proof for a locked balance in LockBox contract
 *
 * @param provider - Ethereum provider
 * @param lockBoxAddress - Address of LockBox contract
 * @param userAddress - Address of user who locked tokens
 * @param tokenAddress - Address of token (FakeETH or FakeUSD)
 * @param blockNumber - Block number to generate proof at (default: latest)
 * @returns Complete state proof with LockBox context
 */
export async function generateLockedBalanceProof(provider, lockBoxAddress, userAddress, tokenAddress, blockNumber) {
    // Normalize addresses
    const contractAddr = ethers.getAddress(lockBoxAddress);
    const userAddr = ethers.getAddress(userAddress);
    const tokenAddr = ethers.getAddress(tokenAddress);
    // Use latest block if not specified
    if (!blockNumber) {
        blockNumber = await provider.getBlockNumber();
    }
    // Calculate LockBox storage key for lockedBalances[user][token]
    const storageKey = calculateLockedBalanceStorageKey(userAddr, tokenAddr);
    // Get RPC URL from provider
    // For JsonRpcProvider, we can access the URL via _getConnection()
    const jsonProvider = provider;
    const connection = jsonProvider._getConnection();
    const rpcUrl = connection.url;
    // Fetch proof using state-proofs library
    const ethereumProof = await fetchProof(rpcUrl, contractAddr, [storageKey], blockNumber);
    // Get block information
    const block = await provider.getBlock(blockNumber);
    if (!block) {
        throw new Error(`Block ${blockNumber} not found`);
    }
    if (!block.hash || !block.stateRoot) {
        throw new Error(`Block ${blockNumber} missing hash or stateRoot`);
    }
    // Extract storage value from proof
    const storageProofData = ethereumProof.storageProof[0];
    const storageValue = BigInt(storageProofData.value);
    // Return LockBox-specific proof format
    return {
        blockNumber,
        blockHash: block.hash,
        stateRoot: block.stateRoot,
        contractAddress: contractAddr,
        userAddress: userAddr,
        tokenAddress: tokenAddr,
        storageKey,
        storageValue,
        accountProof: ethereumProof.accountProof,
        storageProof: storageProofData.proof,
        timestamp: block.timestamp,
        generatedAt: Date.now(),
    };
}
/**
 * Generate proofs for multiple users/tokens in batch
 *
 * @param provider - Ethereum provider
 * @param lockBoxAddress - LockBox contract address
 * @param users - Array of user addresses
 * @param tokens - Array of token addresses
 * @param blockNumber - Block number (default: latest)
 * @returns Array of proofs
 */
export async function generateBatchProofs(provider, lockBoxAddress, users, tokens, blockNumber) {
    const proofs = [];
    for (const user of users) {
        for (const token of tokens) {
            const proof = await generateLockedBalanceProof(provider, lockBoxAddress, user, token, blockNumber);
            proofs.push(proof);
        }
    }
    return proofs;
}
/**
 * Verify that a proof was generated from a finalized block
 *
 * @param provider - Ethereum provider
 * @param proof - State proof to verify
 * @param minConfirmations - Minimum confirmations required (default: 64 for finality)
 * @returns True if block is finalized
 */
export async function isProofFinalized(provider, proof, minConfirmations = 64) {
    const latestBlock = await provider.getBlockNumber();
    const confirmations = latestBlock - proof.blockNumber;
    return confirmations >= minConfirmations;
}
/**
 * Serialize proof for transmission to Aptos
 *
 * Converts proof to a format suitable for Move structs
 *
 * @param proof - State proof
 * @returns Serialized proof data for Aptos
 */
export function serializeProofForAptos(proof) {
    return {
        block_hash: proof.blockHash,
        state_root: proof.stateRoot,
        contract_address: proof.contractAddress,
        storage_key: proof.storageKey,
        storage_value: ethers.toBeHex(proof.storageValue),
        account_proof: proof.accountProof,
        storage_proof: proof.storageProof,
    };
}
/**
 * Validate proof structure
 *
 * @param proof - State proof to validate
 * @throws Error if proof is invalid
 */
export function validateProof(proof) {
    if (!proof.blockHash || proof.blockHash === ethers.ZeroHash) {
        throw new Error("Invalid block hash");
    }
    if (!proof.stateRoot || proof.stateRoot === ethers.ZeroHash) {
        throw new Error("Invalid state root");
    }
    if (!proof.accountProof || proof.accountProof.length === 0) {
        throw new Error("Account proof is empty");
    }
    if (!proof.storageProof || proof.storageProof.length === 0) {
        throw new Error("Storage proof is empty");
    }
    if (proof.storageValue < 0n) {
        throw new Error("Storage value cannot be negative");
    }
    // Verify addresses are valid
    try {
        ethers.getAddress(proof.contractAddress);
        ethers.getAddress(proof.userAddress);
        ethers.getAddress(proof.tokenAddress);
    }
    catch (error) {
        throw new Error(`Invalid address in proof: ${error instanceof Error ? error.message : String(error)}`);
    }
}
/**
 * Format proof for display/logging
 *
 * @param proof - State proof
 * @returns Human-readable proof summary
 */
export function formatProof(proof) {
    return `
LockBox Proof:
  Block: ${proof.blockNumber} (${proof.blockHash.slice(0, 10)}...)
  State Root: ${proof.stateRoot.slice(0, 10)}...
  Contract: ${proof.contractAddress}
  User: ${proof.userAddress}
  Token: ${proof.tokenAddress}
  Storage Key: ${proof.storageKey.slice(0, 10)}...
  Storage Value: ${proof.storageValue.toString()} wei
  Account Proof Nodes: ${proof.accountProof.length}
  Storage Proof Nodes: ${proof.storageProof.length}
  Timestamp: ${new Date(proof.timestamp * 1000).toISOString()}
`.trim();
}
// Alias for backwards compatibility / simpler naming
export const generateLockProof = generateLockedBalanceProof;
export const calculateStorageKey = calculateLockedBalanceStorageKey;
//# sourceMappingURL=generator.js.map