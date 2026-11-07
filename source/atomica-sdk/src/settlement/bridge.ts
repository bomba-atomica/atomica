/**
 * bridge.ts — v0 Beta Settlement Bridge
 *
 * Relays Aptos auction outcomes to the Ethereum LockBox escrow.
 *
 * Event source: `AuctionSettled`, `AuctionRefunded` and `BidUnopened` are
 * module events, so {@link scanAuctionOutcomeEvents} walks committed
 * transactions from a version checkpoint.
 *
 * Release rule: LockBox releases a lock only when the trusted relayer (the
 * LockBox `settlementAuthority`) relays an Aptos outcome:
 *   - AuctionSettled → `settleFill` per winner and seller lock (FakeETH to the
 *     winner, FakeUSD at the clearing price to the seller), then `refund` of
 *     a winner's excess collateral, a seller's unsold supply, and each losing
 *     bid's collateral that Aptos released (receipt status REVOKED).
 *   - AuctionRefunded → `refund` of every seller and collateral lock of the
 *     window that Aptos released.
 *   - BidUnopened → `refund` of the unopened bid's collateral.
 * Users then pull credited tokens with `LockBox.withdrawWinnings`.
 *
 * Ethereum recipients are the owners of the Aptos lock receipts (the
 * zero-padded Ethereum address proven by the lock's storage proof), not the
 * bidder's Aptos signer address.
 *
 * Every release carries an outcome id derived from the Aptos lock id, so a
 * relayer restart or retry never pays twice: LockBox rejects a reused id and
 * the relayer skips ids it already relayed.
 *
 * The relayer signs with an ethers `NonceManager`, so back-to-back releases
 * never reuse a nonce.
 *
 * @see docs/architecture/v0-architecture.md §3 — Cross-Chain Settlement
 * @see source/evm-contracts/src/escrow/LockBox.sol
 */

import { ethers } from "ethers";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { aptosToEthereumAddress } from "../ethereum/address-converter.js";

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
  quoteChain: string; // e.g. "aptos"
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

/**
 * Transaction hash returned by Ethereum settlement calls.
 */
export type TxHash = string;

// ============================================================
// Configuration for bridge functions
// ============================================================

/**
 * Configuration required by bridge functions.
 * In the relayer script this is loaded from environment variables.
 */
export interface BridgeConfig {
  /** Aptos fullnode RPC URL */
  aptosRpcUrl: string;
  /** Deployed Atomica Move package address on Aptos */
  contractAddress: string;
  /** Ethereum JSON-RPC endpoint URL */
  ethRpcUrl: string;
  /** Deployed LockBox contract address */
  lockBoxAddress: string;
  /** Relayer private key (hex, 0x-prefixed). Must be the LockBox settlementAuthority. */
  relayerPrivateKey: string;
  /**
   * Window key pair bytes (`pair_bcs` of `create_auction`) this relayer
   * serves, 0x hex. Default "0x": the empty bytes the sell flow uses.
   */
  pairBcs?: string;
}

// ============================================================
// Helpers
// ============================================================

/**
 * BCS-encode a Pair struct as the Aptos Move BCS format.
 *
 * Move BCS encodes strings as: 4-byte little-endian length prefix + UTF-8 bytes.
 * This is the `pair_bcs` argument of the auction view functions.
 *
 * @param pair Trading pair descriptor
 * @returns Uint8Array containing the BCS-encoded pair
 */
export function bcsEncodePair(pair: Pair): Uint8Array {
  function encodeString(s: string): Uint8Array {
    const utf8 = new TextEncoder().encode(s);
    const len = new Uint8Array(4);
    new DataView(len.buffer).setUint32(
      0,
      utf8.length,
      true /* little-endian */,
    );
    const buf = new Uint8Array(4 + utf8.length);
    buf.set(len, 0);
    buf.set(utf8, 4);
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

/**
 * Mirrors the on-chain `auction::BidUnopened` event. `settle` emits it for a
 * bid nobody opened. Its collateral receipt stays claimed on Aptos.
 */
export interface BidUnopenedEvent {
  windowId: bigint;
  bidder: string;
  collateralLockId: Uint8Array;
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

function parseBidUnopenedEvent(raw: Record<string, unknown>): BidUnopenedEvent {
  const data = raw["data"] as Record<string, unknown>;
  return {
    windowId: BigInt(String(data["window_id"])),
    bidder: String(data["bidder"]),
    collateralLockId: hexToBytes(String(data["collateral_lock_id"])),
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
   * below it has been inspected. Persist it as the relayer checkpoint.
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
  // `aptosRpcUrl` conventionally already ends in `/v1` (see settlement-relayer
  // default), so strip it before appending the versioned path.
  return config.aptosRpcUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
}

/** One Aptos outcome event the relayer consumes, tagged by its Move name. */
export type AuctionOutcomeEvent =
  | { kind: "AuctionSettled"; event: AuctionSettledEvent; version: bigint }
  | { kind: "AuctionRefunded"; event: AuctionRefundedEvent; version: bigint }
  | { kind: "BidUnopened"; event: BidUnopenedEvent; version: bigint };

/** Result of one outcome scan. Events keep ledger order. */
export interface AuctionOutcomeScan {
  events: AuctionOutcomeEvent[];
  /** Version to pass as `fromVersion` on the next scan. */
  nextVersion: bigint;
}

/**
 * Scan committed transactions for the auction outcome module events:
 * `AuctionSettled`, `AuctionRefunded` and `BidUnopened`.
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
      // relayer retries from the same checkpoint on the next poll.
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
        } else if (name === "bidunopened") {
          events.push({
            kind: "BidUnopened",
            event: parseBidUnopenedEvent(raw),
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
 * @see docs/architecture/v0-architecture.md §3.1 — Relayer polling loop
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
// LockBox releases
// ============================================================

/** Escrowed asset. FakeETH is the base token, FakeUSD the quote token. */
export type LockAsset = "FakeETH" | "FakeUSD";

/** FakeUSD has 6 decimals, FakeETH 18. */
const QUOTE_UNIT = 10n ** 6n;
const BASE_UNIT = 10n ** 18n;

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

/** One LockBox call the relayer makes for an Aptos outcome. */
export type LockBoxRelease =
  | {
      kind: "refund";
      outcomeId: string;
      user: string;
      asset: LockAsset;
      amount: bigint;
    }
  | {
      kind: "fill";
      outcomeId: string;
      seller: string;
      winner: string;
      baseAmount: bigint;
      quoteAmount: bigint;
    };

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

/** Outcome id of the one refund a lock can get. */
export function refundOutcomeId(lockId: string): string {
  return ethers.solidityPackedKeccak256(
    ["string", "bytes"],
    ["refund", lockId],
  );
}

/** Outcome id of the fill between one seller lock and one winner's collateral lock. */
export function fillOutcomeId(
  sellerLockId: string,
  collateralLockId: string,
): string {
  return ethers.solidityPackedKeccak256(
    ["string", "bytes", "bytes"],
    ["fill", sellerLockId, collateralLockId],
  );
}

/** A bid of a settled window with its collateral receipt. */
export interface SettledBid {
  isWinner: boolean;
  /** FakeETH wei allocated to the bid (0 for losers). */
  fillAmount: bigint;
  collateral: LockReceiptInfo;
}

/**
 * Plan the LockBox releases of an `AuctionSettled` window.
 *
 * Winners take supply from the seller locks in `lock_ids` order. Each
 * (seller, winner) chunk is one `settleFill`. Then a winner's unused
 * collateral, each seller's unsold supply, and each losing bid's collateral
 * that Aptos released are refunded. An unopened bid's collateral stays
 * claimed on Aptos and is refunded by {@link relayBidUnopened}.
 *
 * Throws when the Aptos outcome does not fit the locks: fills above the
 * locked supply, or a payment above a winner's collateral.
 */
export function planSettlementReleases(input: {
  clearingPrice: bigint;
  sellers: LockReceiptInfo[];
  bids: SettledBid[];
}): LockBoxRelease[] {
  const releases: LockBoxRelease[] = [];
  const supply = input.sellers.map((s) => s.amount);

  for (const bid of input.bids) {
    if (!bid.isWinner) {
      if (
        bid.collateral.status === RECEIPT_STATUS_REVOKED &&
        bid.collateral.amount > 0n
      ) {
        releases.push({
          kind: "refund",
          outcomeId: refundOutcomeId(bid.collateral.lockId),
          user: bid.collateral.user,
          asset: "FakeUSD",
          amount: bid.collateral.amount,
        });
      }
      continue;
    }

    let unfilled = bid.fillAmount;
    let collateralLeft = bid.collateral.amount;
    for (let i = 0; i < input.sellers.length && unfilled > 0n; i++) {
      if (supply[i] === 0n) continue;
      const chunk = unfilled < supply[i] ? unfilled : supply[i];
      const quote = quoteForFill(chunk, input.clearingPrice);
      if (quote > collateralLeft) {
        throw new Error(
          `planSettlementReleases: winner ${bid.collateral.user} owes ${quote} FakeUSD but has ${collateralLeft} left`,
        );
      }
      releases.push({
        kind: "fill",
        outcomeId: fillOutcomeId(
          input.sellers[i].lockId,
          bid.collateral.lockId,
        ),
        seller: input.sellers[i].user,
        winner: bid.collateral.user,
        baseAmount: chunk,
        quoteAmount: quote,
      });
      supply[i] -= chunk;
      unfilled -= chunk;
      collateralLeft -= quote;
    }
    if (unfilled > 0n) {
      throw new Error(
        `planSettlementReleases: fill of ${bid.fillAmount} exceeds the locked supply by ${unfilled}`,
      );
    }
    if (collateralLeft > 0n) {
      releases.push({
        kind: "refund",
        outcomeId: refundOutcomeId(bid.collateral.lockId),
        user: bid.collateral.user,
        asset: "FakeUSD",
        amount: collateralLeft,
      });
    }
  }

  input.sellers.forEach((seller, i) => {
    if (supply[i] > 0n) {
      releases.push({
        kind: "refund",
        outcomeId: refundOutcomeId(seller.lockId),
        user: seller.user,
        asset: "FakeETH",
        amount: supply[i],
      });
    }
  });

  return releases;
}

/**
 * Plan the refunds of an `AuctionRefunded` window: every seller and
 * collateral lock whose receipt Aptos released.
 */
export function planRefundReleases(input: {
  sellers: LockReceiptInfo[];
  collateral: LockReceiptInfo[];
}): LockBoxRelease[] {
  const refund = (r: LockReceiptInfo, asset: LockAsset): LockBoxRelease => ({
    kind: "refund",
    outcomeId: refundOutcomeId(r.lockId),
    user: r.user,
    asset,
    amount: r.amount,
  });
  return [
    ...input.sellers
      .filter((r) => r.status === RECEIPT_STATUS_REVOKED && r.amount > 0n)
      .map((r) => refund(r, "FakeETH")),
    ...input.collateral
      .filter((r) => r.status === RECEIPT_STATUS_REVOKED && r.amount > 0n)
      .map((r) => refund(r, "FakeUSD")),
  ];
}

const LOCKBOX_RELAY_ABI = [
  "function fakeETH() view returns (address)",
  "function fakeUSD() view returns (address)",
  "function processedOutcomes(bytes32 outcomeId) view returns (bool)",
  "function refund(bytes32 outcomeId, address user, address token, uint256 amount)",
  "function settleFill(bytes32 outcomeId, address seller, address winner, uint256 baseAmount, uint256 quoteAmount)",
] as const;

const relayerSigners = new Map<string, ethers.NonceManager>();
const ethProviders = new Map<string, ethers.JsonRpcProvider>();

/** One JSON-RPC provider per Ethereum RPC URL (no request cache). */
function getEthProvider(config: BridgeConfig): ethers.JsonRpcProvider {
  let provider = ethProviders.get(config.ethRpcUrl);
  if (!provider) {
    provider = new ethers.JsonRpcProvider(config.ethRpcUrl, undefined, {
      cacheTimeout: -1,
    });
    ethProviders.set(config.ethRpcUrl, provider);
  }
  return provider;
}

/**
 * The relayer's signer: one `NonceManager` per (RPC URL, key) for the life
 * of the process, so back-to-back releases get consecutive nonces.
 */
export function getRelayerSigner(config: BridgeConfig): ethers.NonceManager {
  const key = `${config.ethRpcUrl}|${config.relayerPrivateKey}`;
  let signer = relayerSigners.get(key);
  if (!signer) {
    signer = new ethers.NonceManager(
      new ethers.Wallet(config.relayerPrivateKey, getEthProvider(config)),
    );
    relayerSigners.set(key, signer);
  }
  return signer;
}

/** How long the relayer waits for one LockBox transaction to be mined. */
export const TX_WAIT_TIMEOUT_MS = 120_000;

/** A release LockBox rejected for good (a revert), with the reason. */
export interface FailedRelease {
  release: LockBoxRelease;
  error: string;
}

/**
 * Some releases of an outcome reverted. The others were sent. Retrying the
 * outcome cannot help: the relayer records it as a dead letter.
 */
export class PermanentRelayError extends Error {
  constructor(
    message: string,
    readonly failed: FailedRelease[] = [],
    readonly sent: TxHash[] = [],
  ) {
    super(message);
    this.name = "PermanentRelayError";
  }
}

/**
 * True when retrying cannot succeed: an EVM revert, a Move abort, or an
 * outcome that does not fit the locks. RPC, network and timeout errors are
 * transient and return false.
 */
export function isPermanentRelayError(e: unknown): boolean {
  if (e instanceof PermanentRelayError) return true;
  if (isEvmRevert(e)) return true;
  // A deterministic Aptos rejection (bad input, missing function, Move
  // abort) answers 4xx. 429 (rate limit) is transient.
  const status = (e as { status?: unknown })?.status;
  if (typeof status === "number" && status >= 400 && status < 500) {
    return status !== 429;
  }
  const msg = e instanceof Error ? e.message : String(e);
  return (
    /Move abort|ABORTED|abort_code/i.test(msg) ||
    /^(planSettlementReleases|relayAuctionSettled|relayAuctionRefunded):/.test(
      msg,
    )
  );
}

/**
 * True for a real EVM revert: ethers CALL_EXCEPTION with revert data, a
 * decoded reason, or a mined status-0 receipt. ethers also reports some
 * JSON-RPC failures as CALL_EXCEPTION with no data; those are transient.
 */
function isEvmRevert(e: unknown): boolean {
  const err = e as {
    code?: unknown;
    data?: unknown;
    reason?: unknown;
    revert?: unknown;
    receipt?: { status?: unknown } | null;
  };
  if (err?.code !== "CALL_EXCEPTION") return false;
  return (
    (typeof err.data === "string" && err.data.length > 2) ||
    err.reason != null ||
    err.revert != null ||
    err.receipt?.status === 0
  );
}

/** Selector of LockBox `OutcomeAlreadyProcessed(bytes32)`. */
const OUTCOME_ALREADY_PROCESSED = ethers
  .id("OutcomeAlreadyProcessed(bytes32)")
  .slice(0, 10);

/** True when LockBox reverted because the outcome was relayed already. */
function isAlreadyProcessed(e: unknown): boolean {
  const data = (e as { data?: unknown })?.data;
  return (
    typeof data === "string" &&
    data.toLowerCase().startsWith(OUTCOME_ALREADY_PROCESSED)
  );
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * Send `releases` to LockBox in order and wait for each receipt.
 *
 * A release whose outcome id LockBox already processed is skipped, so a
 * retry after a crash resumes where it stopped. A release that reverts is
 * set aside and the rest of the batch still goes out; the call then throws
 * {@link PermanentRelayError} listing the reverted releases. A transient
 * error (RPC down, wait timeout) throws at once so the caller retries later.
 * After any failed send the nonce manager is reset to the chain nonce.
 *
 * @returns Transaction hashes of the releases sent now.
 */
export async function executeLockBoxReleases(
  releases: LockBoxRelease[],
  config: BridgeConfig,
): Promise<TxHash[]> {
  if (releases.length === 0) return [];
  const signer = getRelayerSigner(config);
  const lockBox = new ethers.Contract(
    config.lockBoxAddress,
    LOCKBOX_RELAY_ABI,
    signer,
  );
  const tokens: Record<LockAsset, string> = {
    FakeETH: (await lockBox.fakeETH()) as string,
    FakeUSD: (await lockBox.fakeUSD()) as string,
  };

  const hashes: TxHash[] = [];
  const failed: FailedRelease[] = [];
  for (const r of releases) {
    try {
      if ((await lockBox.processedOutcomes(r.outcomeId)) as boolean) continue;
      const tx =
        r.kind === "refund"
          ? await lockBox.refund(r.outcomeId, r.user, tokens[r.asset], r.amount)
          : await lockBox.settleFill(
              r.outcomeId,
              r.seller,
              r.winner,
              r.baseAmount,
              r.quoteAmount,
            );
      const receipt = await tx.wait(1, TX_WAIT_TIMEOUT_MS);
      if (!receipt) {
        throw new Error(`LockBox ${r.kind} ${r.outcomeId}: no receipt`);
      }
      hashes.push(receipt.hash as TxHash);
    } catch (e) {
      signer.reset();
      // Another relay of the same outcome won the race: nothing is lost.
      if (isAlreadyProcessed(e)) continue;
      // Transient: the retry skips the outcomes this batch already sent.
      if (!isPermanentRelayError(e)) throw e;
      failed.push({ release: r, error: errorText(e) });
    }
  }
  if (failed.length > 0) {
    throw new PermanentRelayError(
      `${failed.length} of ${releases.length} LockBox releases reverted: ` +
        failed.map((f) => `${f.release.outcomeId} (${f.error})`).join("; "),
      failed,
      hashes,
    );
  }
  return hashes;
}

// ============================================================
// Aptos reads
// ============================================================

function aptosClientFor(config: BridgeConfig): Aptos {
  return new Aptos(
    new AptosConfig({ network: Network.LOCAL, fullnode: config.aptosRpcUrl }),
  );
}

/** Long-form (64 hex digit) Aptos address. */
function longAptosAddress(addr: string): string {
  return `0x${addr.replace(/^0x/, "").toLowerCase().padStart(64, "0")}`;
}

/**
 * Read an Aptos lock receipt with `lock_receipt::get_receipt<Ethereum, Asset>`
 * and resolve its owner to the Ethereum address that locked the tokens.
 */
export async function getLockReceipt(
  aptosClient: Aptos,
  contractAddress: string,
  asset: LockAsset,
  lockId: string | Uint8Array,
): Promise<LockReceiptInfo> {
  const id = typeof lockId === "string" ? lockId : ethers.hexlify(lockId);
  const [user, amount, blockNumber, status] = await aptosClient.view({
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
    user: ethers.getAddress(
      aptosToEthereumAddress(longAptosAddress(String(user))),
    ),
    amount: BigInt(String(amount)),
    blockNumber: BigInt(String(blockNumber)),
    status: Number(status),
  };
}

/** `auction::get_window_lock_ids`: seller lock ids and bid collateral lock ids. */
async function getWindowLockIds(
  aptosClient: Aptos,
  contractAddress: string,
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<{ sellers: string[]; collateral: string[] }> {
  const [sellers, collateral] = await aptosClient.view({
    payload: {
      function: `${contractAddress}::auction::get_window_lock_ids`,
      functionArguments: [windowId, pairBcs],
    },
  });
  return {
    sellers: (sellers as string[]).map(String),
    collateral: (collateral as string[]).map(String),
  };
}

/** Pair bytes of the windows this relayer serves (default: empty, as the sell flow uses). */
export function servedPairBcs(config: BridgeConfig): Uint8Array {
  return ethers.getBytes(config.pairBcs ?? "0x");
}

/**
 * Refuse a window this relayer does not serve. The outcome becomes a dead
 * letter, not a silent skip: its locks sit in this LockBox and only this
 * relayer can release them.
 */
function requireServedPair(
  kind: string,
  windowId: bigint,
  pairBcs: Uint8Array | undefined,
  config: BridgeConfig,
): Uint8Array {
  const served = servedPairBcs(config);
  if (pairBcs === undefined) {
    throw new PermanentRelayError(
      `${kind} of window ${windowId} carries no pair_bcs (older contract); relay it by hand`,
    );
  }
  if (ethers.hexlify(pairBcs) !== ethers.hexlify(served)) {
    throw new PermanentRelayError(
      `${kind} of window ${windowId} has pair_bcs ${ethers.hexlify(pairBcs)}; this relayer serves ${ethers.hexlify(served)}`,
    );
  }
  return served;
}

// ============================================================
// Outcome relays
// ============================================================

/**
 * Relay an `AuctionSettled` outcome to LockBox: winner payouts, seller
 * payouts, excess collateral, unsold supply and losing-bid refunds.
 *
 * Only a settled window of the served `pair_bcs` is relayed.
 *
 * @returns Ethereum transaction hashes of the releases sent.
 * @see docs/architecture/v0-architecture.md §3.5
 */
export async function relayAuctionSettled(
  event: AuctionSettledEvent,
  config: BridgeConfig,
): Promise<TxHash[]> {
  const pairBcs = requireServedPair(
    "AuctionSettled",
    event.windowId,
    event.pairBcs,
    config,
  );
  const aptosClient = aptosClientFor(config);

  const [settled] = await aptosClient.view({
    payload: {
      function: `${config.contractAddress}::auction::is_settled`,
      functionArguments: [event.windowId, pairBcs],
    },
  });
  if (settled !== true) {
    throw new PermanentRelayError(
      `relayAuctionSettled: window ${event.windowId} is not settled on Aptos`,
    );
  }

  const ids = await getWindowLockIds(
    aptosClient,
    config.contractAddress,
    event.windowId,
    pairBcs,
  );
  const bidResults = await getBidResultsWithClient(
    aptosClient,
    config.contractAddress,
    event.windowId,
    pairBcs,
  );
  if (ids.collateral.length !== bidResults.length) {
    throw new Error(
      `relayAuctionSettled: window ${event.windowId} has ${bidResults.length} results for ${ids.collateral.length} bids`,
    );
  }

  const sellers = await Promise.all(
    ids.sellers.map((id) =>
      getLockReceipt(aptosClient, config.contractAddress, "FakeETH", id),
    ),
  );
  const collateral = await Promise.all(
    ids.collateral.map((id) =>
      getLockReceipt(aptosClient, config.contractAddress, "FakeUSD", id),
    ),
  );
  const bids = bidResults.map((b, i) => ({
    isWinner: b.isWinner,
    fillAmount: b.fillAmount,
    collateral: collateral[i],
  }));

  const releases = planSettlementReleases({
    clearingPrice: event.clearingPrice,
    sellers,
    bids,
  });
  return executeLockBoxReleases(releases, config);
}

/**
 * Relay an `AuctionRefunded` outcome: refund every seller and collateral
 * lock of the window that Aptos released. Only a window of the served
 * `pair_bcs` is relayed; another becomes a dead letter.
 */
export async function relayAuctionRefunded(
  event: AuctionRefundedEvent,
  config: BridgeConfig,
): Promise<TxHash[]> {
  const pairBcs = requireServedPair(
    "AuctionRefunded",
    event.windowId,
    event.pairBcs,
    config,
  );
  const aptosClient = aptosClientFor(config);
  const ids = await getWindowLockIds(
    aptosClient,
    config.contractAddress,
    event.windowId,
    pairBcs,
  );
  const [sellers, collateral] = await Promise.all([
    Promise.all(
      ids.sellers.map((id) =>
        getLockReceipt(aptosClient, config.contractAddress, "FakeETH", id),
      ),
    ),
    Promise.all(
      ids.collateral.map((id) =>
        getLockReceipt(aptosClient, config.contractAddress, "FakeUSD", id),
      ),
    ),
  ]);
  return executeLockBoxReleases(
    planRefundReleases({ sellers, collateral }),
    config,
  );
}

/**
 * Relay a `BidUnopened` outcome: refund the bid's collateral to its owner.
 *
 * Default (issue 170): an unopened bid forfeits nothing. The griefing
 * penalty in docs/decisions/bid-validity-simplification.md has no
 * destination yet, and the collateral is the full bid margin.
 */
export async function relayBidUnopened(
  event: BidUnopenedEvent,
  config: BridgeConfig,
): Promise<TxHash[]> {
  const receipt = await getLockReceipt(
    aptosClientFor(config),
    config.contractAddress,
    "FakeUSD",
    event.collateralLockId,
  );
  if (receipt.amount === 0n) return [];
  return executeLockBoxReleases(
    [
      {
        kind: "refund",
        outcomeId: refundOutcomeId(receipt.lockId),
        user: receipt.user,
        asset: "FakeUSD",
        amount: receipt.amount,
      },
    ],
    config,
  );
}

// ============================================================
// Relayer loop
// ============================================================

/** An outcome the relayer gave up on: retrying cannot succeed. */
export interface DeadLetter {
  kind: AuctionOutcomeEvent["kind"];
  windowId: bigint;
  version: bigint;
  error: string;
  /** Releases of the outcome that did go out. */
  sent: TxHash[];
  /** Releases LockBox rejected, with user, token and amount, for a manual fix. */
  failed: FailedRelease[];
}

/** Result of relaying one scan. */
export interface RelayScanResult {
  /** Checkpoint for the next scan. */
  nextVersion: bigint;
  /** Outcomes relayed now, with their transaction hashes. */
  relayed: Array<{ outcome: AuctionOutcomeEvent; txHashes: TxHash[] }>;
  deadLetters: DeadLetter[];
  /** Set when a transient error stopped the scan; `nextVersion` retries it. */
  transientError?: string;
}

/**
 * Relay every outcome of a scan, one at a time, in ledger order.
 *
 * - A window below `minWindowId` is skipped. A window of a `pair_bcs` this
 *   relayer does not serve becomes a dead letter.
 * - A permanent failure (revert, Move abort, outcome that does not fit the
 *   locks) becomes a dead letter and the scan moves on, so one bad outcome
 *   never blocks the others.
 * - A transient failure stops the scan. `nextVersion` is that outcome's
 *   version, so the next poll retries it. Outcomes already relayed in the
 *   same transaction are skipped by their LockBox outcome ids.
 */
export async function relayOutcomeScan(
  scan: AuctionOutcomeScan,
  config: BridgeConfig,
  options: { pair: Pair; minWindowId?: bigint },
): Promise<RelayScanResult> {
  const result: RelayScanResult = {
    nextVersion: scan.nextVersion,
    relayed: [],
    deadLetters: [],
  };
  for (const outcome of scan.events) {
    if (outcome.event.windowId < (options.minWindowId ?? 0n)) continue;
    if (
      outcome.kind === "AuctionSettled" &&
      !samePair(outcome.event.pair, options.pair)
    ) {
      continue;
    }
    try {
      const txHashes =
        outcome.kind === "AuctionSettled"
          ? await relayAuctionSettled(outcome.event, config)
          : outcome.kind === "AuctionRefunded"
            ? await relayAuctionRefunded(outcome.event, config)
            : await relayBidUnopened(outcome.event, config);
      result.relayed.push({ outcome, txHashes });
    } catch (e) {
      if (!isPermanentRelayError(e)) {
        result.nextVersion = outcome.version;
        result.transientError = errorText(e);
        return result;
      }
      result.deadLetters.push({
        kind: outcome.kind,
        windowId: outcome.event.windowId,
        version: outcome.version,
        error: errorText(e),
        sent: e instanceof PermanentRelayError ? e.sent : [],
        failed: e instanceof PermanentRelayError ? e.failed : [],
      });
    }
  }
  return result;
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Import type for BidResult to avoid circular dependency with payloads.ts.
 * This mirrors the BidResult interface from payloads.ts.
 */
export interface BidResult {
  bidder: string;
  fillAmount: bigint;
  isWinner: boolean;
}

/**
 * Fetch bid results directly from a given Aptos client instance.
 *
 * This allows bridge.ts to use an isolated Aptos client configured from
 * BridgeConfig without modifying the global aptos instance in config.ts.
 *
 * @param aptosClient    Configured Aptos SDK client
 * @param contractAddr   Deployed Atomica Move package address
 * @param windowId       Auction window ID
 * @param pairBcs        BCS-encoded Pair bytes
 * @returns Array of BidResult entries
 */
async function getBidResultsWithClient(
  aptosClient: Aptos,
  contractAddr: string,
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<BidResult[]> {
  // `auction::get_bid_results` returns vector<BidResult>. Errors propagate:
  // an abort is permanent, an RPC failure transient (isPermanentRelayError).
  const result = await aptosClient.view({
    payload: {
      function: `${contractAddr}::auction::get_bid_results`,
      functionArguments: [windowId, pairBcs],
    },
  });
  return parseBidResults(result[0]);
}

/** Decode the REST JSON of `vector<auction::BidResult>`. */
export function parseBidResults(raw: unknown): BidResult[] {
  if (!Array.isArray(raw)) {
    throw new Error(
      "relayAuctionSettled: get_bid_results did not return a vector",
    );
  }
  return raw.map((r: Record<string, unknown>) => ({
    bidder: String(r["bidder"]),
    fillAmount: BigInt(String(r["fill_amount"])),
    isWinner: r["is_winner"] === true,
  }));
}
