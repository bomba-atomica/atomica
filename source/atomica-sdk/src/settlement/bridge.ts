/**
 * bridge.ts — Aptos auction reads for the settlement path
 *
 * Read-only helpers over Aptos auction state and module events: the
 * `AuctionSettled` and `AuctionRefunded` scans, lock receipts, bid results and
 * `quoteForFill`. Nothing here signs or releases anything.
 *
 * Release rule: a LockBox lock leaves only by `releaseByOutcome` under a
 * validator-signed Aptos `AuctionOutcome` that any wallet carries
 * (./outcome-carrier.ts), or by `reclaim` to its depositor after its
 * deadline. There is no relayer and no settlement authority
 * (docs/decisions/trustless-v0-1-unwinding.md).
 *
 * @see docs/architecture/v0-architecture.md §3 — Cross-Chain Settlement
 * @see source/evm-contracts/src/escrow/LockBox.sol
 */

import { ethers } from "ethers";
import type { Aptos } from "@aptos-labs/ts-sdk";

// ============================================================
// Types
// ============================================================

/**
 * Mirrors the on-chain `auction::Pair` struct.
 * @see docs/architecture/v0-architecture.md §2.4
 */
export interface Pair {
  baseChain: string; // e.g. "ethereum"
  baseToken: string; // e.g. "FakeETH"
  quoteChain: string; // e.g. "ethereum"
  quoteToken: string; // e.g. "FakeUSD"
}

/**
 * Mirrors the on-chain `auction::AuctionSettled` event.
 * @see docs/architecture/v0-architecture.md §2.9
 * Implemented in auction.move as `AuctionSettled` (Phase 3a #86).
 */
export interface AuctionSettledEvent {
  windowId: bigint;
  pair: Pair;
  clearingPrice: bigint;
  totalFilled: bigint; // wei of base token transferred to winners
  winnerCount: bigint;
  lockIds: Uint8Array[]; // seller receipt IDs consumed
  /** Window key pair bytes. Absent only in events of older contracts. */
  pairBcs?: Uint8Array;
}

// ============================================================
// Configuration for bridge functions
// ============================================================

/** Aptos node and package the read helpers query. */
export interface BridgeConfig {
  /** Aptos fullnode RPC URL */
  aptosRpcUrl: string;
  /** Deployed Atomica Move package address on Aptos */
  contractAddress: string;
}

// ============================================================
// Helpers
// ============================================================

/**
 * BCS-encode a Pair struct as Move BCS: each field is a `vector<u8>`, a
 * ULEB128 length followed by the UTF-8 bytes, in field order (base_chain,
 * base_token, quote_chain, quote_token). This is the `pair_bcs` argument of
 * the auction entry and view functions.
 *
 * @param pair Trading pair descriptor
 * @returns Uint8Array containing the BCS-encoded pair
 */
export function bcsEncodePair(pair: Pair): Uint8Array {
  function encodeString(s: string): Uint8Array {
    const utf8 = new TextEncoder().encode(s);
    const len: number[] = [];
    let n = utf8.length;
    do {
      let byte = n & 0x7f;
      n >>>= 7;
      if (n !== 0) byte |= 0x80;
      len.push(byte);
    } while (n !== 0);
    const buf = new Uint8Array(len.length + utf8.length);
    buf.set(len, 0);
    buf.set(utf8, len.length);
    return buf;
  }

  const parts = [
    encodeString(pair.baseChain),
    encodeString(pair.baseToken),
    encodeString(pair.quoteChain),
    encodeString(pair.quoteToken),
  ];

  const total = parts.reduce((acc, p) => acc + p.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

/**
 * The launch pair: FakeETH against FakeUSD, both locked on Ethereum. The
 * auction package seeds its pair allowlist with it at publish.
 * @see docs/architecture/v0-architecture.md §2.4
 */
export const LAUNCH_PAIR: Pair = {
  baseChain: "ethereum",
  baseToken: "FakeETH",
  quoteChain: "ethereum",
  quoteToken: "FakeUSD",
};

/**
 * Move BCS of {@link LAUNCH_PAIR}: the default `pair_bcs` of every client and
 * the bytes Ethereum locks are bound to. It equals the on-chain view
 * `auction::launch_pair_bcs()`.
 */
export const LAUNCH_PAIR_BCS: Uint8Array = bcsEncodePair(LAUNCH_PAIR);

/**
 * Parse a raw Aptos event JSON object into an AuctionSettledEvent.
 *
 * Aptos event data fields use snake_case; this function maps them to
 * the camelCase TypeScript interface.
 */
/**
 * Decode a Move `vector<u8>` string field. Aptos REST renders it as 0x hex;
 * plain strings pass through.
 */
function moveString(v: unknown): string {
  const str = String(v);
  if (!/^0x([0-9a-f]{2})*$/i.test(str)) return str;
  return ethers.toUtf8String(str);
}

function parseAuctionSettledEvent(
  raw: Record<string, unknown>,
): AuctionSettledEvent {
  const data = raw["data"] as Record<string, unknown>;

  // Parse pair sub-struct
  const rawPair = data["pair"] as Record<string, unknown>;
  const pair: Pair = {
    baseChain: moveString(rawPair["base_chain"]),
    baseToken: moveString(rawPair["base_token"]),
    quoteChain: moveString(rawPair["quote_chain"]),
    quoteToken: moveString(rawPair["quote_token"]),
  };

  // lock_ids is vector<vector<u8>> — each inner element is a hex string on Aptos
  const rawLockIds = (data["lock_ids"] as string[]) ?? [];
  const lockIds: Uint8Array[] = rawLockIds.map((hexStr) => {
    const clean = hexStr.replace(/^0x/, "");
    const bytes = new Uint8Array(clean.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  });

  return {
    windowId: BigInt(String(data["window_id"])),
    pair,
    clearingPrice: BigInt(String(data["clearing_price"])),
    totalFilled: BigInt(String(data["total_filled"])),
    winnerCount: BigInt(String(data["winner_count"])),
    lockIds,
    ...(data["pair_bcs"] !== undefined
      ? { pairBcs: hexToBytes(String(data["pair_bcs"])) }
      : {}),
  };
}

/** Decode a Move `vector<u8>` returned as a 0x-prefixed hex string. */
function hexToBytes(hexStr: string): Uint8Array {
  return ethers.getBytes(hexStr.startsWith("0x") ? hexStr : `0x${hexStr}`);
}

/**
 * Mirrors the on-chain `auction::AuctionRefunded` event. The window was
 * refunded because its timelock expired.
 */
export interface AuctionRefundedEvent {
  windowId: bigint;
  /** The window key's pair bytes (`pair_bcs` passed to `create_auction`). */
  pairBcs: Uint8Array;
  timelockId: bigint;
  /** 1 epoch-ended, 2 reveal-window-elapsed, 3 key-check-failed. */
  reason: number;
  bidCount: bigint;
  sellerLockCount: bigint;
}

function parseAuctionRefundedEvent(
  raw: Record<string, unknown>,
): AuctionRefundedEvent {
  const data = raw["data"] as Record<string, unknown>;
  return {
    windowId: BigInt(String(data["window_id"])),
    pairBcs: hexToBytes(String(data["pair_bcs"] ?? "0x")),
    timelockId: BigInt(String(data["timelock_id"])),
    reason: Number(data["reason"]),
    bidCount: BigInt(String(data["bid_count"])),
    sellerLockCount: BigInt(String(data["seller_lock_count"])),
  };
}

// ============================================================
// Errors
// ============================================================

/**
 * Thrown when an aptos-node (>= 1.49) REST read returns 410 Gone because the
 * data has been pruned. Terminal: callers must not retry the same read.
 */
export class AptosPrunedReadError extends Error {
  readonly status = 410;
  constructor(readonly url: string) {
    super(`Aptos node returned 410 (data pruned) for ${url}`);
    this.name = "AptosPrunedReadError";
  }
}

// ============================================================
// Functions
// ============================================================

/** A decoded AuctionSettled event with the ledger version that emitted it. */
export interface VersionedAuctionSettledEvent {
  event: AuctionSettledEvent;
  /** Ledger version of the transaction that emitted the event. */
  version: bigint;
}

/** Result of one transaction scan. */
export interface AuctionSettledScan {
  events: VersionedAuctionSettledEvent[];
  /**
   * Version to pass as `fromVersion` on the next scan. Every transaction
   * below it has been inspected. Persist it as the scan checkpoint.
   */
  nextVersion: bigint;
}

export interface ScanOptions {
  /** First ledger version to inspect (default 0). */
  fromVersion?: bigint;
  /** Transactions per page (default 100, the node's default maximum). */
  pageSize?: number;
  /** Safety cap on pages per call (default 50). The next call resumes. */
  maxPages?: number;
}

/** Lower-case a Move type tag and drop leading zeros of its address part. */
function normalizeTypeTag(tag: string): string {
  return tag.toLowerCase().replace(/^0x0*/, "0x");
}

function aptosBaseUrl(config: BridgeConfig): string {
  // `aptosRpcUrl` conventionally already ends in `/v1`, so strip it before
  // appending the versioned path.
  return config.aptosRpcUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
}

/** One Aptos auction outcome event, tagged by its Move name. */
export type AuctionOutcomeEvent =
  | { kind: "AuctionSettled"; event: AuctionSettledEvent; version: bigint }
  | { kind: "AuctionRefunded"; event: AuctionRefundedEvent; version: bigint };

/** Result of one outcome scan. Events keep ledger order. */
export interface AuctionOutcomeScan {
  events: AuctionOutcomeEvent[];
  /** Version to pass as `fromVersion` on the next scan. */
  nextVersion: bigint;
}

/**
 * Scan committed transactions for the auction outcome module events
 * `AuctionSettled` and `AuctionRefunded`. The `AuctionOutcome` event that
 * LockBox verifies is found by ./outcome-carrier.ts.
 *
 * Module events (`#[event]`) are not served by event handle on aptos-node
 * 1.49.6 REST, so this walks
 *   GET /v1/transactions?start={version}&limit={pageSize}
 * from `fromVersion` toward the ledger head and keeps events whose type is
 * `{contractAddress}::auction::<Name>`. It stops at the head (a short page)
 * or after `maxPages`. `nextVersion` is the resume checkpoint.
 *
 * A 410 (`version_pruned`) means `fromVersion` is below the node's retained
 * window. It throws {@link AptosPrunedReadError}: retrying cannot succeed.
 *
 * @see docs/decisions/sdk-auction-settled-event-source.md
 */
export async function scanAuctionOutcomeEvents(
  config: BridgeConfig,
  options: ScanOptions = {},
): Promise<AuctionOutcomeScan> {
  const pageSize = options.pageSize ?? 100;
  const maxPages = options.maxPages ?? 50;
  const prefix = normalizeTypeTag(`${config.contractAddress}::auction::`);
  const baseUrl = aptosBaseUrl(config);

  const events: AuctionOutcomeEvent[] = [];
  let next = options.fromVersion ?? 0n;

  for (let page = 0; page < maxPages; page++) {
    const url = `${baseUrl}/v1/transactions?start=${next}&limit=${pageSize}`;
    const response = await fetch(url);

    if (!response.ok) {
      // aptos-node 1.49 answers 410 Gone (error_code `version_pruned`) when
      // the requested versions fall below the pruner's retained window.
      if (response.status === 410) {
        throw new AptosPrunedReadError(url);
      }
      // 404/400: node or module not ready yet. Return what we have so the
      // caller retries from the same checkpoint later.
      if (response.status === 404 || response.status === 400) {
        break;
      }
      throw new Error(
        `scanAuctionOutcomeEvents: Aptos node returned ${response.status} for ${url}`,
      );
    }

    const txns = (await response.json()) as Array<Record<string, unknown>>;
    if (txns.length === 0) break;

    for (const tx of txns) {
      const version = BigInt(String(tx["version"]));
      const txEvents = (tx["events"] as Array<Record<string, unknown>>) ?? [];
      for (const raw of txEvents) {
        const type = normalizeTypeTag(String(raw["type"]));
        if (!type.startsWith(prefix)) continue;
        const name = type.slice(prefix.length);
        if (name === "auctionsettled") {
          events.push({
            kind: "AuctionSettled",
            event: parseAuctionSettledEvent(raw),
            version,
          });
        } else if (name === "auctionrefunded") {
          events.push({
            kind: "AuctionRefunded",
            event: parseAuctionRefundedEvent(raw),
            version,
          });
        }
      }
      next = version + 1n;
    }

    if (txns.length < pageSize) break; // reached the ledger head
  }

  return { events, nextVersion: next };
}

/**
 * Scan committed transactions for `auction::AuctionSettled` module events.
 *
 * {@link scanAuctionOutcomeEvents} filtered to `AuctionSettled`.
 * `nextVersion` is the resume checkpoint.
 *
 * @see docs/decisions/sdk-auction-settled-event-source.md
 */
export async function scanAuctionSettledEvents(
  config: BridgeConfig,
  options: ScanOptions = {},
): Promise<AuctionSettledScan> {
  const scan = await scanAuctionOutcomeEvents(config, options);
  const events: VersionedAuctionSettledEvent[] = [];
  for (const e of scan.events) {
    if (e.kind === "AuctionSettled") {
      events.push({ event: e.event, version: e.version });
    }
  }
  return { events, nextVersion: scan.nextVersion };
}

/**
 * Query for `auction::AuctionSettled` events for a given window/pair.
 *
 * Built on {@link scanAuctionSettledEvents} (transaction scan). Events are
 * filtered by windowId and pair. Pass `options.fromVersion` to bound the scan
 * (the default scans from genesis, which is only suitable for small chains).
 *
 * @param windowId  auction_window_id from docs/architecture §2.2
 * @param pair      trading pair descriptor
 * @param config    bridge configuration (Aptos node, contract address)
 * @returns Matching AuctionSettled events (typically 0 or 1 per window/pair)
 * @see docs/architecture/v0-architecture.md §2.9 — AuctionSettled event
 * @see docs/architecture/v0-architecture.md §3.1
 */
export async function queryAuctionSettledEvents(
  windowId: bigint,
  pair: Pair,
  config: BridgeConfig,
  options: ScanOptions = {},
): Promise<AuctionSettledEvent[]> {
  const { events } = await scanAuctionSettledEvents(config, options);
  return events
    .map((e) => e.event)
    .filter((e) => e.windowId === windowId && samePair(e.pair, pair));
}

/** Field-wise Pair equality. */
export function samePair(a: Pair, b: Pair): boolean {
  return (
    a.baseChain === b.baseChain &&
    a.baseToken === b.baseToken &&
    a.quoteChain === b.quoteChain &&
    a.quoteToken === b.quoteToken
  );
}

// ============================================================
// Amounts and receipts
// ============================================================

/** Escrowed asset. FakeETH is the base token, FakeUSD the quote token. */
export type LockAsset = "FakeETH" | "FakeUSD";

/** FakeUSD has 6 decimals, FakeETH 18. */
const QUOTE_UNIT = 10n ** 6n;
const BASE_UNIT = 10n ** 18n;

// SCOUT(#217) EDIT: state the unit here and move this function to src/price.ts, because the SDK unwind issue (195) deletes the release planner around it.
/**
 * FakeUSD units a winner pays for `baseAmount` FakeETH wei at
 * `clearingPrice` (USD per base token, no decimal shift). Rounds down.
 */
export function quoteForFill(
  baseAmount: bigint,
  clearingPrice: bigint,
): bigint {
  return (baseAmount * clearingPrice * QUOTE_UNIT) / BASE_UNIT;
}

/** An Aptos lock receipt, resolved to its Ethereum owner. */
export interface LockReceiptInfo {
  /** Aptos lock id, 0x-prefixed hex. */
  lockId: string;
  /** Ethereum address that locked the tokens in LockBox. */
  user: string;
  /**
   * Amount of the one LockBox lock this receipt proves (`lockAmounts` of its
   * lock id). Aptos registers each lock once, so receipts never overlap.
   */
  amount: bigint;
  /** Ethereum block the lock was proven at. */
  blockNumber: bigint;
  /** `lock_receipt` status: 0 active, 1 claimed, 2 revoked (released). */
  status: number;
}

/** `lock_receipt` status of a receipt Aptos released back to its owner. */
export const RECEIPT_STATUS_REVOKED = 2;

// ============================================================
// Aptos reads
// ============================================================

/**
 * Read an Aptos lock receipt with `lock_receipt::get_receipt<Ethereum, Asset>`.
 * `user` is the depositor's Ethereum address, which the receipt stores as
 * proven (`eth_owner`). The receipt's Aptos owner is the depositor's
 * Ethereum-derivable account, which does not encode that address.
 */
export async function getLockReceipt(
  aptosClient: Aptos,
  contractAddress: string,
  asset: LockAsset,
  lockId: string | Uint8Array,
): Promise<LockReceiptInfo> {
  const id = typeof lockId === "string" ? lockId : ethers.hexlify(lockId);
  const [, amount, blockNumber, status, ethOwner] = await aptosClient.view({
    payload: {
      function: `${contractAddress}::lock_receipt::get_receipt`,
      typeArguments: [
        `${contractAddress}::lock_receipt::Ethereum`,
        `${contractAddress}::lock_receipt::${asset}`,
      ],
      functionArguments: [ethers.getBytes(id)],
    },
  });
  return {
    lockId: id,
    user: ethers.getAddress(String(ethOwner)),
    amount: BigInt(String(amount)),
    blockNumber: BigInt(String(blockNumber)),
    status: Number(status),
  };
}

// ============================================================
// Bid results
// ============================================================

/**
 * Mirrors the BidResult interface from payloads.ts, without importing the
 * SDK's global Aptos client.
 */
export interface BidResult {
  bidder: string;
  fillAmount: bigint;
  isWinner: boolean;
}

/** Decode the REST JSON of `vector<auction::BidResult>`. */
export function parseBidResults(raw: unknown): BidResult[] {
  if (!Array.isArray(raw)) {
    throw new Error("parseBidResults: get_bid_results did not return a vector");
  }
  return raw.map((r: Record<string, unknown>) => ({
    bidder: String(r["bidder"]),
    fillAmount: BigInt(String(r["fill_amount"])),
    isWinner: r["is_winner"] === true,
  }));
}
