/**
 * Unit tests for `sealBid` and `decryptWindowBids` (V2 sealed bids).
 *
 * The Aptos client is mocked. Its views return the fork's golden dealing
 * (`ibe_v2_golden_vectors.json`, atomica-aptos 245937376b, vectors 3.1.0):
 * timelock 11 of chain 7, epoch 3, deadline 1.7e15 us, its mpk, identity and
 * revealed key, and the golden bid associated data for bidder 0x0101..01 on
 * auction 5. The price bid constants are price case 0 of that file (bidder
 * 0xa1..a1, auction 9, price 1_000_000).
 *
 * Checks that sealing builds the identity and associated data locally from the
 * chain id, epoch and deadline, refuses a node whose identity or associated
 * data differ, compares the master public key across extra endpoints, and that
 * the golden dk opens the sealed bid to exactly the 8-byte little-endian price.
 * decryptWindowBids previews the price.
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

import {
  sealBid,
  decryptWindowBids,
  getBidInfo,
} from "../src/aptos/sealed-bid.js";
import { decryptBid } from "../src/ibe/index.js";
import { encryptBid } from "@atomica/state-proof-verifier/ibe";
import { encodeBidPlaintext } from "../src/ibe/bid.js";
import * as config from "../src/aptos/config.js";
import { LAUNCH_PAIR_BCS } from "../src/settlement/bridge.js";

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
const PAIR = LAUNCH_PAIR_BCS;
const TIMELOCK = 11n;

// Price case 0 of the fork's golden vectors 3.1.0 (`price_bids.cases[0]`).
const PRICE_AD =
  "0x1761746f6d6963612f74696d656c6f636b2d6269642f76320703000000000000000b000000000000000900000000000000a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a100401e18240a0600";
const PRICE_CT =
  "0x208dcef264334533b6b69c8ac44ea3c890bcbf6c9fb848ef14b7d4a4f8ce06ea1a60832b62d76da4e4631ae4e09c855e366cfc567b188fd9d9a6e37cecb8aba4a1be1ece6887f116d251b8e03d529b64e347175179d4b22b308bf68d25f55d4902cbc7ed233bdac4e382f68c9298c3857bdc84cfcbf5b3e6ae53b65399e484e2e8bd0cf655c85915e1ebb46d9f550d18fdf88fd0f2fc640e799c1e0a71a6404a2c09b64e1714bee040961eb22cf62fbec207223efd804afe43bfca0bb29cfb424d990dd146c93048e3086d78c66cce24be017153a94b9a99f75cbbd791362eaab782e1182f2f879f0a";
const PRICE_PLAINTEXT = "0x40420f0000000000";

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
  stored: { ciphertext: Uint8Array } | null,
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
      case "auction::window_timelock":
        expect(payload.functionArguments).toEqual([WINDOW]);
        return [TIMELOCK.toString()];
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
      case "auction::get_bid_info":
        return [BIDDER, hex(stored!.ciphertext), false, "0", true];
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

describe("sealBid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(config.getExtraAptosClients).mockReturnValue([]);
  });

  it("sealBid builds the golden identity and associated data locally, and the golden key opens the bid", async () => {
    const calls = mockChain(null);
    const sealed = await sealBid(WINDOW, PAIR, BIDDER, 2010n);

    expect(calls).toEqual(
      expect.arrayContaining([
        "auction::window_timelock",
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
    expect(Object.keys(sealed).sort()).toEqual(["ciphertext", "timelockId"]);
  });

  it("sealBid output decrypts with the golden key to exactly 8 bytes, the little-endian price", async () => {
    mockChain(null);
    const price = 7_000_000_000_000n;
    const sealed = await sealBid(WINDOW, PAIR, BIDDER, price);
    // BCS(vk 32, U 96, nonce 12, C 8+16, sig 64), each with a 1-byte length.
    expect(sealed.ciphertext.length).toBe(33 + 97 + 13 + 25 + 65);
    const opened = decryptBid(
      bytes(DK),
      bytes(IDENTITY),
      bytes(AD),
      sealed.ciphertext,
    );
    expect(opened).toHaveLength(8);
    expect(
      new DataView(opened.buffer, opened.byteOffset, 8).getBigUint64(0, true),
    ).toBe(price);
    expect(opened).toEqual(encodeBidPlaintext(price));
  });

  it("the golden price bid of the fork opens to the same 8-byte encoding", () => {
    const opened = decryptBid(
      bytes(DK),
      bytes(IDENTITY),
      bytes(PRICE_AD),
      bytes(PRICE_CT),
    );
    expect(hex(opened)).toBe(PRICE_PLAINTEXT);
    expect(opened).toEqual(encodeBidPlaintext(1_000_000n));
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
    const sealed = await sealBid(WINDOW, PAIR, BIDDER, 42n);
    expect(honest.view).toHaveBeenCalledTimes(1);
    expect(
      decryptBid(bytes(DK), bytes(IDENTITY), bytes(AD), sealed.ciphertext),
    ).toEqual(encodeBidPlaintext(42n));
  });

  it("with no extra endpoint configured, sealBid reads get_mpk once and seals", async () => {
    const calls = mockChain(null);
    const sealed = await sealBid(WINDOW, PAIR, BIDDER, 9n);
    expect(calls.filter((c) => c === "timelock::get_mpk")).toHaveLength(1);
    expect(
      decryptBid(bytes(DK), bytes(IDENTITY), bytes(AD), sealed.ciphertext),
    ).toEqual(encodeBidPlaintext(9n));
  });

  it("draws a fresh ciphertext for every bid", async () => {
    mockChain(null);
    const a = await sealBid(WINDOW, PAIR, BIDDER, 1n);
    const b = await sealBid(WINDOW, PAIR, BIDDER, 1n);
    expect(a.ciphertext).not.toEqual(b.ciphertext);
  });
});

describe("decryptWindowBids", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(config.getExtraAptosClients).mockReturnValue([]);
  });

  it("previews a stored bid's price with get_decryption_key", async () => {
    mockChain(null);
    const sealed = await sealBid(WINDOW, PAIR, BIDDER, 777n);

    const calls = mockChain(sealed);
    const [bid] = await decryptWindowBids(WINDOW, PAIR);
    expect(calls).toContain("timelock::get_decryption_key");
    expect(bid.error).toBeUndefined();
    expect(bid.price).toBe(777n);
    expect(bid.bidder).toBe(BIDDER);
    expect(bid.alreadyOpened).toBe(false);
  });

  it("reports a bid the revealed key cannot open instead of throwing", async () => {
    mockChain(null);
    const sealed = await sealBid(WINDOW, PAIR, BIDDER, 5n);
    mockChain(sealed, OTHER_DK);
    const [bid] = await decryptWindowBids(WINDOW, PAIR);
    expect(bid.price).toBeUndefined();
    expect(bid.error).toBeTruthy();
  });

  it("reports a bid whose plaintext is not 8 bytes", async () => {
    // The fork's golden bid 0 opens to the 21-byte "atomica golden bid v2".
    const golden = encryptBid(
      bytes(MPK),
      bytes(IDENTITY),
      bytes(AD),
      new TextEncoder().encode("atomica golden bid v2"),
    );
    mockChain({ ciphertext: golden });
    const [bid] = await decryptWindowBids(WINDOW, PAIR);
    expect(bid.price).toBeUndefined();
    expect(bid.error).toMatch(/8-byte price/);
  });
});

describe("getBidInfo", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getBidInfo reads the five-field bid view tuple with no commitment", async () => {
    vi.mocked(config.aptos.view).mockResolvedValue([
      BIDDER,
      "0x01",
      true,
      "2010",
      false,
    ] as never);
    const info = await getBidInfo(WINDOW, PAIR, 0n);
    expect(info).toEqual({
      bidder: BIDDER,
      ciphertext: bytes("0x01"),
      opened: true,
      price: 2010n,
      valid: false,
    });

    mockChain({ ciphertext: bytes("0x01") });
    expect((await getBidInfo(WINDOW, PAIR, 0n)).valid).toBe(true);
  });
});
