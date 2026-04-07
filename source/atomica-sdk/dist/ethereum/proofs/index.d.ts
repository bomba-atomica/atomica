/**
 * Ethereum State Proof Generation
 *
 * Tools for generating and managing Ethereum state proofs
 * for cross-chain verification on Aptos.
 */
export { getLockKey, calculateLockedBalanceStorageKey, calculateUnlockTimeStorageKey, verifyStorageKeyCalculation, calculateBatchStorageKeys, } from "./storage-key.js";
export { generateLockedBalanceProof, generateBatchProofs, isProofFinalized, serializeProofForAptos, validateProof, formatProof, type StorageProof, type LockedBalanceProof, } from "./generator.js";
