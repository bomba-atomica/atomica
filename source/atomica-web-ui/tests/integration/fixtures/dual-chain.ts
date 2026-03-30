/**
 * Browser-test-safe dual-chain fixture for atomica-web-ui integration tests.
 *
 * Call setupIntegrationFixture() in beforeAll and teardownIntegrationFixture()
 * in afterAll. The returned IntegrationFixture provides typed handles for both
 * chains including contract addresses, funded test signers, and poll helpers.
 *
 * Also sets window.__ATOMICA_CHAIN_CONFIG__ so the app's getChainConfig()
 * returns the testnet addresses rather than the default env-based values.
 *
 * @example
 * ```ts
 * import { beforeAll, afterAll } from "vitest";
 * import {
 *   setupIntegrationFixture,
 *   teardownIntegrationFixture,
 *   type IntegrationFixture,
 * } from "../fixtures/dual-chain";
 *
 * let fixture: IntegrationFixture;
 *
 * beforeAll(async () => {
 *   fixture = await setupIntegrationFixture();
 * }, 600_000);
 *
 * afterAll(async () => {
 *   await teardownIntegrationFixture();
 * });
 * ```
 */

import { commands } from "vitest/browser";
import type { DualChainTestnetInfo } from "@atomica/aptos-docker-testnet/browser-commands";

// ---------------------------------------------------------------------------
// Re-exported constants
// ---------------------------------------------------------------------------

/** Short auction duration in seconds — use in settlement tests. */
export const AUCTION_DURATION_SHORT = 2;

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

/** Ethereum side of the integration fixture. */
export interface EthFixture {
  /** JSON-RPC URL of the running Ethereum Docker testnet. */
  rpcUrl: string;
  /** EVM chain ID. */
  chainId: number;
  /** Deployed contract addresses. */
  contracts: {
    fakeETH: string;
    fakeUSD: string;
    lockBox: string;
  };
  /** Seller (deployer) — holds FakeETH, creates locks. */
  seller: {
    address: string;
    privateKey: string;
  };
  /** Bidder — holds FakeETH, submits auction bids. */
  bidder: {
    address: string;
    privateKey: string;
  };
}

/** Aptos side of the integration fixture. */
export interface AptosFixture {
  /** Aptos node URL. */
  nodeUrl: string;
  /** Address where all Atomica Move modules are deployed. */
  moduleAddress: string;
  /** Deployer private key (hex). */
  deployerPrivateKey: string;
}

/** Combined dual-chain fixture returned by setupIntegrationFixture(). */
export interface IntegrationFixture {
  eth: EthFixture;
  aptos: AptosFixture;
}

// ---------------------------------------------------------------------------
// Fixture lifecycle
// ---------------------------------------------------------------------------

/**
 * Start both Ethereum and Aptos Docker testnets, deploy all contracts, fund
 * test accounts, and configure window.__ATOMICA_CHAIN_CONFIG__ so the app
 * reads the testnet addresses.
 *
 * Designed for use in beforeAll(); set a timeout of at least 600 000 ms.
 */
export async function setupIntegrationFixture(): Promise<IntegrationFixture> {
  console.log("[IntegrationFixture] Starting dual-chain testnet...");

  const info: DualChainTestnetInfo = await commands.setupDualChainTestnet();

  const fixture: IntegrationFixture = {
    eth: {
      rpcUrl: info.eth.rpcUrl,
      chainId: info.eth.chainId,
      contracts: {
        fakeETH: info.eth.contracts.fakeETH,
        fakeUSD: info.eth.contracts.fakeUSD,
        lockBox: info.eth.contracts.lockBox,
      },
      seller: {
        address: info.eth.deployerAddress,
        privateKey: info.eth.deployerPrivateKey,
      },
      bidder: {
        address: info.eth.bidderAddress,
        privateKey: info.eth.bidderPrivateKey,
      },
    },
    aptos: {
      nodeUrl: info.aptos.nodeUrl,
      moduleAddress: info.aptos.moduleAddress,
      deployerPrivateKey: info.aptos.deployerPrivateKey,
    },
  };

  // Configure the app to use testnet addresses
  (
    window as unknown as {
      __ATOMICA_CHAIN_CONFIG__: {
        ethereum: {
          rpcUrl: string;
          fakeETH: string;
          fakeUSD: string;
          lockBox: string;
        };
        aptos: { contractAddress: string };
      };
    }
  ).__ATOMICA_CHAIN_CONFIG__ = {
    ethereum: {
      rpcUrl: fixture.eth.rpcUrl,
      fakeETH: fixture.eth.contracts.fakeETH,
      fakeUSD: fixture.eth.contracts.fakeUSD,
      lockBox: fixture.eth.contracts.lockBox,
    },
    aptos: {
      contractAddress: fixture.aptos.moduleAddress,
    },
  };

  console.log(
    `[IntegrationFixture] Ready — ETH RPC: ${fixture.eth.rpcUrl}, Aptos: ${fixture.aptos.nodeUrl}`,
  );
  console.log(`[IntegrationFixture] Seller: ${fixture.eth.seller.address}`);
  console.log(`[IntegrationFixture] Bidder: ${fixture.eth.bidder.address}`);
  console.log(`[IntegrationFixture] LockBox: ${fixture.eth.contracts.lockBox}`);
  console.log(
    `[IntegrationFixture] Aptos module: ${fixture.aptos.moduleAddress}`,
  );

  return fixture;
}

/**
 * Tear down both testnets started by setupIntegrationFixture() and clear the
 * chain config override from the global window.
 *
 * Designed for use in afterAll().
 */
export async function teardownIntegrationFixture(): Promise<void> {
  console.log("[IntegrationFixture] Tearing down...");
  await commands.teardownDualChainTestnet();
  // Clear the chain config override
  (
    window as unknown as { __ATOMICA_CHAIN_CONFIG__?: unknown }
  ).__ATOMICA_CHAIN_CONFIG__ = undefined;
  console.log("[IntegrationFixture] Done");
}

// ---------------------------------------------------------------------------
// Poll helpers
// ---------------------------------------------------------------------------

/**
 * Poll an async function until the resolved value satisfies a predicate, or
 * until the timeout elapses.
 *
 * @param fn - Async function to poll.
 * @param predicate - Returns true when the value is acceptable.
 * @param options.intervalMs - Polling interval in milliseconds (default 500).
 * @param options.timeoutMs - Total timeout in milliseconds (default 30 000).
 * @param options.label - Human-readable description for error messages.
 * @returns The first value that satisfies the predicate.
 * @throws Error if the timeout elapses before the predicate passes.
 */
export async function waitForBalance(
  fn: () => Promise<bigint>,
  predicate: (balance: bigint) => boolean,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
    label?: string;
  } = {},
): Promise<bigint> {
  const { intervalMs = 500, timeoutMs = 30_000, label = "balance" } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const value = await fn();
    if (predicate(value)) {
      return value;
    }
    await new Promise<void>((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `[waitForBalance] Timeout after ${timeoutMs} ms waiting for ${label}`,
  );
}

/**
 * Poll an async function until the resolved string equals expectedStep, or
 * until the timeout elapses.  Useful for waiting on auction state transitions.
 *
 * @param fn - Async function returning the current step/state string.
 * @param expectedStep - The step value to wait for.
 * @param options.intervalMs - Polling interval in milliseconds (default 500).
 * @param options.timeoutMs - Total timeout in milliseconds (default 30 000).
 * @returns The step string once it matches.
 * @throws Error if the timeout elapses.
 */
export async function waitForStep(
  fn: () => Promise<string>,
  expectedStep: string,
  options: {
    intervalMs?: number;
    timeoutMs?: number;
  } = {},
): Promise<string> {
  const { intervalMs = 500, timeoutMs = 30_000 } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const step = await fn();
    if (step === expectedStep) {
      return step;
    }
    await new Promise<void>((r) => setTimeout(r, intervalMs));
  }

  throw new Error(
    `[waitForStep] Timeout after ${timeoutMs} ms waiting for step "${expectedStep}"`,
  );
}
