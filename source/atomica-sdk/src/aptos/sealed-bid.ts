/**
 * V2 sealed bids against the live chain: seal a bid for a window and open a
 * window's bids after the timelock reveal.
 *
 * Sealing reads from chain the window id's timelock (`auction::window_timelock`),
 * the chain id, the timelock epoch (`timelock::get_timelock_epoch`) and its
 * deadline (`timelock::get_deadline`). It builds the timelock identity and the
 * associated data the contract will rebuild at submission itself, and throws
 * unless the node's `timelock::get_timelock_identity` and
 * `auction::bid_associated_data` equal them. It reads the epoch key
 * (`timelock::get_mpk`) from every configured endpoint and throws when two
 * answers differ. It then encrypts the plaintext, the 8-byte little-endian
 * price and nothing else, with the V2 wrapper. No commitment and no salt exist.
 *
 * The chain opens every bid itself: any account calls `auction::open_bids`
 * (see `openBids` in `./payloads.js`). `decryptWindowBids` here is only a
 * read-only preview that decrypts the bids off chain with the revealed key.
 *
 * @see source/state-proofs/typescript/src/ibe/index.ts — the V2 encryptor and decryptor
 * @see source/atomica-move-contracts/sources/auction.move — submit_bid, open_bids
 */
import { decryptBid, encryptBid } from "@atomica/state-proof-verifier/ibe";
import { CONTRACT_ADDR, aptos, getExtraAptosClients } from "./config.js";
import {
  buildBidAd,
  computeTimelockIdentityV2,
  encodeBidPlaintext,
} from "../ibe/bid.js";

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

/**
 * The timelock id of a window id (`auction::window_timelock`). One timelock per
 * window id, shared by every pair, so a bidder can seal before a window of its
 * own pair exists. The view aborts until a `create_auction` of that window id
 * has registered it.
 */
export async function getWindowTimelockId(windowId: bigint): Promise<bigint> {
  const [timelockId] = await view(
    `${CONTRACT_ADDR}::auction::window_timelock`,
    [windowId],
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

/** One stored bid (`auction::get_bid_info`). */
export interface BidInfo {
  bidder: string;
  ciphertext: Uint8Array;
  /** True once `open_bids` passed the bid, whether or not it decrypted. */
  opened: boolean;
  price: bigint;
  /**
   * False once opening judged the bid invalid (a ciphertext that does not
   * decrypt to 8 bytes, a zero price, or collateral below
   * `quote_for_fill(quantity, price)`). An invalid bid never fills and its
   * whole collateral goes back to its depositor. True for an unopened bid.
   */
  valid: boolean;
}

/** Bid `bidIndex` of a window (`auction::get_bid_info`). */
export async function getBidInfo(
  windowId: bigint,
  pairBcs: Uint8Array,
  bidIndex: bigint,
): Promise<BidInfo> {
  const [bidder, ciphertext, opened, price, valid] = await view(
    `${CONTRACT_ADDR}::auction::get_bid_info`,
    [windowId, pairBcs, bidIndex],
  );
  return {
    bidder: String(bidder),
    ciphertext: hexToBytes(ciphertext),
    opened: Boolean(opened),
    price: BigInt(price as string),
    valid: Boolean(valid),
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

/** The epoch a timelock was registered in (`timelock::get_timelock_epoch`). */
export async function getTimelockEpoch(timelockId: bigint): Promise<bigint> {
  const [epoch] = await view(`${CONTRACT_ADDR}::timelock::get_timelock_epoch`, [
    timelockId,
  ]);
  return BigInt(epoch as string);
}

/** The deadline of a timelock, in microseconds (`timelock::get_deadline`). */
export async function getTimelockDeadlineUs(
  timelockId: bigint,
): Promise<bigint> {
  const [deadline] = await view(`${CONTRACT_ADDR}::timelock::get_deadline`, [
    timelockId,
  ]);
  return BigInt(deadline as string);
}

/**
 * The master public key (`timelock::get_mpk`) read from the primary Aptos
 * endpoint and from every extra endpoint of the chain configuration. Throws
 * when two answers differ. With no extra endpoint configured, it returns the
 * primary node's key with no comparison.
 */
export async function getMpkFromAllEndpoints(): Promise<Uint8Array> {
  const payload = {
    function:
      `${CONTRACT_ADDR}::timelock::get_mpk` as `${string}::${string}::${string}`,
    functionArguments: [],
  };
  const clients = [aptos, ...getExtraAptosClients()];
  const keys = await Promise.all(
    clients.map(async (client) => {
      const [mpk] = await client.view({ payload });
      return hexToBytes(mpk);
    }),
  );
  for (let i = 1; i < keys.length; i++) {
    if (!bytesEqual(keys[0], keys[i])) {
      throw new Error(
        `Aptos endpoints disagree on the timelock master public key (primary and extra endpoint ${i}). Refusing to seal the bid.`,
      );
    }
  }
  return keys[0];
}

/** A bid sealed for `submit_bid`. Nothing needs to be kept: the chain opens it. */
export interface SealedBid {
  timelockId: bigint;
  ciphertext: Uint8Array;
}

/**
 * Seal a bid of `price` for `bidder` on window `(windowId, pairBcs)`.
 * `price` is whole USD per whole base token with no decimal shift: callers
 * pass `parsePrice` output. It is encrypted as the 8-byte little-endian `u64`.
 *
 * `bidder` is the Aptos address that will send `submit_bid` (for a SIWE
 * wallet, its derived address). The ciphertext is bound to that sender, the
 * window, the timelock, its epoch and its deadline. The plaintext is the
 * 8-byte little-endian price.
 *
 * The identity and the associated data are built locally from the chain id,
 * the timelock epoch and deadline, the window and the bidder. The call throws
 * without encrypting when the node's identity or associated data differ from
 * them, or when two configured endpoints return different master public keys.
 * A node that lies about the chain id, the epoch or the deadline makes an
 * associated data the chain rejects at `submit_bid`.
 */
export async function sealBid(
  windowId: bigint,
  pairBcs: Uint8Array,
  bidder: string,
  price: bigint,
): Promise<SealedBid> {
  const timelockId = await getWindowTimelockId(windowId);
  const [chainId, epoch, deadlineUs, nodeIdentity, nodeAd, mpk] =
    await Promise.all([
      aptos.getChainId(),
      getTimelockEpoch(timelockId),
      getTimelockDeadlineUs(timelockId),
      getTimelockIdentity(timelockId),
      getBidAssociatedData(timelockId, windowId, bidder),
      getMpkFromAllEndpoints(),
    ]);
  const identity = computeTimelockIdentityV2(
    chainId,
    epoch,
    timelockId,
    deadlineUs,
  );
  const ad = buildBidAd({
    chainId,
    epoch,
    timelockId,
    auctionId: windowId,
    bidder,
    deadlineUs,
  });
  if (!bytesEqual(identity, nodeIdentity)) {
    throw new Error(
      `The Aptos node returned a timelock identity for timelock ${timelockId} that differs from the one built from its chain id, epoch and deadline. Refusing to seal the bid.`,
    );
  }
  if (!bytesEqual(ad, nodeAd)) {
    throw new Error(
      `The Aptos node returned bid associated data for window ${windowId} that differs from the one built locally. Refusing to seal the bid.`,
    );
  }
  const plaintext = encodeBidPlaintext(price);
  return {
    timelockId,
    ciphertext: encryptBid(mpk, identity, ad, plaintext),
  };
}

/** One bid of a window after off-chain decryption (a preview). */
export interface OpenedBid {
  index: number;
  bidder: string;
  /** True when `open_bids` already opened the bid on chain. */
  alreadyOpened: boolean;
  /** The chain's validity flag. False once opening judged the bid invalid. */
  valid: boolean;
  /** Decrypted price. Absent when the bid does not decrypt to 8 bytes. */
  price?: bigint;
  error?: string;
}

/**
 * Decrypt every bid of a window with the revealed key, off chain, as a
 * read-only preview. The chain opens the bids itself with `open_bids`.
 *
 * Reads `timelock::get_decryption_key` (aborts until `Revealed`), then each
 * bid's ciphertext, and opens it with the V2 decryptor. A bid that fails to
 * decrypt, or whose plaintext is not exactly 8 bytes, is reported, not thrown:
 * `open_bids` will mark it invalid.
 */
export async function decryptWindowBids(
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<OpenedBid[]> {
  const timelockId = await getWindowTimelockId(windowId);
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
      valid: info.valid,
    };
    try {
      const plaintext = decryptBid(dk, identity, ad, info.ciphertext);
      if (plaintext.length !== 8) {
        throw new Error("bid plaintext is not an 8-byte price");
      }
      bid.price = new DataView(
        plaintext.buffer,
        plaintext.byteOffset,
        8,
      ).getBigUint64(0, true);
    } catch (e) {
      bid.error = e instanceof Error ? e.message : String(e);
    }
    out.push(bid);
  }
  return out;
}
