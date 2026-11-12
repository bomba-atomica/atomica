/**
 * Unit tests for `sealBid` and `decryptWindowBids` (V2 sealed bids).
 *
 * The Aptos client is mocked. Its views return the fork's golden dealing
 * (`ibe_v2_golden_vectors.json`, atomica-aptos 2c32b09d95): timelock 11 of
 * chain 7, epoch 3, its mpk, identity and revealed key, and the golden bid
 * associated data for bidder 0x0101..01 on auction 5.
 *
 * Checks that sealing reads get_mpk, get_timelock_identity and
 * bid_associated_data from chain, that the golden dk opens the sealed bid, and
 * that decryptWindowBids recovers price and salt and matches the commitment.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/aptos/config.js", () => ({
  CONTRACT_ADDR: "0xa7",
  aptos: { view: vi.fn() },
}));

import { sealBid, decryptWindowBids } from "../src/aptos/sealed-bid.js";
import { decryptBid } from "../src/ibe/index.js";
import { computeBidCommitment, encodeBidPlaintext } from "../src/ibe/bid.js";
import * as config from "../src/aptos/config.js";

const MPK =
  "0x90292b69a7de0fcb812677b5ff6a1cce5e6675d44c3417946bba5c105c5dfd9c93ad4141fad344c53d7ef6064c6ef58515b82c5db29ce4adf611f88dcd5d80b1f296e469088bd7f5c541c8591652590fbcf75acd409b6d7cb97f62ba9d1154e1";
const IDENTITY =
  "0x9dcd40d8e053a03fae801e09695f8bd2c2c3ec9b8d94a9e03b7e59266fe508de";
const DK =
  "0xa8c4087e7b24e13bb5d21eb9f45021eae69700504d9986ac20e3e30c428e31117f5213674e07b40c1c53499146a8f372";
const OTHER_DK =
  "0xb9014ffbaf3e78a5e56ca9e9ef54ecda540bd436604c7e5508dff029c5ce06879d05c5439c581d5c3d756be53ada038e";
const AD =
  "0x1761746f6d6963612f74696d656c6f636b2d6269642f76320703000000000000000b000000000000000500000000000000010101010101010101010101010101010101010101010101010101010101010100401e18240a0600";
const BIDDER =
  "0x0101010101010101010101010101010101010101010101010101010101010101";
const WINDOW = 5n;
// SCOUT(#224) EDIT: use LAUNCH_PAIR_BCS; empty pair bytes name no window once the allowlist exists.
const PAIR = new Uint8Array(0);
const TIMELOCK = 11n;

function bytes(h: string): Uint8Array {
  const c = h.replace(/^0x/, "");
  return new Uint8Array(c.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
}

function hex(b: Uint8Array): string {
  return "0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// SCOUT(#235) EDIT: this fake chain needs the get_timelock_epoch and get_deadline views, a chain id, and a second endpoint.
/** A fake chain: view name -> result, with one stored bid. */
function mockChain(
  stored: { ciphertext: Uint8Array; commitment: Uint8Array } | null,
  dk = DK,
) {
  const calls: string[] = [];
  vi.mocked(config.aptos.view).mockImplementation((async ({
    payload,
  }: {
    payload: { function: string; functionArguments: unknown[] };
  }) => {
    const name = payload.function.split("::").slice(1).join("::");
    calls.push(name);
    switch (name) {
      case "auction::get_window_status":
        return [TIMELOCK.toString(), false, false];
      case "timelock::get_mpk":
        return [MPK];
      case "timelock::get_timelock_identity":
        expect(payload.functionArguments).toEqual([TIMELOCK]);
        return [IDENTITY];
      case "auction::bid_associated_data":
        expect(payload.functionArguments).toEqual([TIMELOCK, WINDOW, BIDDER]);
        return [AD];
      case "timelock::get_decryption_key":
        return [dk];
      case "auction::get_bid_count":
        return [stored ? "1" : "0"];
      // SCOUT(#216) EDIT: the mocked tuple gains the validity flag.
      // SCOUT(#228) EDIT: the mocked tuple loses the commitment.
      case "auction::get_bid_info":
        return [
          BIDDER,
          hex(stored!.ciphertext),
          hex(stored!.commitment),
          false,
          "0",
        ];
      default:
        throw new Error(`unexpected view ${payload.function}`);
    }
  }) as never);
  return calls;
}

// SCOUT(#228) EDIT: no salt and no commitment; the ciphertext body is 8 + 16 bytes, not 40 + 16.
describe("sealBid", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads mpk, identity and associated data from chain and seals a bid the golden dk opens", async () => {
    const calls = mockChain(null);
    const salt = new Uint8Array(32).fill(9);
    const sealed = await sealBid(WINDOW, PAIR, BIDDER, 2010n, salt);

    expect(calls).toEqual(
      expect.arrayContaining([
        "auction::get_window_status",
        "timelock::get_mpk",
        "timelock::get_timelock_identity",
        "auction::bid_associated_data",
      ]),
    );
    expect(sealed.timelockId).toBe(TIMELOCK);
    expect(sealed.salt).toEqual(salt);
    expect(sealed.commitment).toEqual(
      computeBidCommitment(2010n, salt, bytes(AD)),
    );
    // BCS(vk 32, U 96, nonce 12, C 40+16, sig 64), each with a 1-byte length.
    expect(sealed.ciphertext.length).toBe(33 + 97 + 13 + 57 + 65);
    expect(
      decryptBid(bytes(DK), bytes(IDENTITY), bytes(AD), sealed.ciphertext),
    ).toEqual(encodeBidPlaintext(2010n, salt));
  });

  it("draws a fresh salt and ciphertext for every bid", async () => {
    mockChain(null);
    const a = await sealBid(WINDOW, PAIR, BIDDER, 1n);
    const b = await sealBid(WINDOW, PAIR, BIDDER, 1n);
    expect(a.salt).not.toEqual(b.salt);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });
});

// SCOUT(#228) EDIT: drop the salt and commitment expectations and the commitment mismatch case.
describe("decryptWindowBids", () => {
  beforeEach(() => vi.clearAllMocks());

  it("opens a stored bid with get_decryption_key and matches its commitment", async () => {
    mockChain(null);
    const salt = new Uint8Array(32).fill(3);
    const sealed = await sealBid(WINDOW, PAIR, BIDDER, 777n, salt);

    const calls = mockChain(sealed);
    const [bid] = await decryptWindowBids(WINDOW, PAIR);
    expect(calls).toContain("timelock::get_decryption_key");
    expect(bid.error).toBeUndefined();
    expect(bid.price).toBe(777n);
    expect(bid.salt).toEqual(salt);
    expect(bid.matchesCommitment).toBe(true);
    expect(bid.bidder).toBe(BIDDER);
  });

  it("reports a bid the revealed key cannot open instead of throwing", async () => {
    mockChain(null);
    const sealed = await sealBid(WINDOW, PAIR, BIDDER, 5n);
    mockChain(sealed, OTHER_DK);
    const [bid] = await decryptWindowBids(WINDOW, PAIR);
    expect(bid.price).toBeUndefined();
    expect(bid.matchesCommitment).toBe(false);
    expect(bid.error).toBeTruthy();
  });

  it("flags a bid whose plaintext does not match its commitment", async () => {
    mockChain(null);
    const sealed = await sealBid(WINDOW, PAIR, BIDDER, 5n);
    mockChain({ ...sealed, commitment: new Uint8Array(32) });
    const [bid] = await decryptWindowBids(WINDOW, PAIR);
    expect(bid.price).toBe(5n);
    expect(bid.matchesCommitment).toBe(false);
  });
});

describe("planned tests (SCOUT)", () => {
  it.todo(
    "SCOUT(#216) getBidInfo returns the validity flag of the bid view tuple",
  );
  it.todo(
    "SCOUT(#235) sealBid builds the golden identity and associated data locally, and the golden key opens the bid",
  );
  it.todo(
    "SCOUT(#235) sealBid throws and never encrypts when the node returns a different timelock identity",
  );
  it.todo(
    "SCOUT(#235) sealBid throws and never encrypts when the node returns different bid associated data",
  );
  it.todo(
    "SCOUT(#235) sealBid throws when two endpoints return different master public keys, and seals when they agree",
  );
  it.todo(
    "SCOUT(#228) sealBid output decrypts with the golden key to exactly 8 bytes, the little-endian price",
  );
});
