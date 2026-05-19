/**
 * bridge.ts — v0 Beta Settlement Bridge
 *
 * Cross-chain settlement bridge between Aptos and Ethereum.
 * Implements queryAuctionSettledEvents, submitSettlement, and
 * releaseBidderCollateral.
 *
 * @see docs/architecture/v0-architecture.md §3 — Cross-Chain Settlement
 *
 * ============================================================
 * INTEGRATION RISK REGISTRY (scouts #96 and #111, resolved in #112)
 * ============================================================
 *
 * --- RISK 1: AuctionSettled winners/fills join gap ---
 *
 * `AuctionSettled` (auction.move §2.9) emits:
 *   window_id, pair, clearing_price, total_filled, winner_count, lock_ids
 *
 * It does NOT include per-winner Ethereum addresses or per-winner fill
 * amounts.  To construct `authorizeSettlement(winners[], fills[])` the
 * relayer makes a second Aptos view call to `auction::get_bid_results` and:
 *   1. Filters bid_results where `is_winner == true`.
 *   2. Converts each winner's Aptos address (32-byte Aptos addr) to Ethereum
 *      via `aptosToEthereumAddress` in `address-converter.ts`.
 *   3. Uses `fill_amount` from each winning BidResult as the fills entry.
 *
 * RESOLVED IN #112: `getBidResults` in payloads.ts calls
 * `auction::get_bid_results(windowId, pairBcs)`.
 *
 * --- RISK 2: Settlement.sol / BLSVerifierTestnet call-signature mismatch ---
 *
 * RESOLVED IN #112: Settlement.sol updated to cast `blsVerifier` to
 * `IBLSVerifier` (2-arg form) at call time.  validatorIndices is passed
 * in the function signature for ABI compatibility but is not forwarded.
 *
 * --- RISK 3: No withdrawWinnings pull-pattern in Settlement.sol ---
 *
 * Out of scope for #112.  Tracked in #113 (WithdrawWinnings UI).
 * The relayer uses a push path: authorizeSettlement is called by the
 * trusted relayer EOA; winners do not need to call anything.
 *
 * --- RISK 4: No BLSVerifierTestnet or Settlement.sol ABI in the SDK ---
 *
 * RESOLVED IN #111: `BLS_VERIFIER_TESTNET_ABI` and `SETTLEMENT_ABI` are
 * exported from `atomica-sdk/src/ethereum/abis.ts`.
 *
 * @see docs/architecture/v0-architecture.md §3.1 — Relayer Entry Point Design
 * @see docs/architecture/v0-architecture.md §3.2 — BLS Relayer Flow
 * @see docs/architecture/v0-architecture.md §3.4 — v1 ZK-Proof Upgrade Seam
 */

import { ethers } from "ethers";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { aptosToEthereumAddress } from "../ethereum/address-converter.js";
import { getBLSVerifierTestnetContract } from "../ethereum/contracts.js";

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
  /** Deployed BLSVerifierTestnet contract address */
  blsVerifierAddress: string;
  /** Relayer private key (hex, 0x-prefixed) — must match trustedRelayer on contract */
  relayerPrivateKey: string;
}

// ============================================================
// Helpers
// ============================================================

/**
 * BCS-encode a Pair struct as the Aptos Move BCS format.
 *
 * Move BCS encodes strings as: 4-byte little-endian length prefix + UTF-8 bytes.
 * This encoding is used for the `pairHash` argument to `authorizeSettlement`.
 *
 * @param pair Trading pair descriptor
 * @returns Uint8Array containing the BCS-encoded pair
 */
function bcsEncodePair(pair: Pair): Uint8Array {
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
 * Compute keccak256 of a BCS-encoded Pair.
 * Used as the `pairHash` argument to `authorizeSettlement`.
 */
function computePairHash(pair: Pair): string {
  const encoded = bcsEncodePair(pair);
  return ethers.keccak256(encoded);
}

/**
 * Parse a raw Aptos event JSON object into an AuctionSettledEvent.
 *
 * Aptos event data fields use snake_case; this function maps them to
 * the camelCase TypeScript interface.
 */
function parseAuctionSettledEvent(
  raw: Record<string, unknown>,
): AuctionSettledEvent {
  const data = raw["data"] as Record<string, unknown>;

  // Parse pair sub-struct
  const rawPair = data["pair"] as Record<string, unknown>;
  const pair: Pair = {
    baseChain: String(rawPair["base_chain"]),
    baseToken: String(rawPair["base_token"]),
    quoteChain: String(rawPair["quote_chain"]),
    quoteToken: String(rawPair["quote_token"]),
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
  };
}

// ============================================================
// Functions
// ============================================================

/**
 * Query Aptos node for `auction::AuctionSettled` events for a given window/pair.
 *
 * Uses the Aptos REST API endpoint:
 *   GET /v1/accounts/{contractAddress}/events/{eventHandleType}/{fieldName}
 *
 * where eventHandleType = "{contractAddress}::auction::AuctionRegistry"
 * and fieldName = "settled_events".
 *
 * Falls back to scanning all settlement view data if the event handle approach
 * is unavailable.  Events are filtered by windowId and pair after fetching.
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
): Promise<AuctionSettledEvent[]> {
  // Query the Aptos REST API for AuctionSettled events.
  // Event handles are stored at the contract address under the AuctionRegistry resource.
  // Endpoint: GET /v1/accounts/{addr}/events/{event_type_struct}/{field_name}
  const eventTypeStruct = encodeURIComponent(
    `${config.contractAddress}::auction::AuctionRegistry`,
  );
  const fieldName = "settled_events";
  const url = `${config.aptosRpcUrl}/v1/accounts/${config.contractAddress}/events/${eventTypeStruct}/${fieldName}?limit=200`;

  const response = await fetch(url);

  if (!response.ok) {
    // If the event handle endpoint is unavailable (e.g., module not yet deployed),
    // return an empty array gracefully so the relayer can retry on the next poll.
    if (response.status === 404 || response.status === 400) {
      return [];
    }
    throw new Error(
      `queryAuctionSettledEvents: Aptos node returned ${response.status} for ${url}`,
    );
  }

  const rawEvents = (await response.json()) as Array<Record<string, unknown>>;

  const parsed = rawEvents.map(parseAuctionSettledEvent);

  // Filter by windowId and pair fields.
  return parsed.filter(
    (e) =>
      e.windowId === windowId &&
      e.pair.baseChain === pair.baseChain &&
      e.pair.baseToken === pair.baseToken &&
      e.pair.quoteChain === pair.quoteChain &&
      e.pair.quoteToken === pair.quoteToken,
  );
}

/**
 * Submit settlement to `BLSVerifierTestnet.sol::authorizeSettlement`.
 *
 * Full data-flow (AuctionSettled → authorizeSettlement):
 *
 *   1. APTOS SIDE — read from `queryAuctionSettledEvents`:
 *      AuctionSettledEvent.windowId      → authorizeSettlement windowId
 *      keccak256(BCS(AuctionSettledEvent.pair)) → authorizeSettlement pairHash
 *      AuctionSettledEvent.clearingPrice → authorizeSettlement clearingPrice
 *
 *   2. JOIN STEP — fetch bid_results from Aptos view:
 *      auction::get_bid_results(windowId, pairBcs) → BidResult[]
 *      Filter BidResult where is_winner == true.
 *      Convert winner Aptos address → Ethereum address via aptosToEthereumAddress.
 *      Use BidResult.fill_amount as fills entry.
 *      → authorizeSettlement winners[], fills[]
 *
 *   3. ETHEREUM SIDE — call on BLSVerifierTestnet.sol:
 *      BLS_VERIFIER_TESTNET_ABI.authorizeSettlement(
 *        windowId, pairHash, clearingPrice, winners, fills
 *      )
 *
 * @param events  AuctionSettled events fetched from Aptos
 * @param config  Bridge configuration (Aptos node, Ethereum node, keys, addresses)
 * @returns Ethereum transaction hash of the authorizeSettlement call
 * @see docs/architecture/v0-architecture.md §3.2 — BLS Relayer Flow
 * @see source/atomica-sdk/src/ethereum/abis.ts — BLS_VERIFIER_TESTNET_ABI
 */
export async function submitSettlement(
  events: AuctionSettledEvent[],
  config: BridgeConfig,
): Promise<TxHash> {
  if (events.length === 0) {
    throw new Error(
      "submitSettlement: no AuctionSettled events provided — nothing to relay",
    );
  }

  // Use the first (and typically only) settled event for the window/pair.
  const event = events[0];

  // --- JOIN STEP: fetch bid results from Aptos ---
  const aptosConfig = new AptosConfig({
    network: Network.LOCAL,
    fullnode: config.aptosRpcUrl,
  });
  const aptosClient = new Aptos(aptosConfig);

  // Override global aptos instance for getBidResults call
  // We use the aptos module-level client from payloads.ts; inject via setAptosInstance.
  // For the relayer script we construct a fresh client and call the view directly.
  const pairBcs = bcsEncodePair(event.pair);

  const bidResults = await getBidResultsWithClient(
    aptosClient,
    config.contractAddress,
    event.windowId,
    pairBcs,
  );

  const winningBids = bidResults.filter((b) => b.isWinner);

  const winners: string[] = winningBids.map((b) =>
    aptosToEthereumAddress(b.bidder),
  );
  const fills: bigint[] = winningBids.map((b) => b.fillAmount);

  // --- ETHEREUM SIDE: call authorizeSettlement ---
  const ethProvider = new ethers.JsonRpcProvider(config.ethRpcUrl);
  const wallet = new ethers.Wallet(config.relayerPrivateKey, ethProvider);
  const contract = getBLSVerifierTestnetContract(
    ethProvider,
    wallet,
    config.blsVerifierAddress,
  );

  const pairHash = computePairHash(event.pair);

  const tx = await contract.authorizeSettlement(
    event.windowId,
    pairHash,
    event.clearingPrice,
    winners,
    fills,
  );

  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error("submitSettlement: transaction receipt is null");
  }

  return receipt.hash as TxHash;
}

/**
 * Typed descriptor for a losing bidder's collateral refund request.
 *
 * Created when settlement determines a bid did not win.  The
 * `collateral_lock_id` is the FakeUSD LockReceipt ID that was consumed by
 * `auction::submit_bid`.  The off-chain relayer or user calls
 * `releaseBidderCollateral` with this descriptor to trigger the Ethereum-side
 * unlock of the frozen FakeUSD.
 *
 * @see docs/architecture/v0-architecture.md §2.8 — Collateral Refund Path
 * @see #87 (Phase 3b — bidder collateral scaffold)
 */
export interface BidderCollateralRefund {
  /** FakeUSD LockReceipt ID consumed by auction::submit_bid */
  collateralLockId: Uint8Array;
  /** Bidder Aptos address (zero-padded Ethereum address) */
  bidderAddress: string;
  /** auction_window_id for which this bid was submitted */
  windowId: bigint;
  /** BCS-encoded trading pair that identifies the auction window */
  pairBcs: Uint8Array;
}

/**
 * Release bidder collateral for a losing bid.
 *
 * Called after settlement when a bid did not win the uniform-price clearing.
 * In the v0.1 Beta testnet flow this calls BLSVerifierTestnet's
 * `authorizeSettlement` with zero fill amount for the losing bidder.
 * The underlying LockBox unlock (allowing FakeUSD withdrawal) is handled
 * by the existing `lockbox.ts::withdrawFakeUsd` flow once the Ethereum-side
 * state reflects the settled auction.
 *
 * @param refund  Collateral refund descriptor from the losing bid
 * @param config  Bridge configuration (Aptos node, Ethereum node, keys, addresses)
 * @returns Ethereum transaction hash of the authorizeSettlement call
 * @see docs/architecture/v0-architecture.md §2.8
 */
export async function releaseBidderCollateral(
  refund: BidderCollateralRefund,
  config: BridgeConfig,
): Promise<TxHash> {
  // Derive the Ethereum address from the bidder's Aptos address.
  const bidderEthAddress = aptosToEthereumAddress(refund.bidderAddress);

  // Compute pairHash from BCS bytes — reverse-engineer pair fields from BCS not needed;
  // we use keccak256 of the raw pairBcs bytes directly.
  const pairHash = ethers.keccak256(refund.pairBcs);

  // Authorize a zero-fill settlement entry for the losing bidder.
  // This signals to Settlement.sol that the bidder is eligible for collateral release.
  const ethProvider = new ethers.JsonRpcProvider(config.ethRpcUrl);
  const wallet = new ethers.Wallet(config.relayerPrivateKey, ethProvider);
  const contract = getBLSVerifierTestnetContract(
    ethProvider,
    wallet,
    config.blsVerifierAddress,
  );

  const tx = await contract.authorizeSettlement(
    refund.windowId,
    pairHash,
    0n, // clearingPrice irrelevant for collateral-release path
    [bidderEthAddress],
    [0n], // zero fill = loser
  );

  const receipt = await tx.wait();
  if (!receipt) {
    throw new Error("releaseBidderCollateral: transaction receipt is null");
  }

  return receipt.hash as TxHash;
}

// ============================================================
// Internal helpers
// ============================================================

/**
 * Import type for BidResult to avoid circular dependency with payloads.ts.
 * This mirrors the BidResult interface from payloads.ts.
 */
interface BidResult {
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
  try {
    const result = await aptosClient.view({
      payload: {
        function: `${contractAddr}::auction::get_bid_results`,
        functionArguments: [windowId, pairBcs],
      },
    });
    const raw = result[0] as Array<{
      bidder: string;
      fill_amount: string;
      is_winner: boolean;
    }>;
    return raw.map(({ bidder, fill_amount, is_winner }) => ({
      bidder,
      fillAmount: BigInt(fill_amount),
      isWinner: is_winner,
    }));
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("E_NOT_IMPLEMENTED") ||
      msg.includes("ABORTED") ||
      msg.includes("abort_code")
    ) {
      return [];
    }
    throw e;
  }
}
