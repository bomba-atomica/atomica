/**
 * Ethereum State Proof Generation
 *
 * Tools for generating and managing Ethereum state proofs
 * for cross-chain verification on Aptos.
 */

export {
  getLockId,
  calculateLockStorageKey,
  LOCK_COMMITMENTS_SLOT,
} from "./storage-key.js";

export {
  generateLockedBalanceProof,
  isProofFinalized,
  validateProof,
  formatProof,
  type StorageProof,
  type LockedBalanceProof,
  type LockTerms,
} from "./generator.js";
