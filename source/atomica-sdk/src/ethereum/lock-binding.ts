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

// SCOUT(#220) EDIT: replace with the day length 86_400n; windows no longer split a 43 200 s period.
/** Seconds per Aptos auction epoch (`auction::current_window_id`). */
export const WINDOW_EPOCH_SECS = 43_200n;
// SCOUT(#220) EDIT: replace with the two closes, 27_900n (07:45 UTC) and 58_500n (16:15 UTC).
/** Offset of the second window within an epoch (`auction::current_window_id`). */
export const WINDOW_SPLIT_SECS = 28_500n;
// SCOUT(#221) EDIT: LockBox freezes this value; change this mirror with the Move and Solidity constants if the owner picks another reclaim delay.
/**
 * Delay from a window's close to its Ethereum lock deadline
 * (`eth_proof::ETH_RECLAIM_DELAY_SECS`): 72 hours.
 */
export const ETH_RECLAIM_DELAY_SECS = 259_200n;

// SCOUT(#221) EDIT: deadline is no longer an input of lock(); keep it only as the derived value the commitment needs.
/** The fields that bind a lock to its auction. */
export interface LockBinding {
  windowId: bigint;
  /** keccak256 of the window key's pair BCS (see {@link pairHashOf}) */
  pairHash: string;
  /** Unix seconds; equals {@link ethLockDeadline}(windowId) */
  deadline: bigint;
}

// SCOUT(#220) EDIT: new formula: day * 2 + (t >= 27900 ? 1 : 0) + (t >= 58500 ? 1 : 0), with day = nowSecs / 86400 and t = nowSecs % 86400.
/** `auction::current_window_id` at `nowSecs`. */
export function currentWindowId(nowSecs: bigint): bigint {
  const epoch = nowSecs / WINDOW_EPOCH_SECS;
  return (
    epoch * 2n + (nowSecs % WINDOW_EPOCH_SECS >= WINDOW_SPLIT_SECS ? 1n : 0n)
  );
}

// SCOUT(#220) EDIT: new formula: (windowId / 2) * 86400 + (windowId even ? 27900 : 58500).
/** Unix second at which `windowId` stops being the current window. */
export function windowCloseSecs(windowId: bigint): bigint {
  const epochStart = (windowId / 2n) * WINDOW_EPOCH_SECS;
  return (
    epochStart + (windowId % 2n === 0n ? WINDOW_SPLIT_SECS : WINDOW_EPOCH_SECS)
  );
}

// SCOUT(#221) EDIT: must return LockBox.lockDeadline(windowId) for every row of the shared (window id, close, deadline) table.
/** `auction::eth_lock_deadline`: window close plus ETH_RECLAIM_DELAY_SECS. */
export function ethLockDeadline(windowId: bigint): bigint {
  return windowCloseSecs(windowId) + ETH_RECLAIM_DELAY_SECS;
}

// SCOUT(#224) EDIT: callers must pass the allowlisted pair bytes (LAUNCH_PAIR_BCS); a lock bound to other bytes cannot join a window.
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

// SCOUT(#221) EDIT: the key is keccak256(abi.encode(uint64 windowId, bytes32 pairHash)); drop the deadline.
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
