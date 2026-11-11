/**
 * Lock binding: which auction a LockBox lock belongs to, and when it can go
 * home by `reclaim`.
 *
 * Mirrors `LockBox.auctionKey` / `LockBox.lockCommitment` and the Move helpers
 * `auction::eth_lock_deadline`, `auction::auction_key` and
 * `eth_proof::lock_commitment`. Timing values are documented in
 * docs/specifications/auction-timing.md.
 */

import { ethers } from "ethers";

/** Seconds per Aptos auction epoch (`auction::current_window_id`). */
export const WINDOW_EPOCH_SECS = 43_200n;
/** Offset of the second window within an epoch (`auction::current_window_id`). */
export const WINDOW_SPLIT_SECS = 28_500n;
/**
 * Delay from a window's close to its Ethereum lock deadline
 * (`eth_proof::ETH_RECLAIM_DELAY_SECS`): 72 hours.
 */
export const ETH_RECLAIM_DELAY_SECS = 259_200n;

/** The fields that bind a lock to its auction. */
export interface LockBinding {
  windowId: bigint;
  /** keccak256 of the window key's pair BCS (see {@link pairHashOf}) */
  pairHash: string;
  /** Unix seconds; equals {@link ethLockDeadline}(windowId) */
  deadline: bigint;
}

/** `auction::current_window_id` at `nowSecs`. */
export function currentWindowId(nowSecs: bigint): bigint {
  const epoch = nowSecs / WINDOW_EPOCH_SECS;
  return (
    epoch * 2n + (nowSecs % WINDOW_EPOCH_SECS >= WINDOW_SPLIT_SECS ? 1n : 0n)
  );
}

/** Unix second at which `windowId` stops being the current window. */
export function windowCloseSecs(windowId: bigint): bigint {
  const epochStart = (windowId / 2n) * WINDOW_EPOCH_SECS;
  return (
    epochStart + (windowId % 2n === 0n ? WINDOW_SPLIT_SECS : WINDOW_EPOCH_SECS)
  );
}

/** `auction::eth_lock_deadline`: window close plus ETH_RECLAIM_DELAY_SECS. */
export function ethLockDeadline(windowId: bigint): bigint {
  return windowCloseSecs(windowId) + ETH_RECLAIM_DELAY_SECS;
}

/** Pair hash of a window: keccak256 of its pair BCS (the window key's pair bytes). */
export function pairHashOf(pairBcs: Uint8Array): string {
  return ethers.keccak256(pairBcs);
}

/** The binding of a lock into window `windowId` of pair `pairBcs`. */
export function lockBinding(
  windowId: bigint,
  pairBcs: Uint8Array,
): LockBinding {
  return {
    windowId,
    pairHash: pairHashOf(pairBcs),
    deadline: ethLockDeadline(windowId),
  };
}

/** `LockBox.auctionKey`: keccak256(abi.encode(uint64 windowId, bytes32 pairHash, uint64 deadline)). */
export function auctionKey(binding: LockBinding): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint64", "bytes32", "uint64"],
      [binding.windowId, binding.pairHash, binding.deadline],
    ),
  );
}

/**
 * `LockBox.lockCommitment`, the value Aptos proves at `commitments[lockId]`:
 * keccak256(abi.encode(depositor, token, amount, windowId, pairHash, deadline)).
 */
export function lockCommitment(
  depositor: string,
  token: string,
  amount: bigint,
  binding: LockBinding,
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["address", "address", "uint256", "uint64", "bytes32", "uint64"],
      [
        ethers.getAddress(depositor),
        ethers.getAddress(token),
        amount,
        binding.windowId,
        binding.pairHash,
        binding.deadline,
      ],
    ),
  );
}
