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
 *
 * Architecture reference:
 *   See docs/architecture/v0-architecture.md §3.1 — Relayer Entry Point Design
 *   See docs/architecture/v0-architecture.md §3.2 — BLS Relayer Flow
 *
 * @see source/atomica-sdk/src/settlement/bridge.ts
 * @see source/evm-contracts/src/settlement/BLSVerifierTestnet.sol
 */

import {
  queryAuctionSettledEvents,
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

// ── Main polling loop ─────────────────────────────────────────────────────────

async function pollAndRelay(
  config: BridgeConfig,
  pair: Pair,
  currentWindowId: bigint,
): Promise<bigint> {
  try {
    const events = await queryAuctionSettledEvents(
      currentWindowId,
      pair,
      config,
    );

    if (events.length === 0) {
      // No settled event yet for this window — check if there are newer settled windows.
      // In production the relayer would maintain a cursor; for v0 Beta we probe forward.
      return currentWindowId;
    }

    const event = events[0];
    const windowKey = `${event.windowId}:${pair.baseToken}/${pair.quoteToken}`;

    if (relayedWindows.has(windowKey)) {
      // Already relayed this window — advance to next.
      return currentWindowId + 1n;
    }

    console.log(
      `[relayer] Found AuctionSettled event — window=${event.windowId} ` +
        `pair=${pair.baseToken}/${pair.quoteToken} ` +
        `clearingPrice=${event.clearingPrice} ` +
        `totalFilled=${event.totalFilled} ` +
        `winnerCount=${event.winnerCount}`,
    );

    console.log(`[relayer] Submitting settlement to BLSVerifierTestnet...`);
    const txHash = await submitSettlement(events, config);

    relayedWindows.add(windowKey);
    console.log(
      `[relayer] Settlement authorized. tx=${txHash} window=${event.windowId}`,
    );

    // Advance to the next window.
    return currentWindowId + 1n;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[relayer] Error polling window ${currentWindowId}: ${msg}`);
    // Do not advance on error — retry on next poll.
    return currentWindowId;
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
  console.log(`  Starting window:   ${START_WINDOW_ID}`);
  console.log("═".repeat(60));
  console.log("[relayer] Starting polling loop...");

  let currentWindowId = START_WINDOW_ID;

  // Polling loop — runs indefinitely until interrupted.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    currentWindowId = await pollAndRelay(config, pair, currentWindowId);
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
