/**
 * Storage key of one LockBox lock
 *
 * Aptos proves `LockBox.commitments[lockId]` (slot 0, a single-level
 * mapping) with eth_getProof. Nested mappings do not work reliably with
 * eth_getProof on Geth. See: docs/technical/ethereum-state-proof-quirks.md
 */

import { ethers } from "ethers";

/**
 * Storage slot of `LockBox.commitments`, the per-lock commitment Aptos proves
 * (`eth_proof::LOCK_COMMITMENTS_SLOT`).
 */
export const LOCK_COMMITMENTS_SLOT = 0;

/**
 * Id of one LockBox lock, also its Aptos receipt id.
 *
 * Matches `LockBox.getLockId` and `eth_proof::lock_id`:
 * keccak256(abi.encodePacked(user, token, uint256(nonce)))
 *
 * @param userAddress - Address that locked the tokens
 * @param tokenAddress - Locked token (FakeETH or FakeUSD)
 * @param nonce - The lock's nonce from its `Locked` event
 */
export function getLockId(
  userAddress: string,
  tokenAddress: string,
  nonce: bigint,
): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["address", "address", "uint256"],
      [ethers.getAddress(userAddress), ethers.getAddress(tokenAddress), nonce],
    ),
  );
}

/**
 * Storage key of `LockBox.commitments[getLockId(user, token, nonce)]`.
 *
 * Matches `LockBox.commitmentStorageKey` and `eth_proof::lock_storage_key`,
 * which Aptos derives on chain: keccak256(abi.encode(lockId, uint256(0))).
 */
export function calculateLockStorageKey(
  userAddress: string,
  tokenAddress: string,
  nonce: bigint,
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["bytes32", "uint256"],
      [getLockId(userAddress, tokenAddress, nonce), LOCK_COMMITMENTS_SLOT],
    ),
  );
}
