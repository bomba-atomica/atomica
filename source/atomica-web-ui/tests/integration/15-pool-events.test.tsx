/**
 * Integration tests: usePoolEvents Ethereum event subscription
 *
 * Covers:
 *   - Subscribe to TokensLocked events, lock FakeETH, verify callback fires
 *   - Unmount component, verify event listener is cleaned up
 *   - Ethereum RPC unreachable, verify no crash and graceful degradation
 *
 * All tests run in headless Chromium against a live dual-chain Docker testnet.
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import React from "react";
import { ethers } from "ethers";
import {
  setupIntegrationFixture,
  teardownIntegrationFixture,
  type IntegrationFixture,
} from "./fixtures/dual-chain";
import { usePoolEvents } from "../../src/hooks/usePoolEvents";

// ---------------------------------------------------------------------------
// Test harness component
// ---------------------------------------------------------------------------

function PoolEventsHarness({ onEvent }: { onEvent: () => void }) {
  usePoolEvents(onEvent);
  return <div data-testid="pool-events-harness">listening</div>;
}

// ---------------------------------------------------------------------------
// FakeETH ABI (approve + balanceOf)
// ---------------------------------------------------------------------------

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
] as const;

const LOCKBOX_ABI = [
  "function lock(address token, uint256 amount) external",
] as const;

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe.sequential("15 — pool events (usePoolEvents)", () => {
  let fixture: IntegrationFixture;

  beforeAll(async () => {
    fixture = await setupIntegrationFixture();
  }, 600_000);

  afterAll(async () => {
    await teardownIntegrationFixture();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Happy path: event fires on lock ────────────────────────────────────────

  it(
    "calls onEvent when a TokensLocked event is emitted after locking FakeETH",
    async () => {
      const onEvent = vi.fn();
      render(<PoolEventsHarness onEvent={onEvent} />);

      // Give the effect time to subscribe
      await new Promise((r) => setTimeout(r, 500));

      // Lock FakeETH to trigger a TokensLocked event
      const provider = new ethers.JsonRpcProvider(fixture.eth.rpcUrl);
      const wallet = new ethers.Wallet(fixture.eth.seller.privateKey, provider);
      const lockBoxAddress = fixture.eth.contracts.lockBox;
      const fakeEthAddress = fixture.eth.contracts.fakeETH;

      const fakeEth = new ethers.Contract(fakeEthAddress, ERC20_ABI, wallet);
      const lockBox = new ethers.Contract(lockBoxAddress, LOCKBOX_ABI, wallet);

      // Approve and lock 1 FakeETH
      const amount = ethers.parseEther("1");
      const approveTx = await fakeEth.approve(lockBoxAddress, amount);
      await approveTx.wait();
      const lockTx = await lockBox.lock(fakeEthAddress, amount);
      await lockTx.wait();

      // Wait for the event polling to detect the new event (ethers v6 HTTP
      // polling interval is ~4 seconds by default)
      await vi.waitFor(
        () => {
          expect(onEvent).toHaveBeenCalled();
        },
        { timeout: 15_000, interval: 500 },
      );
    },
    30_000,
  );

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  it("cleans up listener on unmount (no further callbacks)", async () => {
    const onEvent = vi.fn();
    const { unmount } = render(<PoolEventsHarness onEvent={onEvent} />);

    // Let the subscription establish
    await new Promise((r) => setTimeout(r, 500));

    // Unmount — should remove the listener
    unmount();

    // Lock another FakeETH
    const provider = new ethers.JsonRpcProvider(fixture.eth.rpcUrl);
    const wallet = new ethers.Wallet(fixture.eth.seller.privateKey, provider);
    const lockBoxAddress = fixture.eth.contracts.lockBox;
    const fakeEthAddress = fixture.eth.contracts.fakeETH;

    const fakeEth = new ethers.Contract(fakeEthAddress, ERC20_ABI, wallet);
    const lockBox = new ethers.Contract(lockBoxAddress, LOCKBOX_ABI, wallet);

    const amount = ethers.parseEther("1");
    const approveTx = await fakeEth.approve(lockBoxAddress, amount);
    await approveTx.wait();
    const lockTx = await lockBox.lock(fakeEthAddress, amount);
    await lockTx.wait();

    // Wait well past polling interval — callback should NOT have been called
    await new Promise((r) => setTimeout(r, 6_000));

    expect(onEvent).not.toHaveBeenCalled();
  }, 30_000);

  // ── Graceful degradation when RPC is unreachable ───────────────────────────

  it("does not crash when Ethereum RPC is unreachable", () => {
    // Temporarily override chain config to an unreachable URL
    const w = window as unknown as {
      __ATOMICA_CHAIN_CONFIG__: {
        ethereum: {
          rpcUrl: string;
          fakeETH: string;
          fakeUSD: string;
          lockBox: string;
        };
        aptos: { contractAddress: string };
      };
    };
    const savedConfig = { ...w.__ATOMICA_CHAIN_CONFIG__ };
    w.__ATOMICA_CHAIN_CONFIG__ = {
      ...savedConfig,
      ethereum: {
        ...savedConfig.ethereum,
        rpcUrl: "http://192.0.2.1:9999", // RFC 5737 TEST-NET — guaranteed unreachable
      },
    };

    const onEvent = vi.fn();

    // Rendering must not throw
    expect(() => {
      render(<PoolEventsHarness onEvent={onEvent} />);
    }).not.toThrow();

    // Restore config
    w.__ATOMICA_CHAIN_CONFIG__ = savedConfig;

    cleanup();
  });
});
