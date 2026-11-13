/**
 * Unit tests for `sealBid` and `decryptWindowBids` (V2 sealed bids).
 *
 * The Aptos client is mocked. Its views return the fork's golden dealing
 * (`ibe_v2_golden_vectors.json`, atomica-aptos 2c32b09d95): timelock 11 of
 * chain 7, epoch 3, deadline 1.7e15 us, its mpk, identity and revealed key,
 * and the golden bid associated data for bidder 0x0101..01 on auction 5.
 *
 * Checks that sealing builds the identity and associated data locally from the
 * chain id, epoch and deadline, refuses a node whose identity or associated
 * data differ, compares the master public key across extra endpoints, and that
 * the golden dk opens the sealed bid. decryptWindowBids recovers price and salt
 * and matches the commitment.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Aptos } from "@aptos-labs/ts-sdk";

vi.mock("../src/aptos/config.js", () => ({
  CONTRACT_ADDR: "0xa7",
  aptos: { view: vi.fn(), getChainId: vi.fn() },
  getExtraAptosClients: vi.fn(() => []),
}));

// Wrap the real encryptor in a spy, so a test can assert it never ran.
vi.mock("@atomica/state-proof-verifier/ibe", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@atomica/state-proof-verifier/ibe")>();
  return { ...actual, encryptBid: vi.fn(actual.encryptBid) };
});

import { sealBid, decryptWindowBids } from "../src/aptos/sealed-bid.js";
import { decryptBid } from "../src/ibe/index.js";
import { encryptBid } from "@atomica/state-proof-verifier/ibe";
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
const CHAIN_ID = 7;
const EPOCH = 3n;
const DEADLINE_US = 1_700_000_000_000_000n;
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

/** What the fake node answers. Override one field to make it lie. */
interface NodeAnswers {
  identity?: string;
  ad?: string;
  mpk?: string;
}

/** A fake chain: view name -> result, with one stored bid. */
function mockChain(
  stored: { ciphertext: Uint8Array; commitment: Uint8Array } | null,
  dk = DK,
  node: NodeAnswers = {},
) {
  const calls: string[] = [];
  vi.mocked(config.aptos.getChainId).mockImplementation(async () => {
    calls.push("getChainId");
    return CHAIN_ID;
  });
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
        return [node.mpk ?? MPK];
      case "timelock::get_timelock_epoch":
        expect(payload.functionArguments).toEqual([TIMELOCK]);
        return [EPOCH.toString()];
      case "timelock::get_deadline":
        expect(payload.functionArguments).toEqual([TIMELOCK]);
        return [DEADLINE_US.toString()];
      case "timelock::get_timelock_identity":
        expect(payload.functionArguments).toEqual([TIMELOCK]);
        return [node.identity ?? IDENTITY];
      case "auction::bid_associated_data":
        expect(payload.functionArguments).toEqual([TIMELOCK, WINDOW, BIDDER]);
        return [node.ad ?? AD];
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

/** An extra endpoint that answers get_mpk with `mpk`. */
function extraEndpoint(mpk: string) {
  const view = vi.fn(async () => [mpk]);
  return { client: { view } as unknown as Aptos, view };
}

// SCOUT(#228) EDIT: no salt and no commitment; the ciphertext body is 8 + 16 bytes, not 40 + 16.
describe("sealBid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(config.getExtraAptosClients).mockReturnValue([]);
  });

  it("sealBid builds the golden identity and associated data locally, and the golden key opens the bid", async () => {
    const calls = mockChain(null);
    const salt = new Uint8Array(32).fill(9);
    const sealed = await sealBid(WINDOW, PAIR, BIDDER, 2010n, salt);

    expect(calls).toEqual(
      expect.arrayContaining([
        "auction::get_window_status",
        "getChainId",
        "timelock::get_timelock_epoch",
        "timelock::get_deadline",
        "timelock::get_mpk",
        "timelock::get_timelock_identity",
        "auction::bid_associated_data",
      ]),
    );
    // Encrypted to the identity and associated data built locally, which
    // equal the golden vectors.
    expect(encryptBid).toHaveBeenCalledTimes(1);
    const [mpk, identity, ad] = vi.mocked(encryptBid).mock.calls[0];
    expect(hex(mpk)).toBe(MPK);
    expect(hex(identity)).toBe(IDENTITY);
    expect(hex(ad)).toBe(AD);

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

  it("sealBid throws and never encrypts when the node returns a different timelock identity", async () => {
    mockChain(null, DK, { identity: "0x" + "ee".repeat(32) });
    await expect(sealBid(WINDOW, PAIR, BIDDER, 1n)).rejects.toThrow(
      /timelock identity/,
    );
    expect(encryptBid).not.toHaveBeenCalled();
  });

  it("sealBid throws and never encrypts when the node returns different bid associated data", async () => {
    // The node's associated data names another bidder.
    mockChain(null, DK, { ad: AD.replace(/(01){32}/, "02".repeat(32)) });
    await expect(sealBid(WINDOW, PAIR, BIDDER, 1n)).rejects.toThrow(
      /associated data/,
    );
    expect(encryptBid).not.toHaveBeenCalled();
  });

  it("sealBid throws when two endpoints return different master public keys, and seals when they agree", async () => {
    const otherMpk = "0x" + "ab".repeat(96);
    const liar = extraEndpoint(otherMpk);
    mockChain(null);
    vi.mocked(config.getExtraAptosClients).mockReturnValue([liar.client]);
    await expect(sealBid(WINDOW, PAIR, BIDDER, 1n)).rejects.toThrow(
      /master public key/,
    );
    expect(liar.view).toHaveBeenCalledTimes(1);
    expect(encryptBid).not.toHaveBeenCalled();

    const honest = extraEndpoint(MPK);
    vi.mocked(config.getExtraAptosClients).mockReturnValue([honest.client]);
    const salt = new Uint8Array(32).fill(4);
    const sealed = await sealBid(WINDOW, PAIR, BIDDER, 42n, salt);
    expect(honest.view).toHaveBeenCalledTimes(1);
    expect(
      decryptBid(bytes(DK), bytes(IDENTITY), bytes(AD), sealed.ciphertext),
    ).toEqual(encodeBidPlaintext(42n, salt));
  });

  it("with no extra endpoint configured, sealBid reads get_mpk once and seals", async () => {
    const calls = mockChain(null);
    const salt = new Uint8Array(32).fill(5);
    const sealed = await sealBid(WINDOW, PAIR, BIDDER, 9n, salt);
    expect(calls.filter((c) => c === "timelock::get_mpk")).toHaveLength(1);
    expect(
      decryptBid(bytes(DK), bytes(IDENTITY), bytes(AD), sealed.ciphertext),
    ).toEqual(encodeBidPlaintext(9n, salt));
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(config.getExtraAptosClients).mockReturnValue([]);
  });

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
    "SCOUT(#228) sealBid output decrypts with the golden key to exactly 8 bytes, the little-endian price",
  );
});
