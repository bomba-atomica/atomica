/**
 * settlement-relayer.ts — Atomica v0 Beta Settlement Relayer
 *
 * Off-chain relayer that polls Aptos for the auction outcome events
 * (`AuctionSettled`, `AuctionRefunded`, `BidUnopened`) and releases the
 * matching locks in the Ethereum LockBox. Its key must be the LockBox
 * `settlementAuthority`. Users then pull released tokens with
 * `LockBox.withdrawWinnings`.
 *
 * Entry point:
 *   bun run source/atomica-demo/scripts/settlement-relayer.ts
 *
 * Required environment variables:
 *   APTOS_RPC_URL          — Aptos fullnode RPC (default: http://localhost:8080/v1)
 *   CONTRACT_ADDRESS       — Deployed Atomica Move package address on Aptos
 *   ETH_RPC_URL            — Ethereum JSON-RPC endpoint (default: http://localhost:8545)
 *   LOCKBOX_ADDRESS        — Deployed LockBox.sol address
 *   RELAYER_PRIVATE_KEY    — Relayer EOA private key (hex, 0x-prefixed); the LockBox settlementAuthority
 *   POLL_INTERVAL_MS       — Polling interval in ms (default: 5000)
 *   PAIR_BASE_CHAIN        — Trading pair base chain (default: "ethereum")
 *   PAIR_BASE_TOKEN        — Trading pair base token (default: "FakeETH")
 *   PAIR_QUOTE_CHAIN       — Trading pair quote chain (default: "aptos")
 *   PAIR_QUOTE_TOKEN       — Trading pair quote token (default: "FakeUSD")
 *   START_WINDOW_ID        — First window ID to relay (default: 0)
 *   START_VERSION          — Aptos ledger version to start scanning at (default: 0)
 *   SETTLEMENT_CURSOR_FILE — Optional file holding the scan checkpoint (next version)
 *
 * Event source: the outcome events are module events, so the relayer scans
 * /v1/transactions from a version cursor (see docs/decisions/sdk-auction-settled-event-source.md).
 * A 410 (pruned) read is fatal: set START_VERSION above the pruned range.
 *
 * Architecture reference:
 *   See docs/architecture/v0-architecture.md §3.1 — Relayer Entry Point Design
 *   See docs/architecture/v0-architecture.md §3.2 — BLS Relayer Flow
 *
 * @see source/atomica-sdk/src/settlement/bridge.ts
 * @see source/evm-contracts/src/escrow/LockBox.sol
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  AptosPrunedReadError,
  relayAuctionRefunded,
  relayAuctionSettled,
  relayBidUnopened,
  samePair,
  scanAuctionOutcomeEvents,
  type AuctionOutcomeEvent,
  type BridgeConfig,
  type Pair,
  type TxHash,
} from "@atomica/sdk/settlement/bridge";

// ── Configuration from environment ───────────────────────────────────────────

const env = process.env;

const APTOS_RPC_URL = env.APTOS_RPC_URL ?? "http://localhost:8080/v1";
const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS ?? "";
const ETH_RPC_URL = env.ETH_RPC_URL ?? "http://localhost:8545";
const LOCKBOX_ADDRESS = env.LOCKBOX_ADDRESS ?? "";
const RELAYER_PRIVATE_KEY = env.RELAYER_PRIVATE_KEY ?? "";
const POLL_INTERVAL_MS = parseInt(env.POLL_INTERVAL_MS ?? "5000", 10);
const PAIR_BASE_CHAIN = env.PAIR_BASE_CHAIN ?? "ethereum";
const PAIR_BASE_TOKEN = env.PAIR_BASE_TOKEN ?? "FakeETH";
const PAIR_QUOTE_CHAIN = env.PAIR_QUOTE_CHAIN ?? "aptos";
const PAIR_QUOTE_TOKEN = env.PAIR_QUOTE_TOKEN ?? "FakeUSD";
const START_WINDOW_ID = BigInt(env.START_WINDOW_ID ?? "0");
const START_VERSION = BigInt(env.START_VERSION ?? "0");
const CURSOR_FILE = env.SETTLEMENT_CURSOR_FILE ?? "";

// ── Validation ────────────────────────────────────────────────────────────────

function validateConfig(): void {
  const missing: string[] = [];
  if (!CONTRACT_ADDRESS) missing.push("CONTRACT_ADDRESS");
  if (!LOCKBOX_ADDRESS) missing.push("LOCKBOX_ADDRESS");
  if (!RELAYER_PRIVATE_KEY) missing.push("RELAYER_PRIVATE_KEY");

  if (missing.length > 0) {
    console.error(
      `[relayer] ERROR: Missing required environment variables: ${missing.join(", ")}`,
    );
    console.error("[relayer] See script header for full env variable list.");
    process.exit(1);
  }
}

// ── Relayer state ─────────────────────────────────────────────────────────────

/**
 * Checkpoint: next Aptos ledger version to scan. Persisted to
 * SETTLEMENT_CURSOR_FILE (if set) so a restart does not rescan the chain.
 */
function loadCursor(): bigint {
  if (CURSOR_FILE && existsSync(CURSOR_FILE)) {
    const raw = readFileSync(CURSOR_FILE, "utf8").trim();
    if (/^\d+$/.test(raw)) return BigInt(raw);
  }
  return START_VERSION;
}

function saveCursor(version: bigint): void {
  if (CURSOR_FILE) writeFileSync(CURSOR_FILE, `${version}\n`);
}

// ── Main polling loop ─────────────────────────────────────────────────────────

/**
 * Relay one outcome event to LockBox. Windows below START_WINDOW_ID and
 * settlements of other pairs are skipped. LockBox outcome ids make a replay
 * of an already relayed event a no-op.
 */
async function relayOutcome(
  outcome: AuctionOutcomeEvent,
  config: BridgeConfig,
  pair: Pair,
): Promise<TxHash[] | null> {
  if (outcome.event.windowId < START_WINDOW_ID) return null;
  switch (outcome.kind) {
    case "AuctionSettled":
      if (!samePair(outcome.event.pair, pair)) return null;
      return relayAuctionSettled(outcome.event, config);
    case "AuctionRefunded":
      return relayAuctionRefunded(outcome.event, pair, config);
    case "BidUnopened":
      return relayBidUnopened(outcome.event, config);
  }
}

/**
 * One poll: scan from `cursor`, relay each outcome event in ledger order,
 * and return the new cursor. The cursor only moves past events that were
 * relayed, so a failed release is retried on the next poll.
 * A pruned read (410) is terminal and rethrown: the relayer must not retry it.
 */
async function pollAndRelay(
  config: BridgeConfig,
  pair: Pair,
  cursor: bigint,
): Promise<bigint> {
  try {
    const scan = await scanAuctionOutcomeEvents(config, {
      fromVersion: cursor,
    });
    for (const outcome of scan.events) {
      const txHashes = await relayOutcome(outcome, config, pair);
      if (txHashes) {
        console.log(
          `[relayer] ${outcome.kind} window=${outcome.event.windowId} ` +
            `version=${outcome.version} releases=${txHashes.length} ` +
            `txs=${txHashes.join(",") || "none (already relayed)"}`,
        );
      }
    }

    // Every event below scan.nextVersion is relayed (a failed release threw).
    saveCursor(scan.nextVersion);
    return scan.nextVersion;
  } catch (err: unknown) {
    if (err instanceof AptosPrunedReadError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[relayer] Error polling from version ${cursor}: ${msg}`);
    // Do not advance on error — retry on next poll.
    return cursor;
  }
}

async function main(): Promise<void> {
  validateConfig();

  const config: BridgeConfig = {
    aptosRpcUrl: APTOS_RPC_URL,
    contractAddress: CONTRACT_ADDRESS,
    ethRpcUrl: ETH_RPC_URL,
    lockBoxAddress: LOCKBOX_ADDRESS,
    relayerPrivateKey: RELAYER_PRIVATE_KEY,
  };

  const pair: Pair = {
    baseChain: PAIR_BASE_CHAIN,
    baseToken: PAIR_BASE_TOKEN,
    quoteChain: PAIR_QUOTE_CHAIN,
    quoteToken: PAIR_QUOTE_TOKEN,
  };

  console.log("═".repeat(60));
  console.log("  Atomica Settlement Relayer (v0.1 Beta)");
  console.log("═".repeat(60));
  console.log(`  Aptos RPC:         ${APTOS_RPC_URL}`);
  console.log(`  Contract address:  ${CONTRACT_ADDRESS}`);
  console.log(`  ETH RPC:           ${ETH_RPC_URL}`);
  console.log(`  LockBox:           ${LOCKBOX_ADDRESS}`);
  console.log(`  Pair:              ${pair.baseToken}/${pair.quoteToken}`);
  console.log(`  Poll interval:     ${POLL_INTERVAL_MS}ms`);
  console.log(`  Starting version:  ${loadCursor()}`);
  console.log("═".repeat(60));
  console.log("[relayer] Starting polling loop...");

  let cursor = loadCursor();

  // Polling loop — runs indefinitely until interrupted.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    cursor = await pollAndRelay(config, pair, cursor);
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

// Handle SIGINT / SIGTERM gracefully.
process.on("SIGINT", () => {
  console.log("\n[relayer] Caught SIGINT — shutting down.");
  process.exit(0);
});
process.on("SIGTERM", () => {
  console.log("\n[relayer] Caught SIGTERM — shutting down.");
  process.exit(0);
});

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[relayer] Fatal error: ${msg}`);
  process.exit(1);
});
