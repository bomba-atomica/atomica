/**
 * Parity tests for the V2 bid helpers against the framework golden vectors
 * (`aptos_framework::ibe_golden_vector_fixtures`) and the Move contract:
 *   - `buildBidAd` equals `bid_ad()` byte for byte.
 *   - `computeTimelockIdentityV2` equals the fixture identity for (7, 3, 11, 1.7e15).
 *   - `computeBidCommitment` equals the known answer pinned in
 *     `auction_bid_wrapper_tests.move` (`commitment_known_answer_matches_sdk`).
 */
import { describe, it, expect } from "vitest";
import {
  buildBidAd,
  computeBidCommitment,
  computeTimelockIdentityV2,
  encodeBidPlaintext,
} from "../src/ibe/bid";

function hex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

const GOLDEN_AD =
  "1761746f6d6963612f74696d656c6f636b2d6269642f76320703000000000000000b000000000000000500000000000000010101010101010101010101010101010101010101010101010101010101010100401e18240a0600";
const GOLDEN_IDENTITY =
  "9dcd40d8e053a03fae801e09695f8bd2c2c3ec9b8d94a9e03b7e59266fe508de";
const GOLDEN_BIDDER =
  "0x0101010101010101010101010101010101010101010101010101010101010101";
const DEADLINE = 1_700_000_000_000_000n;

describe("V2 bid helpers", () => {
  it("buildBidAd equals the golden bid_ad()", () => {
    const ad = buildBidAd({
      chainId: 7,
      epoch: 3n,
      timelockId: 11n,
      auctionId: 5n,
      bidder: GOLDEN_BIDDER,
      deadlineUs: DEADLINE,
    });
    expect(hex(ad)).toBe(GOLDEN_AD);
  });

  it("buildBidAd changes with each field", () => {
    const base = {
      chainId: 7,
      epoch: 3n,
      timelockId: 11n,
      auctionId: 5n,
      bidder: GOLDEN_BIDDER,
      deadlineUs: DEADLINE,
    };
    const ref = hex(buildBidAd(base));
    expect(hex(buildBidAd({ ...base, chainId: 8 }))).not.toBe(ref);
    expect(hex(buildBidAd({ ...base, epoch: 4n }))).not.toBe(ref);
    expect(hex(buildBidAd({ ...base, timelockId: 12n }))).not.toBe(ref);
    expect(hex(buildBidAd({ ...base, auctionId: 6n }))).not.toBe(ref);
    expect(hex(buildBidAd({ ...base, bidder: "0x2" }))).not.toBe(ref);
    expect(hex(buildBidAd({ ...base, deadlineUs: DEADLINE + 1n }))).not.toBe(
      ref,
    );
  });

  it("computeTimelockIdentityV2 equals the golden identity", () => {
    expect(hex(computeTimelockIdentityV2(7, 3n, 11n, DEADLINE))).toBe(
      GOLDEN_IDENTITY,
    );
  });

  it("computeBidCommitment equals the Move known answer", () => {
    const ad = buildBidAd({
      chainId: 7,
      epoch: 3n,
      timelockId: 11n,
      auctionId: 5n,
      bidder: GOLDEN_BIDDER,
      deadlineUs: DEADLINE,
    });
    const salt = new Uint8Array(32).fill(7);
    expect(hex(computeBidCommitment(2010n, salt, ad))).toBe(
      "ad4005855d20995dfe6a36716d9550844b9565ae1a0713f1c0e77128a7b7e8ee",
    );
  });

  it("encodeBidPlaintext is price_le8 || salt32", () => {
    const salt = new Uint8Array(32).fill(7);
    const pt = encodeBidPlaintext(2010n, salt);
    expect(pt.length).toBe(40);
    expect(new DataView(pt.buffer).getBigUint64(0, true)).toBe(2010n);
    expect(pt.slice(8)).toEqual(salt);
  });

  it("rejects a salt that is not 32 bytes", () => {
    expect(() => encodeBidPlaintext(1n, new Uint8Array(31))).toThrow();
    expect(() =>
      computeBidCommitment(1n, new Uint8Array(33), new Uint8Array(0)),
    ).toThrow();
  });
});
