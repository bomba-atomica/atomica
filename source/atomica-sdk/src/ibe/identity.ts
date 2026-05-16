import { sha3_256 } from "@noble/hashes/sha3";

/**
 * Compute the IBE identity bytes for a timelock window.
 *
 * Matches `timelock_config::compute_identity` in Move exactly:
 *   SHA3-256( BCS(timelock_id: u64) || BCS(deadline_us: u64) )
 *
 * BCS encoding of a u64 is 8 bytes little-endian.
 *
 * @param timelockId - Timelock / window ID (u64)
 * @param deadlineUs - Deadline in microseconds (u64 as bigint)
 * @returns 32-byte SHA3-256 identity digest
 *
 * @see docs/architecture/v0-architecture.md §2 — sealed-bid reveal path
 * @see source/atomica-move-contracts/sources/timelock_config.move
 */
export function computeIdentity(
  timelockId: number,
  deadlineUs: bigint,
): Uint8Array {
  const buf = new ArrayBuffer(16); // 8 bytes for u64 timelockId + 8 bytes for u64 deadlineUs
  const view = new DataView(buf);

  // BCS u64: 8 bytes little-endian
  view.setBigUint64(0, BigInt(timelockId), true /* little-endian */);
  view.setBigUint64(8, deadlineUs, true /* little-endian */);

  return sha3_256(new Uint8Array(buf));
}
