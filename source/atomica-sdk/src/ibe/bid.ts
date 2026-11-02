import { sha3_256 } from "@noble/hashes/sha3";

/** Domain tag of the V2 bid associated data (spec section 6). */
export const BID_AD_TAG = "atomica/timelock-bid/v2";

/** Domain tag of the V2 timelock identity (`ibe_config::compute_identity`). */
export const TIMELOCK_IDENTITY_TAG = "ATOMICA_TIMELOCK_IBE_V2_ID";

/** Domain tag of the price commitment (`auction::compute_bid_commitment`). */
export const BID_COMMIT_TAG = "atomica/bid-commitment/v1";

const enc = new TextEncoder();

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function u8(v: number): Uint8Array {
  return new Uint8Array([v & 0xff]);
}

function u64le(v: bigint): Uint8Array {
  if (v < 0n || v > 0xffff_ffff_ffff_ffffn) {
    throw new RangeError("u64 out of range");
  }
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, v, true);
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

function addressBytes(address: string | Uint8Array): Uint8Array {
  if (typeof address !== "string") {
    if (address.length !== 32) throw new Error("address must be 32 bytes");
    return address;
  }
  const clean = address.replace(/^0x/, "").padStart(64, "0");
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) throw new Error("invalid address");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * V2 timelock identity. Matches `ibe_config::compute_identity` in Move:
 *   SHA3-256( "ATOMICA_TIMELOCK_IBE_V2_ID" || BCS(chain: u8) || BCS(epoch: u64)
 *             || BCS(timelock_id: u64) || BCS(deadline_us: u64) )
 */
export function computeTimelockIdentityV2(
  chainId: number,
  epoch: bigint,
  timelockId: bigint,
  deadlineUs: bigint,
): Uint8Array {
  return sha3_256(
    concat(
      enc.encode(TIMELOCK_IDENTITY_TAG),
      u8(chainId),
      u64le(epoch),
      u64le(timelockId),
      u64le(deadlineUs),
    ),
  );
}

export interface BidAdFields {
  chainId: number;
  epoch: bigint;
  timelockId: bigint;
  /** The auction window id. */
  auctionId: bigint;
  /** 32-byte address, hex or bytes. */
  bidder: string | Uint8Array;
  deadlineUs: bigint;
}

/**
 * Associated data of a V2 bid. Matches `auction::bid_associated_data` in Move:
 *   BCS( tag, chain_id, epoch, timelock_id, auction_id, bidder, deadline_us )
 *
 * The contract builds this on chain. A client builds the same bytes to encrypt
 * the bid, so a wrong field makes `ibe::verify_bid_ct` reject the bid.
 */
export function buildBidAd(f: BidAdFields): Uint8Array {
  return concat(
    bcsBytes(enc.encode(BID_AD_TAG)),
    u8(f.chainId),
    u64le(f.epoch),
    u64le(f.timelockId),
    u64le(f.auctionId),
    addressBytes(f.bidder),
    u64le(f.deadlineUs),
  );
}

/**
 * Bid plaintext convention: `price_le8 || salt32`. The relayer that decrypts a
 * bid with the revealed key reads the price and salt from it.
 */
export function encodeBidPlaintext(
  price: bigint,
  salt: Uint8Array,
): Uint8Array {
  if (salt.length !== 32) throw new Error("salt must be 32 bytes");
  return concat(u64le(price), salt);
}

/**
 * Price commitment. Matches `auction::compute_bid_commitment` in Move:
 *   SHA3-256( tag || BCS(price: u64) || salt || SHA3-256(ad) )
 */
export function computeBidCommitment(
  price: bigint,
  salt: Uint8Array,
  ad: Uint8Array,
): Uint8Array {
  if (salt.length !== 32) throw new Error("salt must be 32 bytes");
  return sha3_256(
    concat(enc.encode(BID_COMMIT_TAG), u64le(price), salt, sha3_256(ad)),
  );
}
