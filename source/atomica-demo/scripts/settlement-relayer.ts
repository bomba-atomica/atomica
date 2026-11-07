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
 *   SETTLEMENT_DEAD_LETTER_FILE — JSONL file of outcomes that failed for good
 *                            (default: settlement-dead-letters.jsonl)
 *   PAIR_BCS               — Window key pair bytes served, 0x hex (default "0x",
 *                            as the sell flow creates windows)
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

import {
  appendFileSync,
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { ethers } from "ethers";
import {
  AptosPrunedReadError,
  getRelayerSigner,
  relayOutcomeScan,
  scanAuctionOutcomeEvents,
  type BridgeConfig,
  type Pair,
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
const DEAD_LETTER_FILE =
  env.SETTLEMENT_DEAD_LETTER_FILE ?? "settlement-dead-letters.jsonl";
const PAIR_BCS = env.PAIR_BCS ?? "0x";

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
 * Record an outcome the relayer gave up on. Each line is one JSON dead
 * letter. An operator must resolve it by hand: the cursor has moved past it.
 */
function saveDeadLetter(letter: object): void {
  const line = JSON.stringify(letter, (_k, v) =>
    typeof v === "bigint" ? v.toString() : v,
  );
  appendFileSync(DEAD_LETTER_FILE, `${line}\n`);
  console.error(`[relayer] ALERT dead letter -> ${DEAD_LETTER_FILE}: ${line}`);
}

/**
 * One poll: scan from `cursor` and relay each outcome on its own. A
 * permanent failure becomes a dead letter and the scan moves on. A transient
 * failure keeps the cursor at that outcome so the next poll retries it.
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
    const result = await relayOutcomeScan(scan, config, {
      pair,
      minWindowId: START_WINDOW_ID,
    });
    for (const { outcome, txHashes } of result.relayed) {
      console.log(
        `[relayer] ${outcome.kind} window=${outcome.event.windowId} ` +
          `version=${outcome.version} releases=${txHashes.length} ` +
          `txs=${txHashes.join(",") || "none (already relayed or other pair)"}`,
      );
    }
    for (const letter of result.deadLetters) saveDeadLetter(letter);
    if (result.transientError) {
      console.error(
        `[relayer] Transient error at version ${result.nextVersion}, retrying next poll: ${result.transientError}`,
      );
    }
    saveCursor(result.nextVersion);
    return result.nextVersion;
  } catch (err: unknown) {
    if (err instanceof AptosPrunedReadError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[relayer] Error polling from version ${cursor}: ${msg}`);
    // Scan failed (Aptos unreachable): retry on next poll.
    return cursor;
  }
}

/** Exit unless the relayer key is the LockBox settlementAuthority. */
async function preflight(config: BridgeConfig): Promise<void> {
  const signer = getRelayerSigner(config);
  const lockBox = new ethers.Contract(
    config.lockBoxAddress,
    ["function settlementAuthority() view returns (address)"],
    signer,
  );
  const authority = (await lockBox.settlementAuthority()) as string;
  const relayer = await signer.getAddress();
  if (authority.toLowerCase() !== relayer.toLowerCase()) {
    console.error(
      `[relayer] ERROR: relayer ${relayer} is not the LockBox settlementAuthority ${authority}`,
    );
    process.exit(1);
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
    pairBcs: PAIR_BCS,
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
  console.log(`  Pair bytes:        ${PAIR_BCS}`);
  console.log(`  Dead letters:      ${DEAD_LETTER_FILE}`);
  console.log(`  Poll interval:     ${POLL_INTERVAL_MS}ms`);
  console.log(`  Starting version:  ${loadCursor()}`);
  console.log("═".repeat(60));
  await preflight(config);
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
