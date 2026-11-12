// SCOUT(#228) EDIT: copy fixtures/ibe_v2_golden_vectors.json again from the fork commit of the new framework pin (it gains the price bid cases of the decrypt native issue (227)), and fix the commit named in the header below.
/**
 * V2 timelock bid encryption: golden-vector parity with the fork's Rust reference.
 *
 * Replaces the retired G1 Boneh-Franklin tests. The vectors in
 * `fixtures/ibe_v2_golden_vectors.json` are a byte copy of
 * `atomica/golden_vectors/ibe_v2_golden_vectors.json` in `bomba-atomica/atomica-aptos` at
 * commit `2c32b09d95` (the pinned framework). They come from
 * `cargo test -p aptos-dkg --lib ibe::golden_vectors::write_golden_vectors -- --ignored`.
 *
 * The valid golden bid was made by `encrypt_bid` with `StdRng::seed_from_u64(seed ^ 0xB1D)` from
 * `rand` 0.7.3. That generator is ChaCha20 keyed by a PCG32 expansion of the u64 seed, so
 * {@link stdRng} below reproduces its byte stream and the encryptor must rebuild the golden bid
 * byte for byte.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { chacha20 } from "@noble/ciphers/chacha";
import { bls12_381 } from "@noble/curves/bls12-381";
import { bytesToNumberLE } from "@noble/curves/abstract/utils";
import {
    decodeG1,
    decodeG2,
    decryptBid,
    encryptBid,
    hashToG1,
    parseBidCiphertext,
    serializeBidCiphertext,
    verifyBidCiphertext,
} from "../src/ibe";

interface BidCase {
    name: string;
    ct: string;
    ad: string;
    verifies: boolean;
    opens_with: "dk" | "other";
    opens: boolean;
    plaintext: string | null;
}

const vectors = JSON.parse(
    readFileSync(join(__dirname, "fixtures", "ibe_v2_golden_vectors.json"), "utf8"),
);
const dealing = vectors.dealing;
const bids: { plaintext: string; ad: string; cases: BidCase[] } = vectors.bids;

function hex(b: Uint8Array): string {
    return Buffer.from(b).toString("hex");
}

function unhex(h: string): Uint8Array {
    return new Uint8Array(Buffer.from(h, "hex"));
}

/**
 * Byte stream of `rand` 0.7.3 `StdRng::seed_from_u64(seed)` (rand_core 0.5.1, rand_chacha 0.2.2).
 *
 * The seed is filled 4 bytes at a time by PCG32 (`state = state * MUL + INC`, XSH-RR output).
 * The generator is ChaCha20 with that key, a 64-bit block counter from 0 and a zero stream id,
 * which for the first 2^32 blocks equals IETF ChaCha20 with a zero nonce. `fill_bytes` hands out
 * the keystream in order while every request is a multiple of 4 bytes, as here (32, 64, 12).
 */
function stdRng(seed: bigint): (n: number) => Uint8Array {
    const MASK = (1n << 64n) - 1n;
    const MUL = 6364136223846793005n;
    const INC = 11634580027462260723n;
    let state = seed & MASK;
    const key = new Uint8Array(32);
    const view = new DataView(key.buffer);
    for (let i = 0; i < 8; i++) {
        state = (state * MUL + INC) & MASK;
        const xorshifted = Number((((state >> 18n) ^ state) >> 27n) & 0xffffffffn);
        const rot = Number(state >> 59n);
        view.setUint32(i * 4, ((xorshifted >>> rot) | (xorshifted << (32 - rot))) >>> 0, true);
    }
    const stream = chacha20(key, new Uint8Array(12), new Uint8Array(4096));
    let off = 0;
    return (n: number) => {
        if (n % 4 !== 0) throw new Error("the replica only models 4-byte aligned requests");
        const out = stream.slice(off, off + n);
        off += n;
        return out;
    };
}

describe("V2 identity and H1", () => {
    it("hashes every identity vector to the golden H1 point", () => {
        for (const v of vectors.identity_vectors) {
            expect(hex(hashToG1(unhex(v.identity)).toBytes(true)), v.name).toBe(v.h1);
        }
        for (const v of vectors.cross_library_vectors) {
            expect(hex(hashToG1(unhex(v.identity)).toBytes(true))).toBe(v.h1);
        }
        expect(hex(hashToG1(unhex(dealing.identity)).toBytes(true))).toBe(dealing.h1);
    });

    it("rebuilds mpk, U and dk of the cross-library vectors from their scalars", () => {
        const G2 = bls12_381.G2.Point;
        for (const v of vectors.cross_library_vectors) {
            const s = bytesToNumberLE(unhex(v.secret_le));
            const r = bytesToNumberLE(unhex(v.r_le));
            expect(hex(G2.BASE.multiply(s).toBytes(true))).toBe(v.mpk);
            expect(hex(G2.BASE.multiply(r).toBytes(true))).toBe(v.u);
            expect(hex(hashToG1(unhex(v.identity)).multiply(s).toBytes(true))).toBe(v.dk);
        }
    });

    it("decodes the dealing mpk and dk and they satisfy e(dk, g2) = e(H1(id), mpk)", () => {
        const mpk = decodeG2(unhex(dealing.mpk));
        const dk = decodeG1(unhex(dealing.dk));
        const lhs = bls12_381.pairing(dk, bls12_381.G2.Point.BASE);
        const rhs = bls12_381.pairing(hashToG1(unhex(dealing.identity)), mpk);
        expect(bls12_381.fields.Fp12.eql(lhs, rhs)).toBe(true);
    });

    it("decodes the golden shares and rejects every invalid share encoding", () => {
        for (const c of dealing.share_cases) {
            const decodeAll = () => c.shares.forEach((s: string) => decodeG1(unhex(s)));
            if (c.expect.startsWith("invalid_share")) {
                expect(decodeAll, c.name).toThrow();
            } else if (c.expect === "ok") {
                expect(decodeAll, c.name).not.toThrow();
            }
        }
    });
});

describe("V2 bid encrypt (client) against the golden bid", () => {
    const mpk = unhex(dealing.mpk);
    const identity = unhex(dealing.identity);
    const ad = unhex(bids.ad);
    const plaintext = unhex(bids.plaintext);
    const golden = bids.cases.find((c) => c.name === "valid")!;

    it("client encrypt matches the golden vector bid byte for byte", () => {
        const rng = stdRng(BigInt(dealing.seed) ^ 0xb1dn);
        const ct = encryptBid(mpk, identity, ad, plaintext, rng);
        expect(hex(ct)).toBe(golden.ct);
    });

    it("round-trips a fresh random bid with the golden dk", () => {
        const ct = encryptBid(mpk, identity, ad, plaintext);
        expect(hex(ct)).not.toBe(golden.ct);
        expect(decryptBid(unhex(dealing.dk), identity, ad, ct)).toEqual(plaintext);
        expect(() => decryptBid(unhex(dealing.other_dk), identity, ad, ct)).toThrow();
    });

    it("rejects an mpk that is not a valid G2 point", () => {
        expect(() => encryptBid(mpk.slice(1), identity, ad, plaintext)).toThrow();
        const bad = mpk.slice();
        bad[5] ^= 1;
        expect(() => encryptBid(bad, identity, ad, plaintext)).toThrow();
    });

    it("serializes a parsed golden bid back to the same bytes", () => {
        const wire = unhex(golden.ct);
        expect(hex(serializeBidCiphertext(parseBidCiphertext(wire)))).toBe(golden.ct);
    });
});

describe("V2 bid decrypt with the golden dk", () => {
    const identity = unhex(dealing.identity);
    const keys = { dk: unhex(dealing.dk), other: unhex(dealing.other_dk) };

    it("decrypt with the golden vector dk recovers the golden bid", () => {
        const golden = bids.cases.find((c) => c.name === "valid")!;
        const opened = decryptBid(keys.dk, identity, unhex(golden.ad), unhex(golden.ct));
        expect(hex(opened)).toBe(bids.plaintext);
        expect(new TextDecoder().decode(opened)).toBe("atomica golden bid v2");
    });

    for (const c of bids.cases) {
        it(`case "${c.name}": verifies=${c.verifies} opens=${c.opens}`, () => {
            const ct = unhex(c.ct);
            const ad = unhex(c.ad);
            let verifies = true;
            try {
                verifyBidCiphertext(parseBidCiphertext(ct), ad);
            } catch {
                verifies = false;
            }
            expect(verifies).toBe(c.verifies);

            let opened: Uint8Array | null = null;
            try {
                opened = decryptBid(keys[c.opens_with], identity, ad, ct);
            } catch {
                opened = null;
            }
            expect(opened !== null).toBe(c.opens);
            if (c.opens) expect(hex(opened!)).toBe(c.plaintext);
        });
    }
});
