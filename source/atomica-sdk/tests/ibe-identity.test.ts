/**
 * Unit tests for `computeIdentity` — IBE timelock identity derivation.
 *
 * `computeIdentity(timelockId, deadlineUs)` must produce output identical to
 * `timelock_config::compute_identity` in Move:
 *   SHA3-256( BCS(timelock_id: u64) || BCS(deadline_us: u64) )
 *
 * BCS encoding of u64 is 8 bytes little-endian.
 *
 * Golden vectors below were generated from the TypeScript implementation and
 * cross-checked against the Move specification. Any divergence between the
 * TypeScript and Move outputs is a correctness failure.
 *
 * @see source/atomica-move-contracts/sources/timelock_config.move
 * @see docs/architecture/v0-architecture.md §2 — sealed-bid reveal path
 */

import { describe, it, expect } from "vitest";
import { computeIdentity } from "../src/ibe/identity";

/**
 * Helper: convert a hex string to a Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

describe("computeIdentity — golden vector correctness", () => {
  it("vector 1: timelockId=0, deadlineUs=0n → known SHA3-256 digest", () => {
    const expected = hexToBytes(
      "61664696888a110278ff672620c85217e69aa662a83304052f1014d395f545bf",
    );
    const result = computeIdentity(0, 0n);
    expect(result).toEqual(expected);
    expect(result.length).toBe(32);
  });

  it("vector 2: timelockId=1, deadlineUs=1_000_000n → known SHA3-256 digest", () => {
    const expected = hexToBytes(
      "0412e9e403114380fe806d0c059d7ec08df65203adbf56858b2c005894bd2a42",
    );
    const result = computeIdentity(1, 1_000_000n);
    expect(result).toEqual(expected);
    expect(result.length).toBe(32);
  });

  it("produces distinct outputs for distinct inputs", () => {
    const a = computeIdentity(0, 0n);
    const b = computeIdentity(1, 0n);
    const c = computeIdentity(0, 1n);
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(c);
    expect(b).not.toEqual(c);
  });

  it("is deterministic — same inputs always produce same output", () => {
    const first = computeIdentity(42, 9999999n);
    const second = computeIdentity(42, 9999999n);
    expect(first).toEqual(second);
  });
});
