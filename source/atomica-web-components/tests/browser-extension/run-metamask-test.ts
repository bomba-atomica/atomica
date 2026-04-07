/**
 * @file run-metamask-test.ts
 * @description Orchestrator for the MetaMask extension compatibility spike.
 *
 * Starts a local Ethereum JSON-RPC node (anvil), runs the Playwright
 * MetaMask extension test, then shuts down the node.
 *
 * Requires:
 *   - anvil (from Foundry): https://book.getfoundry.sh/getting-started/installation
 *   - xvfb-run on headless Linux CI
 *   - MetaMask extension: run ./tests/browser-extension/download-metamask.sh first
 *
 * Usage:
 *   cd source/atomica-web-ui
 *   bun run test:metamask
 *
 *   # Override RPC (skip built-in anvil):
 *   ETH_RPC_URL=http://127.0.0.1:8545 ETH_CHAIN_ID=32382 bun run test:metamask
 */

import { spawn, ChildProcess } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CHAIN_ID = parseInt(process.env.ETH_CHAIN_ID ?? "32382", 10);
const RPC_PORT = 18545;
const RPC_URL = process.env.ETH_RPC_URL ?? `http://127.0.0.1:${RPC_PORT}`;

/** Hardhat / Anvil default test mnemonic — account[0] = 0xf39Fd... */
const TEST_MNEMONIC =
  "test test test test test test test test test test test junk";

// ---------------------------------------------------------------------------
// Anvil lifecycle
// ---------------------------------------------------------------------------

function startAnvil(): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const anvilBin =
      process.env.ANVIL_BIN ??
      `${process.env.HOME}/.foundry/bin/anvil`;

    const proc = spawn(
      anvilBin,
      [
        "--port", String(RPC_PORT),
        "--chain-id", String(CHAIN_ID),
        "--mnemonic", TEST_MNEMONIC,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );

    let started = false;

    proc.stdout!.on("data", (d: Buffer) => {
      const s = d.toString();
      if (!started && s.includes("Listening on")) {
        started = true;
        console.log(`[run-metamask-test] Anvil listening on port ${RPC_PORT}`);
        resolve(proc);
      }
    });

    proc.stderr!.on("data", () => { /* suppress */ });

    proc.on("error", (err) => {
      if (!started) reject(err);
    });

    setTimeout(() => {
      if (!started) reject(new Error("Anvil start timeout after 15 s"));
    }, 15_000);
  });
}

// ---------------------------------------------------------------------------
// Run the Playwright test
// ---------------------------------------------------------------------------

function runPlaywrightTest(): Promise<void> {
  return new Promise((resolve, reject) => {
    const testFile = path.join(__dirname, "metamask-compat.test.ts");

    // Use xvfb-run on Linux (required because MetaMask needs a display)
    const isLinux = process.platform === "linux";
    const cmd = isLinux ? "xvfb-run" : "bun";
    const args = isLinux
      ? ["-a", "bun", "run", testFile]
      : ["run", testFile];

    const child = spawn(cmd, args, {
      env: {
        ...process.env,
        ETH_RPC_URL: RPC_URL,
        ETH_CHAIN_ID: String(CHAIN_ID),
      },
      stdio: "inherit",
      cwd: path.join(__dirname, "../.."),
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`MetaMask test exited with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const useBuiltinAnvil = !process.env.ETH_RPC_URL;
  let anvilProc: ChildProcess | undefined;

  if (useBuiltinAnvil) {
    console.log("[run-metamask-test] Starting Anvil...");
    anvilProc = await startAnvil();
  } else {
    console.log(`[run-metamask-test] Using external RPC: ${RPC_URL}`);
  }

  try {
    await runPlaywrightTest();
    console.log("[run-metamask-test] Test PASSED");
  } finally {
    if (anvilProc) {
      anvilProc.kill();
      console.log("[run-metamask-test] Anvil stopped");
    }
  }
}

main().catch((err) => {
  console.error("[run-metamask-test] FAILED:", err.message);
  process.exit(1);
});
