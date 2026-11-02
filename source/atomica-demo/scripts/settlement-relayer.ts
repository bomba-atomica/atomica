/**
 * settlement-relayer.ts — Atomica v0 Beta Settlement Relayer
 *
 * Off-chain relayer that polls Aptos for `auction::AuctionSettled` events
 * and submits settlements to `BLSVerifierTestnet.sol::authorizeSettlement`
 * on Ethereum.
 *
 * Entry point:
 *   bun run source/atomica-demo/scripts/settlement-relayer.ts
 *
 * Required environment variables:
 *   APTOS_RPC_URL          — Aptos fullnode RPC (default: http://localhost:8080/v1)
 *   CONTRACT_ADDRESS       — Deployed Atomica Move package address on Aptos
 *   ETH_RPC_URL            — Ethereum JSON-RPC endpoint (default: http://localhost:8545)
 *   BLS_VERIFIER_ADDRESS   — Deployed BLSVerifierTestnet.sol address
 *   RELAYER_PRIVATE_KEY    — Relayer EOA private key (hex, 0x-prefixed)
 *   POLL_INTERVAL_MS       — Polling interval in ms (default: 5000)
 *   PAIR_BASE_CHAIN        — Trading pair base chain (default: "ethereum")
 *   PAIR_BASE_TOKEN        — Trading pair base token (default: "FakeETH")
 *   PAIR_QUOTE_CHAIN       — Trading pair quote chain (default: "aptos")
 *   PAIR_QUOTE_TOKEN       — Trading pair quote token (default: "FakeUSD")
 *   START_WINDOW_ID        — First window ID to relay (default: 0)
 *   START_VERSION          — Aptos ledger version to start scanning at (default: 0)
 *   SETTLEMENT_CURSOR_FILE — Optional file holding the scan checkpoint (next version)
 *
 * Event source: AuctionSettled is a module event, so the relayer scans
 * /v1/transactions from a version cursor (see docs/decisions/sdk-auction-settled-event-source.md).
 * A 410 (pruned) read is fatal: set START_VERSION above the pruned range.
 *
 * Architecture reference:
 *   See docs/architecture/v0-architecture.md §3.1 — Relayer Entry Point Design
 *   See docs/architecture/v0-architecture.md §3.2 — BLS Relayer Flow
 *
 * @see source/atomica-sdk/src/settlement/bridge.ts
 * @see source/evm-contracts/src/settlement/BLSVerifierTestnet.sol
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import {
  AptosPrunedReadError,
  samePair,
  scanAuctionSettledEvents,
  submitSettlement,
  type BridgeConfig,
  type Pair,
} from "@atomica/sdk/settlement/bridge";

// ── Configuration from environment ───────────────────────────────────────────

const env = process.env;

const APTOS_RPC_URL = env.APTOS_RPC_URL ?? "http://localhost:8080/v1";
const CONTRACT_ADDRESS = env.CONTRACT_ADDRESS ?? "";
const ETH_RPC_URL = env.ETH_RPC_URL ?? "http://localhost:8545";
const BLS_VERIFIER_ADDRESS = env.BLS_VERIFIER_ADDRESS ?? "";
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
  if (!BLS_VERIFIER_ADDRESS) missing.push("BLS_VERIFIER_ADDRESS");
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

/** Track which window IDs have already been relayed to avoid duplicates. */
const relayedWindows = new Set<string>();

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
 * One poll: scan from `cursor`, relay each AuctionSettled event for `pair`,
 * and return the new cursor. The cursor only moves past events that were
 * relayed, so a failed submission is retried on the next poll.
 * A pruned read (410) is terminal and rethrown: the relayer must not retry it.
 */
async function pollAndRelay(
  config: BridgeConfig,
  pair: Pair,
  cursor: bigint,
): Promise<bigint> {
  try {
    const scan = await scanAuctionSettledEvents(config, {
      fromVersion: cursor,
    });
    for (const { event, version } of scan.events) {
      if (samePair(event.pair, pair) && event.windowId >= START_WINDOW_ID) {
        const windowKey = `${event.windowId}:${pair.baseToken}/${pair.quoteToken}`;
        if (!relayedWindows.has(windowKey)) {
          console.log(
            `[relayer] Found AuctionSettled event — window=${event.windowId} ` +
              `pair=${pair.baseToken}/${pair.quoteToken} version=${version} ` +
              `clearingPrice=${event.clearingPrice} ` +
              `totalFilled=${event.totalFilled} ` +
              `winnerCount=${event.winnerCount}`,
          );
          const txHash = await submitSettlement([event], config);
          relayedWindows.add(windowKey);
          console.log(
            `[relayer] Settlement authorized. tx=${txHash} window=${event.windowId}`,
          );
        }
      }
    }

    // Every event below scan.nextVersion is relayed (a failed submission threw).
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
    blsVerifierAddress: BLS_VERIFIER_ADDRESS,
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
  console.log(`  BLS verifier:      ${BLS_VERIFIER_ADDRESS}`);
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
