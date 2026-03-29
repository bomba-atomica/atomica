/**
 * Unit tests for useSellFlow state machine.
 *
 * Tests state transitions, localStorage persistence, and resume behavior
 * without triggering any blockchain calls. Blockchain-dependent transitions
 * (lockEth, generateProof, submitProof, createAuction) are covered by
 * meta/e2e tests once infrastructure is available.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Prevent the confirming-step polling effect from making real RPC calls.
vi.mock("../../src/lib/chain-config", () => ({
  getChainConfig: vi.fn().mockReturnValue({
    ethereum: {
      rpcUrl: "http://localhost:9999", // unreachable — no calls expected
      lockBox: "0x" + "11".repeat(20),
      fakeETH: "0x" + "22".repeat(20),
    },
    aptos: {},
  }),
}));

// Mock blockchain action modules so no real I/O happens.
vi.mock("../../src/lib/ethereum/lockbox", () => ({
  approveFakeEth: vi.fn(),
  lockFakeEth: vi.fn(),
  getUnlockTime: vi.fn(),
  withdrawFakeEth: vi.fn(),
}));
vi.mock("../../src/lib/ethereum/proofs/generator", () => ({
  generateLockedBalanceProof: vi.fn(),
}));
vi.mock("../../src/lib/aptos/payloads", () => ({
  getRegisterLockPayload: vi.fn(),
  getCreateAuctionPayload: vi.fn(),
}));
vi.mock("../../src/lib/aptos/transaction", () => ({
  submitNativeTransaction: vi.fn(),
}));

import { useSellFlow } from "../../src/hooks/useSellFlow";

const ACCOUNT = "0x1234567890123456789012345678901234567890";
const STORAGE_KEY = `sell-flow-${ACCOUNT.toLowerCase()}`;

describe("useSellFlow state machine", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  // ── Initial state ───────────────────────────────────────────────────────

  it("starts at connect step when no account is provided", () => {
    const { result } = renderHook(() => useSellFlow(null));
    expect(result.current.step).toBe("connect");
    expect(result.current.loading).toBe(false);
  });

  it("starts at lock step when account is provided with no persisted state", async () => {
    const { result } = renderHook(() => useSellFlow(ACCOUNT));
    await act(async () => {});
    expect(result.current.step).toBe("lock");
  });

  // ── localStorage persistence ────────────────────────────────────────────

  it("resumes step from localStorage on mount", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ step: "creating-auction", lockId: "0xdeadbeef" }),
    );
    const { result } = renderHook(() => useSellFlow(ACCOUNT));
    await act(async () => {});
    expect(result.current.step).toBe("creating-auction");
    expect(result.current.lockId).toBe("0xdeadbeef");
  });

  it("resumes txHash and lockBlock from localStorage", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ step: "confirming", txHash: "0xabc123", lockBlock: 42 }),
    );
    const { result } = renderHook(() => useSellFlow(ACCOUNT));
    await act(async () => {});
    expect(result.current.txHash).toBe("0xabc123");
    expect(result.current.lockBlock).toBe(42);
  });

  it("resumes bigint fields (minPrice, amount) from stringified localStorage", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        step: "monitoring",
        minPrice: "2000000000", // bigint serialized as string
        amount: "1000000000000000000",
        auctionEndTime: 9999999999,
      }),
    );
    const { result } = renderHook(() => useSellFlow(ACCOUNT));
    await act(async () => {});
    expect(result.current.minPrice).toBe(2_000_000_000n);
    expect(result.current.amount).toBe(1_000_000_000_000_000_000n);
    expect(result.current.auctionEndTime).toBe(9999999999);
  });

  it("persists step to localStorage after mount", async () => {
    renderHook(() => useSellFlow(ACCOUNT));
    await act(async () => {});
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as {
      step: string;
    };
    expect(stored.step).toBe("lock");
  });

  // ── Account changes ─────────────────────────────────────────────────────

  it("transitions to connect step when account becomes null", async () => {
    let account: string | null = ACCOUNT;
    const { result, rerender } = renderHook(() => useSellFlow(account));
    await act(async () => {});
    expect(result.current.step).toBe("lock");

    account = null;
    rerender();
    expect(result.current.step).toBe("connect");
  });

  it("reloads persisted state when account changes", async () => {
    const ACCOUNT_2 = "0xaaaabbbbccccddddeeeeffffaaaabbbbccccdddd";
    const KEY_2 = `sell-flow-${ACCOUNT_2.toLowerCase()}`;
    localStorage.setItem(
      KEY_2,
      JSON.stringify({ step: "monitoring", auctionEndTime: 123 }),
    );

    let account = ACCOUNT;
    const { result, rerender } = renderHook(() => useSellFlow(account));
    await act(async () => {});
    expect(result.current.step).toBe("lock");

    account = ACCOUNT_2;
    rerender();
    await act(async () => {});
    expect(result.current.step).toBe("monitoring");
  });

  // ── reset() ─────────────────────────────────────────────────────────────

  it("reset clears localStorage and returns to lock step", async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ step: "monitoring" }));
    const { result } = renderHook(() => useSellFlow(ACCOUNT));
    await act(async () => {});
    expect(result.current.step).toBe("monitoring");

    act(() => {
      result.current.reset();
    });

    expect(result.current.step).toBe("lock");
    // After reset, the persist effect writes the new "lock" state
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      expect(JSON.parse(stored).step).toBe("lock");
    }
  });

  // ── Blockchain-dependent transitions (stubbed, pending infra) ────────────

  it.todo(
    "lockEth: transitions connect → lock → confirming after approve + lock tx",
  );
  it.todo(
    "generateProof: transitions confirming → generating-proof → submitting-proof",
  );
  it.todo(
    "submitProof: transitions submitting-proof → creating-auction after Aptos tx",
  );
  it.todo(
    "createAuction: transitions creating-auction → monitoring after Aptos tx",
  );
  it.todo("cancelAndUnlock: calls withdrawFakeEth and resets flow");
  it.todo("lockEth error: sets error message and stays at current step");
  it.todo(
    "submitProof error: sets error message and stays at submitting-proof",
  );
});
