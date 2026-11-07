/**
 * V2 timelock bid encryption: Boneh-Franklin KEM on BLS12-381, HKDF-SHA256, AES-128-GCM and a
 * one-time Ed25519 signature.
 *
 * TypeScript port of the fork's Rust reference `crates/aptos-dkg/src/ibe/ciphertext.rs` and
 * `crates/aptos-dkg/src/ibe/mod.rs` in `bomba-atomica/atomica-aptos` (commit `2c32b09d95`).
 * Spec: sections 5 and 6 of `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md` in the fork.
 *
 * ```text
 * (sk, vk) = fresh Ed25519 key pair      r = fresh scalar      U = g2^r      K = e(r * H1(id), mpk)
 * key = HKDF-SHA256(salt, K || U || id || vk || SHA3-256(AD))[0..16]
 * C   = AES-128-GCM(key, nonce, m, aad = AD)
 * sig = Ed25519.sign(sk, BCS(U, nonce, C, AD))
 * ct  = BCS(vk, U, nonce, C, sig)
 * ```
 *
 * - `mpk` is the epoch master public key (96-byte compressed G2), `timelock::get_mpk` on chain.
 * - `id` is the 32-byte timelock identity, `timelock::get_timelock_identity` on chain.
 * - `dk` is the revealed key (48-byte compressed G1), `timelock::get_decryption_key` on chain.
 *   Decapsulation is `K = e(dk, U)`.
 * - `AD` is the associated data the contract builds (`auction::bid_associated_data`). It is not
 *   part of the wire format.
 *
 * `K` enters the KDF in the arkworks compressed `Fq12` layout: twelve 48-byte little-endian base
 * field elements, in the order c0.c0.c0, c0.c0.c1, c0.c1.c0, ..., c1.c2.c1.
 *
 * The golden vectors `tests/fixtures/ibe_v2_golden_vectors.json` (copied from the fork) pin
 * every byte of this port.
 */
import { bls12_381 } from "@noble/curves/bls12-381";
import { ed25519 } from "@noble/curves/ed25519";
import { bytesToNumberLE, numberToBytesLE } from "@noble/curves/abstract/utils";
import { gcm } from "@noble/ciphers/aes";
import { hkdf } from "@noble/hashes/hkdf";
import { sha256 } from "@noble/hashes/sha256";
import { sha3_256 } from "@noble/hashes/sha3";
import { randomBytes } from "@noble/hashes/utils";

/** Compressed G1 length (decryption keys). */
export const G1_COMPRESSED_LEN = 48;
/** Compressed G2 length (`mpk`, `U`). */
export const G2_COMPRESSED_LEN = 96;
/** Identity length in bytes. */
export const IDENTITY_LEN = 32;
/** Ed25519 verifying key length. */
export const VK_LEN = 32;
/** AES-GCM nonce length. */
export const NONCE_LEN = 12;
/** AES-GCM tag length. A body shorter than this cannot be valid. */
export const TAG_LEN = 16;
/** Ed25519 signature length. */
export const SIG_LEN = 64;
/** Upper bound on a serialized ciphertext accepted by {@link parseBidCiphertext}. */
export const MAX_CIPHERTEXT_BYTES = 1 << 20;

const enc = new TextEncoder();
/** RFC 9380 domain separation tag of `H1` (`BLS12381G1_XMD:SHA-256_SSWU_RO_`). */
export const IBE_H1_DST = "ATOMICA_TIMELOCK_IBE_V2_H1";
const IBE_KDF_SALT = enc.encode("ATOMICA_TIMELOCK_IBE_V2_KDF");
const KDF_INFO = enc.encode("ATOMICA_TIMELOCK_BID_V2_AES128GCM");

const G1 = bls12_381.G1.Point;
const G2 = bls12_381.G2.Point;
type G1Point = InstanceType<typeof G1>;
type G2Point = InstanceType<typeof G2>;
const FR_ORDER = bls12_381.params.r;

/** A parsed V2 bid ciphertext. */
export interface BidCiphertext {
    /** One-time Ed25519 verifying key. */
    vk: Uint8Array;
    /** KEM element `U = g2^r`, compressed G2. */
    u: Uint8Array;
    /** AES-GCM nonce. */
    nonce: Uint8Array;
    /** AES-GCM ciphertext with tag. */
    c: Uint8Array;
    /** Signature over `BCS(U, nonce, C, AD)`. */
    sig: Uint8Array;
}

/** Source of random bytes. Called for 32 (signing key), 64 (scalar) then 12 (nonce) bytes. */
export type RandomSource = (length: number) => Uint8Array;

function concat(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let off = 0;
    for (const p of parts) {
        out.set(p, off);
        off += p.length;
    }
    return out;
}

/** BCS of a byte vector: ULEB128 length then the bytes. */
function bcsBytes(b: Uint8Array): Uint8Array {
    const len: number[] = [];
    let n = b.length;
    do {
        let byte = n & 0x7f;
        n >>>= 7;
        if (n > 0) byte |= 0x80;
        len.push(byte);
    } while (n > 0);
    return concat(new Uint8Array(len), b);
}

/** Reads one BCS byte vector at `off`. Rejects non-canonical ULEB128 and lengths over u32. */
function readBcsBytes(bytes: Uint8Array, off: number): [Uint8Array, number] {
    let len = 0;
    let shift = 0;
    for (;;) {
        if (off >= bytes.length) throw new Error("malformed ciphertext: truncated length");
        const byte = bytes[off++];
        const digit = byte & 0x7f;
        if (shift === 28 && digit > 0x0f) throw new Error("malformed ciphertext: length overflow");
        len += digit * 2 ** shift;
        if ((byte & 0x80) === 0) {
            if (shift > 0 && digit === 0) {
                throw new Error("malformed ciphertext: non-canonical length");
            }
            break;
        }
        shift += 7;
        if (shift > 28) throw new Error("malformed ciphertext: length overflow");
    }
    if (off + len > bytes.length) throw new Error("malformed ciphertext: truncated body");
    return [bytes.slice(off, off + len), off + len];
}

function fixed(what: string, v: Uint8Array, n: number): Uint8Array {
    if (v.length !== n) {
        throw new Error(`invalid ${what} length: expected ${n}, got ${v.length}`);
    }
    return v;
}

/**
 * Validated decode of a compressed G1 point: exact length, on curve, prime-order subgroup, not
 * the identity.
 */
export function decodeG1(bytes: Uint8Array): G1Point {
    fixed("g1", bytes, G1_COMPRESSED_LEN);
    const p = G1.fromHex(bytes);
    p.assertValidity();
    if (p.equals(G1.ZERO)) throw new Error("g1 is the identity");
    return p;
}

/** Validated decode of a compressed G2 point. Same checks as {@link decodeG1}. */
export function decodeG2(bytes: Uint8Array): G2Point {
    fixed("g2", bytes, G2_COMPRESSED_LEN);
    const p = G2.fromHex(bytes);
    p.assertValidity();
    if (p.equals(G2.ZERO)) throw new Error("g2 is the identity");
    return p;
}

/** `H1`: hashes identity bytes to G1 (RFC 9380 SSWU, random oracle variant). */
export function hashToG1(identity: Uint8Array): G1Point {
    return G1.fromAffine(bls12_381.G1.hashToCurve(identity, { DST: IBE_H1_DST }).toAffine());
}

/** Samples a nonzero scalar from 64 uniform bytes, little endian, reduced mod r. */
function randomScalar(rng: RandomSource): bigint {
    for (;;) {
        const s = bytesToNumberLE(rng(64)) % FR_ORDER;
        if (s !== 0n) return s;
    }
}

/** Serializes a pairing output like arkworks `serialize_compressed` of `Fq12`. */
function gtBytes(k: ReturnType<typeof bls12_381.pairing>): Uint8Array {
    const parts: Uint8Array[] = [];
    for (const c6 of [k.c0, k.c1]) {
        for (const c2 of [c6.c0, c6.c1, c6.c2]) {
            parts.push(numberToBytesLE(c2.c0, 48), numberToBytesLE(c2.c1, 48));
        }
    }
    return concat(...parts);
}

function deriveAeadKey(
    k: ReturnType<typeof bls12_381.pairing>,
    u: Uint8Array,
    identity: Uint8Array,
    vk: Uint8Array,
    ad: Uint8Array,
): Uint8Array {
    const ikm = concat(gtBytes(k), u, identity, vk, sha3_256(ad));
    return hkdf(sha256, ikm, IBE_KDF_SALT, KDF_INFO, 16);
}

function signedMessage(ct: BidCiphertext, ad: Uint8Array): Uint8Array {
    return concat(bcsBytes(ct.u), bcsBytes(ct.nonce), bcsBytes(ct.c), bcsBytes(ad));
}

/** Serializes to the wire format `BCS(vk, U, nonce, C, sig)`. */
export function serializeBidCiphertext(ct: BidCiphertext): Uint8Array {
    return concat(
        bcsBytes(ct.vk),
        bcsBytes(ct.u),
        bcsBytes(ct.nonce),
        bcsBytes(ct.c),
        bcsBytes(ct.sig),
    );
}

/** Parses the wire format. Checks every length. Does not check the group element. */
export function parseBidCiphertext(bytes: Uint8Array): BidCiphertext {
    if (bytes.length > MAX_CIPHERTEXT_BYTES) throw new Error("ciphertext too large");
    const fields: Uint8Array[] = [];
    let off = 0;
    for (let i = 0; i < 5; i++) {
        const [field, next] = readBcsBytes(bytes, off);
        fields.push(field);
        off = next;
    }
    if (off !== bytes.length) throw new Error("malformed ciphertext: trailing bytes");
    const [vk, u, nonce, c, sig] = fields;
    if (c.length < TAG_LEN) throw new Error("malformed ciphertext: body shorter than the tag");
    return {
        vk: fixed("vk", vk, VK_LEN),
        u: fixed("u", u, G2_COMPRESSED_LEN),
        nonce: fixed("nonce", nonce, NONCE_LEN),
        c,
        sig: fixed("sig", sig, SIG_LEN),
    };
}

/**
 * Submission check (`ibe::verify_bid_ct`): `U` is a valid prime-order non-identity G2 point and
 * the one-time signature over `BCS(U, nonce, C, AD)` verifies for `vk`.
 *
 * Uses strict Ed25519 (canonical encodings, no ZIP-215) and rejects a small-order key or `R`,
 * like `ed25519-dalek` `verify_strict`. Throws on failure.
 */
export function verifyBidCiphertext(ct: BidCiphertext, ad: Uint8Array): void {
    decodeG2(ct.u);
    const A = ed25519.Point.fromHex(ct.vk, false);
    const R = ed25519.Point.fromHex(ct.sig.slice(0, 32), false);
    if (A.isSmallOrder() || R.isSmallOrder()) throw new Error("bad signature: small order");
    if (!ed25519.verify(ct.sig, signedMessage(ct, ad), ct.vk, { zip215: false })) {
        throw new Error("bad signature");
    }
}

/**
 * Encrypts a bid to `identity` under `mpk` and returns the wire bytes `BCS(vk, U, nonce, C, sig)`.
 *
 * @param mpk       epoch master public key, 96-byte compressed G2 (`timelock::get_mpk`)
 * @param identity  32-byte timelock identity (`timelock::get_timelock_identity`)
 * @param ad        associated data built by the contract (`auction::bid_associated_data`)
 * @param plaintext bid plaintext (`price_le8 || salt32` for an auction bid)
 * @param rng       random bytes. Defaults to the platform CSPRNG. Tests pass a seeded stream.
 */
export function encryptBid(
    mpk: Uint8Array,
    identity: Uint8Array,
    ad: Uint8Array,
    plaintext: Uint8Array,
    rng: RandomSource = randomBytes,
): Uint8Array {
    const mpkPoint = decodeG2(mpk);
    fixed("identity", identity, IDENTITY_LEN);

    const sk = rng(32);
    const vk = ed25519.getPublicKey(sk);

    const r = randomScalar(rng);
    const q = hashToG1(identity);
    const u = G2.BASE.multiply(r).toBytes(true);
    const k = bls12_381.pairing(q.multiply(r), mpkPoint);
    const key = deriveAeadKey(k, u, identity, vk, ad);

    const nonce = rng(NONCE_LEN);
    const c = gcm(key, nonce, ad).encrypt(plaintext);

    const ct: BidCiphertext = { vk, u, nonce, c, sig: new Uint8Array(SIG_LEN) };
    ct.sig = ed25519.sign(signedMessage(ct, ad), sk);
    sk.fill(0);
    return serializeBidCiphertext(ct);
}

/**
 * Opens a bid with the revealed key `dk` (`timelock::get_decryption_key`).
 *
 * Parses and checks the submission conditions first ({@link verifyBidCiphertext}), then
 * decapsulates and decrypts. Throws on any failure.
 */
export function decryptBid(
    dk: Uint8Array,
    identity: Uint8Array,
    ad: Uint8Array,
    ciphertext: Uint8Array,
): Uint8Array {
    const dkPoint = decodeG1(dk);
    fixed("identity", identity, IDENTITY_LEN);
    const ct = parseBidCiphertext(ciphertext);
    verifyBidCiphertext(ct, ad);
    const k = bls12_381.pairing(dkPoint, decodeG2(ct.u));
    const key = deriveAeadKey(k, ct.u, identity, ct.vk, ad);
    return gcm(key, ct.nonce, ad).decrypt(ct.c);
}
