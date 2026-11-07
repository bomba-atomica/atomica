/**
 * Ethereum State Proof Generation
 *
 * Tools for generating and managing Ethereum state proofs
 * for cross-chain verification on Aptos.
 */

export {
  getLockKey,
  getLockId,
  calculateLockStorageKey,
  LOCK_AMOUNTS_SLOT,
  calculateLockedBalanceStorageKey,
  calculateUnlockTimeStorageKey,
  verifyStorageKeyCalculation,
  calculateBatchStorageKeys,
} from "./storage-key.js";

export {
  generateLockedBalanceProof,
  isProofFinalized,
  validateProof,
  formatProof,
  type StorageProof,
  type LockedBalanceProof,
} from "./generator.js";
