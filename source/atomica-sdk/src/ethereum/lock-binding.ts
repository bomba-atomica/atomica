/**
 * Lock binding: which auction a LockBox lock belongs to, and when it can go
 * home by `reclaim`.
 *
 * Mirrors `LockBox.auctionKey` / `LockBox.lockDeadline` / `LockBox.lockCommitment`
 * and the Move helpers `auction::eth_lock_deadline`, `auction::auction_key` and
 * `eth_proof::lock_commitment`. LockBox computes a lock's deadline from its
 * window id; no caller supplies one. Timing values are documented in
 * docs/specifications/auction-timing.md.
 */

import { ethers } from "ethers";

/** Seconds per day (`eth_proof::WINDOW_DAY_SECS`). */
export const WINDOW_DAY_SECS = 86_400n;
/** Second of the day of the morning close, 07:45:00 UTC (`eth_proof::WINDOW_MORNING_CLOSE_SECS`). */
export const WINDOW_MORNING_CLOSE_SECS = 27_900n;
/** Second of the day of the afternoon close, 16:15:00 UTC (`eth_proof::WINDOW_AFTERNOON_CLOSE_SECS`). */
export const WINDOW_AFTERNOON_CLOSE_SECS = 58_500n;
/**
 * Delay from a window's close to its Ethereum lock deadline
 * (`eth_proof::ETH_RECLAIM_DELAY_SECS`, `LockBox.RECLAIM_DELAY`): 72 hours.
 * LockBox freezes it at deploy.
 */
export const ETH_RECLAIM_DELAY_SECS = 259_200n;

/** The fields that bind a lock to its auction. */
export interface LockBinding {
  windowId: bigint;
  /** keccak256 of the window key's pair BCS (see {@link pairHashOf}) */
  pairHash: string;
  /**
   * Unix seconds; always {@link ethLockDeadline}(windowId). Derived, never an
   * input of `LockBox.lock`: the lock commitment binds it, so proofs and
   * `reclaim` need it.
   */
  deadline: bigint;
}

/**
 * A window clock (`eth_proof::get_window_schedule`, `LockBox.windowSchedule`):
 * `closeOffsetsSecs` are the seconds of each day, of length `daySecs`, at
 * which a window closes. One or two offsets, strictly increasing, the first
 * above 0 and the last at most `daySecs`.
 */
export interface WindowSchedule {
  daySecs: bigint;
  closeOffsetsSecs: bigint[];
}

/**
 * The production window clock: closes at 07:45 and 16:15 UTC. Aptos uses it
 * while no schedule is stored. Only a test chain (chain id 4) can store
 * another one, through `eth_proof::set_window_schedule`.
 */
export const PRODUCTION_WINDOW_SCHEDULE: WindowSchedule = {
  daySecs: WINDOW_DAY_SECS,
  closeOffsetsSecs: [WINDOW_MORNING_CLOSE_SECS, WINDOW_AFTERNOON_CLOSE_SECS],
};

/**
 * Parse a schedule in the `ATOMICA_TEST_WINDOW_SCHEDULE` format,
 * `<day_secs>:<offset>[,<offset>...]` (for example `900:900`).
 */
export function parseWindowSchedule(value: string): WindowSchedule {
  const [day, offsets] = value.split(":");
  if (!day || !offsets) {
    throw new Error(
      `window schedule "${value}" is not <day_secs>:<offset>[,<offset>...]`,
    );
  }
  return {
    daySecs: BigInt(day.trim()),
    closeOffsetsSecs: offsets.split(",").map((o) => BigInt(o.trim())),
  };
}

/**
 * `auction::current_window_id` (`eth_proof::window_id_at`) at `nowSecs`. With
 * `n` closes a day: `day * n` plus the number of offsets at or before `t`,
 * with `day = nowSecs / daySecs` and `t = nowSecs % daySecs`. On the default
 * production schedule the id changes exactly at 07:45:00 and 16:15:00 UTC.
 */
export function currentWindowId(
  nowSecs: bigint,
  schedule: WindowSchedule = PRODUCTION_WINDOW_SCHEDULE,
): bigint {
  const t = nowSecs % schedule.daySecs;
  let id =
    (nowSecs / schedule.daySecs) * BigInt(schedule.closeOffsetsSecs.length);
  for (const offset of schedule.closeOffsetsSecs) {
    if (t >= offset) id += 1n;
  }
  return id;
}

/**
 * Unix second at which `windowId` stops being the current window
 * (`eth_proof::window_close_secs`): with `n` closes a day,
 * `(windowId / n) * daySecs + closeOffsetsSecs[windowId % n]`. On the default
 * production schedule an even window closes at 07:45 UTC, an odd one at 16:15 UTC.
 */
export function windowCloseSecs(
  windowId: bigint,
  schedule: WindowSchedule = PRODUCTION_WINDOW_SCHEDULE,
): bigint {
  const n = BigInt(schedule.closeOffsetsSecs.length);
  return (
    (windowId / n) * schedule.daySecs +
    schedule.closeOffsetsSecs[Number(windowId % n)]
  );
}

/**
 * `auction::eth_lock_deadline` and `LockBox.lockDeadline`: window close plus
 * ETH_RECLAIM_DELAY_SECS. The proof generator recomputes the lock commitment
 * from it, so it must equal `LockBox.lockDeadline` exactly
 * (tests/fixtures/window_clock_vectors.json). Pass the chain schedule on a
 * test chain.
 */
export function ethLockDeadline(
  windowId: bigint,
  schedule: WindowSchedule = PRODUCTION_WINDOW_SCHEDULE,
): bigint {
  return windowCloseSecs(windowId, schedule) + ETH_RECLAIM_DELAY_SECS;
}

/**
 * Pair hash of a window: keccak256 of its pair BCS (the window key's pair
 * bytes). Callers pass listed pair bytes (`LAUNCH_PAIR_BCS`): a lock bound to
 * other bytes can never join a window and goes home through reclaim.
 */
export function pairHashOf(pairBcs: Uint8Array): string {
  return ethers.keccak256(pairBcs);
}

/**
 * The binding of a lock into window `windowId` of pair `pairBcs`, on the
 * window clock `schedule` (the production one by default).
 */
export function lockBinding(
  windowId: bigint,
  pairBcs: Uint8Array,
  schedule: WindowSchedule = PRODUCTION_WINDOW_SCHEDULE,
): LockBinding {
  return {
    windowId,
    pairHash: pairHashOf(pairBcs),
    deadline: ethLockDeadline(windowId, schedule),
  };
}

/** `LockBox.auctionKey`: keccak256(abi.encode(uint64 windowId, bytes32 pairHash)). */
export function auctionKey(
  binding: Pick<LockBinding, "windowId" | "pairHash">,
): string {
  return ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint64", "bytes32"],
      [binding.windowId, binding.pairHash],
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
