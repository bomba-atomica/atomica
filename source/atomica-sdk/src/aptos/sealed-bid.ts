// SCOUT(#228) EDIT: the header below describes the salt and the commitment; rewrite it for the 8-byte price plaintext and on-chain opening.
/**
 * V2 sealed bids against the live chain: seal a bid for a window and open a
 * window's bids after the timelock reveal.
 *
 * Sealing reads from chain the window's timelock (`auction::get_window_status`),
 * the epoch key (`timelock::get_mpk`), the timelock identity
 * (`timelock::get_timelock_identity`) and the associated data the contract will
 * rebuild at submission (`auction::bid_associated_data`). It then encrypts the
 * plaintext `price_le8 || salt32` with the V2 wrapper and commits to the price.
 *
 * Opening reads the revealed key (`timelock::get_decryption_key`) and every bid
 * (`auction::get_bid_info`), decrypts each ciphertext off chain and checks the
 * result against the bid's on-chain commitment.
 *
 * @see source/state-proofs/typescript/src/ibe/index.ts — the V2 encryptor and decryptor
 * @see source/atomica-move-contracts/sources/auction.move — submit_bid, open_bid
 */
import { randomBytes } from "@noble/hashes/utils";
import { decryptBid, encryptBid } from "@atomica/state-proof-verifier/ibe";
import { CONTRACT_ADDR, aptos } from "./config.js";
// SCOUT(#228) EDIT: computeBidCommitment is deleted; only the 8-byte price encoder remains.
import { computeBidCommitment, encodeBidPlaintext } from "../ibe/bid.js";

function hexToBytes(value: unknown): Uint8Array {
  const clean = String(value).replace(/^0x/, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

async function view(
  fn: string,
  functionArguments: Array<bigint | string | Uint8Array>,
) {
  return aptos.view({
    payload: {
      function: fn as `${string}::${string}::${string}`,
      functionArguments,
    },
  });
}

// SCOUT(#243) EDIT: the timelock now belongs to the window id; read the new window_timelock view, or keep get_window_status, which needs an existing (window, pair).
/** The timelock id recorded on a window (`auction::get_window_status`). */
export async function getWindowTimelockId(
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<bigint> {
  const [timelockId] = await view(
    `${CONTRACT_ADDR}::auction::get_window_status`,
    [windowId, pairBcs],
  );
  return BigInt(timelockId as string);
}

/** The 32-byte identity of a registered timelock (`timelock::get_timelock_identity`). */
export async function getTimelockIdentity(
  timelockId: bigint,
): Promise<Uint8Array> {
  const [identity] = await view(
    `${CONTRACT_ADDR}::timelock::get_timelock_identity`,
    [timelockId],
  );
  return hexToBytes(identity);
}

/**
 * The revealed 48-byte decryption key of a timelock
 * (`timelock::get_decryption_key`). The view aborts until the status is `Revealed`.
 */
export async function getDecryptionKey(
  timelockId: bigint,
): Promise<Uint8Array> {
  const [dk] = await view(`${CONTRACT_ADDR}::timelock::get_decryption_key`, [
    timelockId,
  ]);
  return hexToBytes(dk);
}

/**
 * The associated data `submit_bid` builds for `bidder` on this window
 * (`auction::bid_associated_data`).
 */
export async function getBidAssociatedData(
  timelockId: bigint,
  windowId: bigint,
  bidder: string,
): Promise<Uint8Array> {
  const [ad] = await view(`${CONTRACT_ADDR}::auction::bid_associated_data`, [
    timelockId,
    windowId,
    bidder,
  ]);
  return hexToBytes(ad);
}

// SCOUT(#216) EDIT: add the validity flag the bid view returns.
// SCOUT(#228) EDIT: drop commitment.
/** One stored bid (`auction::get_bid_info`). */
export interface BidInfo {
  bidder: string;
  ciphertext: Uint8Array;
  commitment: Uint8Array;
  opened: boolean;
  price: bigint;
}

// SCOUT(#216) EDIT: read the validity element the get_bid_info tuple gains.
// SCOUT(#228) EDIT: the tuple is positional; without commitment, opened and price move up one place.
/** Bid `bidIndex` of a window (`auction::get_bid_info`). */
export async function getBidInfo(
  windowId: bigint,
  pairBcs: Uint8Array,
  bidIndex: bigint,
): Promise<BidInfo> {
  const [bidder, ciphertext, commitment, opened, price] = await view(
    `${CONTRACT_ADDR}::auction::get_bid_info`,
    [windowId, pairBcs, bidIndex],
  );
  return {
    bidder: String(bidder),
    ciphertext: hexToBytes(ciphertext),
    commitment: hexToBytes(commitment),
    opened: Boolean(opened),
    price: BigInt(price as string),
  };
}

/** Number of bids of a window (`auction::get_bid_count`). */
export async function getBidCount(
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<bigint> {
  const [count] = await view(`${CONTRACT_ADDR}::auction::get_bid_count`, [
    windowId,
    pairBcs,
  ]);
  return BigInt(count as string);
}

// SCOUT(#235) ADD: reader for timelock::get_timelock_epoch.
export async function getTimelockEpoch(_timelockId: bigint): Promise<bigint> {
  throw new Error("NOT_IMPLEMENTED: SCOUT(#235) getTimelockEpoch");
}

// SCOUT(#235) ADD: reader for timelock::get_deadline, in microseconds.
export async function getTimelockDeadlineUs(
  _timelockId: bigint,
): Promise<bigint> {
  throw new Error("NOT_IMPLEMENTED: SCOUT(#235) getTimelockDeadlineUs");
}

// SCOUT(#235) ADD: reads timelock::get_mpk from every configured Aptos endpoint and throws when two answers differ.
export async function getMpkFromAllEndpoints(): Promise<Uint8Array> {
  throw new Error("NOT_IMPLEMENTED: SCOUT(#235) getMpkFromAllEndpoints");
}

// SCOUT(#228) EDIT: drop commitment and salt.
/** A bid sealed for `submit_bid`. Keep `salt`: it opens the bid. */
export interface SealedBid {
  timelockId: bigint;
  ciphertext: Uint8Array;
  commitment: Uint8Array;
  salt: Uint8Array;
}

// SCOUT(#235) EDIT: build the identity and the associated data locally, throw when the node's values differ, and compare the master public key across endpoints.
// SCOUT(#228) EDIT: encrypt the 8-byte little-endian price only; no salt parameter and no commitment.
// SCOUT(#217) EDIT: price is whole USD per whole base token; callers pass parsePrice output.
/**
 * Seal a bid of `price` for `bidder` on window `(windowId, pairBcs)`.
 *
 * `bidder` is the Aptos address that will send `submit_bid` (for a SIWE
 * wallet, its derived address). The ciphertext is bound to that sender, the
 * window, the timelock, its epoch and its deadline. A fresh 32-byte salt is
 * drawn unless one is given.
 */
export async function sealBid(
  windowId: bigint,
  pairBcs: Uint8Array,
  bidder: string,
  price: bigint,
  salt: Uint8Array = randomBytes(32),
): Promise<SealedBid> {
  const timelockId = await getWindowTimelockId(windowId, pairBcs);
  const [[mpk], identity, ad] = await Promise.all([
    view(`${CONTRACT_ADDR}::timelock::get_mpk`, []),
    getTimelockIdentity(timelockId),
    getBidAssociatedData(timelockId, windowId, bidder),
  ]);
  const plaintext = encodeBidPlaintext(price, salt);
  return {
    timelockId,
    ciphertext: encryptBid(hexToBytes(mpk), identity, ad, plaintext),
    commitment: computeBidCommitment(price, salt, ad),
    salt,
  };
}

// SCOUT(#228) EDIT: drop salt and matchesCommitment.
/** One bid of a window after off-chain decryption. */
export interface OpenedBid {
  index: number;
  bidder: string;
  /** True when the bid was already opened on chain. */
  alreadyOpened: boolean;
  /** Decrypted price and salt. Absent when the bid did not decrypt. */
  price?: bigint;
  salt?: Uint8Array;
  /** True when `(price, salt)` matches the on-chain commitment, so `open_bid` accepts it. */
  matchesCommitment: boolean;
  error?: string;
}

// SCOUT(#228) EDIT: keep as a read-only preview; expect an 8-byte plaintext and drop the commitment check.
/**
 * Decrypt every bid of a window with the revealed key.
 *
 * Reads `timelock::get_decryption_key` (aborts until `Revealed`), then each
 * bid's ciphertext, and opens it with the V2 decryptor. A bid that fails to
 * decrypt or whose plaintext does not match its commitment is reported, not
 * thrown: only its bidder can open it.
 */
export async function decryptWindowBids(
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<OpenedBid[]> {
  const timelockId = await getWindowTimelockId(windowId, pairBcs);
  const [dk, identity, count] = await Promise.all([
    getDecryptionKey(timelockId),
    getTimelockIdentity(timelockId),
    getBidCount(windowId, pairBcs),
  ]);
  const out: OpenedBid[] = [];
  for (let i = 0; i < Number(count); i++) {
    const info = await getBidInfo(windowId, pairBcs, BigInt(i));
    const ad = await getBidAssociatedData(timelockId, windowId, info.bidder);
    const bid: OpenedBid = {
      index: i,
      bidder: info.bidder,
      alreadyOpened: info.opened,
      matchesCommitment: false,
    };
    try {
      const plaintext = decryptBid(dk, identity, ad, info.ciphertext);
      // SCOUT(#228) EDIT: the plaintext is 8 bytes.
      if (plaintext.length !== 40) {
        throw new Error("bid plaintext is not price_le8 || salt32");
      }
      bid.price = new DataView(
        plaintext.buffer,
        plaintext.byteOffset,
        8,
      ).getBigUint64(0, true);
      bid.salt = plaintext.slice(8);
      bid.matchesCommitment = bytesEqual(
        computeBidCommitment(bid.price, bid.salt, ad),
        info.commitment,
      );
    } catch (e) {
      bid.error = e instanceof Error ? e.message : String(e);
    }
    out.push(bid);
  }
  return out;
}
