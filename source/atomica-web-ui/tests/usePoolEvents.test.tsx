/**
 * Unit tests for usePoolEvents hook.
 *
 * These tests run in Vitest browser mode (Chromium). Since vi.mock cannot
 * intercept Vite pre-bundled third-party modules like ethers in browser mode,
 * we test the hook's behaviour through its external contract:
 *
 *   - No-op when lockBox is the zero address (no provider created)
 *   - Graceful degradation when Ethereum RPC URL is unreachable
 *   - Cleanup on unmount does not crash
 *
 * The subscription happy-path (callback fires on event) is covered by the
 * integration test at tests/integration/15-pool-events.test.tsx which uses
 * a live dual-chain Docker testnet.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import React from "react";

import { usePoolEvents } from "../src/hooks/usePoolEvents";

// ---------------------------------------------------------------------------
// Test harness component
// ---------------------------------------------------------------------------

function TestComponent({ onEvent }: { onEvent: () => void }) {
  usePoolEvents(onEvent);
  return <div data-testid="test-component">mounted</div>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ChainConfigOverride = {
  ethereum: {
    rpcUrl: string;
    fakeETH: string;
    fakeUSD: string;
    lockBox: string;
  };
  aptos: { contractAddress: string };
};

/**
 * Override window.__ATOMICA_CHAIN_CONFIG__ for a test, restoring it afterward.
 */
function withChainConfig(config: ChainConfigOverride) {
  const w = window as unknown as { __ATOMICA_CHAIN_CONFIG__?: ChainConfigOverride };
  const saved = w.__ATOMICA_CHAIN_CONFIG__;
  w.__ATOMICA_CHAIN_CONFIG__ = config;
  return () => {
    w.__ATOMICA_CHAIN_CONFIG__ = saved;
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("usePoolEvents", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not subscribe when lockBox is zero address", async () => {
    const restore = withChainConfig({
      ethereum: {
        rpcUrl: "http://localhost:8545",
        lockBox: "0x0000000000000000000000000000000000000000",
        fakeETH: "0x2222222222222222222222222222222222222222",
        fakeUSD: "0x3333333333333333333333333333333333333333",
      },
      aptos: { contractAddress: "0x0" },
    });

    const onEvent = vi.fn();
    render(<TestComponent onEvent={onEvent} />);

    // Give the effect time to run
    await new Promise((r) => setTimeout(r, 100));

    // Callback should never fire — no subscription was created
    expect(onEvent).not.toHaveBeenCalled();
    restore();
  });

  it("does not crash when Ethereum RPC is unreachable", () => {
    const restore = withChainConfig({
      ethereum: {
        rpcUrl: "http://192.0.2.1:9999", // RFC 5737 TEST-NET — guaranteed unreachable
        lockBox: "0x1111111111111111111111111111111111111111",
        fakeETH: "0x2222222222222222222222222222222222222222",
        fakeUSD: "0x3333333333333333333333333333333333333333",
      },
      aptos: { contractAddress: "0x0" },
    });

    const onEvent = vi.fn();

    // Rendering must not throw even with an unreachable RPC
    expect(() => {
      render(<TestComponent onEvent={onEvent} />);
    }).not.toThrow();

    restore();
  });

  it("cleans up without crashing on unmount", async () => {
    const restore = withChainConfig({
      ethereum: {
        rpcUrl: "http://192.0.2.1:9999",
        lockBox: "0x1111111111111111111111111111111111111111",
        fakeETH: "0x2222222222222222222222222222222222222222",
        fakeUSD: "0x3333333333333333333333333333333333333333",
      },
      aptos: { contractAddress: "0x0" },
    });

    const onEvent = vi.fn();
    const { unmount } = render(<TestComponent onEvent={onEvent} />);

    // Let the effect subscribe (or fail gracefully)
    await new Promise((r) => setTimeout(r, 100));

    // Unmount must not throw
    expect(() => {
      unmount();
    }).not.toThrow();

    restore();
  });

  it("does not subscribe when lockBox is empty string", async () => {
    const restore = withChainConfig({
      ethereum: {
        rpcUrl: "http://localhost:8545",
        lockBox: "",
        fakeETH: "0x2222222222222222222222222222222222222222",
        fakeUSD: "0x3333333333333333333333333333333333333333",
      },
      aptos: { contractAddress: "0x0" },
    });

    const onEvent = vi.fn();
    render(<TestComponent onEvent={onEvent} />);

    await new Promise((r) => setTimeout(r, 100));

    expect(onEvent).not.toHaveBeenCalled();
    restore();
  });
});
