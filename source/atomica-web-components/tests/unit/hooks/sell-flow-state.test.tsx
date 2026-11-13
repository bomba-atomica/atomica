/**
 * Unit tests for useSellFlow state machine.
 *
 * Tests state transitions, localStorage persistence, and resume behavior
 * without triggering any blockchain calls. The blockchain actions (lockEth,
 * generateProof, submitProof, createAuction, cancelAndUnlock) run against
 * mocked SDK functions, so these tests check the hook's own transitions and
 * the arguments it hands to the SDK. Live-chain coverage of the same flow is
 * in tests/integration/14-happy-path.test.tsx.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { ethers } from "ethers";

// Prevent the confirming-step polling effect from making real RPC calls.
vi.mock("@atomica/sdk/chain-config", () => ({
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
// The lockBinding and lockFromReceipt mocks carry the computed deadline,
// ethLockDeadline(windowId): the proof input and reclaimLock need it, while
// LockBox.lock takes none. The asserts below repeat it.
vi.mock("@atomica/sdk/ethereum", () => ({
  approveFakeEth: vi.fn(),
  lockFakeEth: vi.fn(),
  currentWindowId: vi.fn(() => 41538n),
  lockBinding: vi.fn((windowId: bigint) => ({
    windowId,
    pairHash: "0x" + "ee".repeat(32),
    deadline: 1_794_728_700n,
  })),
  lockFromReceipt: vi.fn(() => ({
    lockId: "0x" + "dd".repeat(32),
    depositor: "0x1234567890123456789012345678901234567890",
    token: "0x" + "22".repeat(20),
    nonce: 3n,
    amount: 10n ** 18n,
    windowId: 41538n,
    pairHash: "0x" + "ee".repeat(32),
    deadline: 1_794_728_700n,
  })),
  reclaimLock: vi.fn(),
}));
vi.mock("@atomica/sdk/ethereum/proofs", () => ({
  generateLockedBalanceProof: vi.fn(),
}));
// getWindowDeadlineUs answers the close of window 41538 (07:45 UTC), and
// getWindowSchedule the production schedule.
vi.mock("@atomica/sdk/aptos", () => ({
  assertSiweDomain: vi.fn().mockResolvedValue(undefined),
  getRegisterLockPayload: vi.fn(),
  getCreateAuctionPayload: vi.fn(),
  getWindowDeadlineUs: vi.fn(async () => 1_794_469_500_000_000n),
  getWindowSchedule: vi.fn(async () => ({
    daySecs: 86_400n,
    closeOffsetsSecs: [27_900n, 58_500n],
  })),
  waitForCertifiedBlock: vi.fn(async (minBlock: number) => minBlock),
  aptos: { mock: "aptos-client" },
}));
vi.mock("@atomica/sdk", () => ({
  submitNativeTransaction: vi.fn(),
}));

import { useSellFlow } from "../../../src/hooks/useSellFlow";
import {
  approveFakeEth,
  lockFakeEth,
  lockFromReceipt,
  reclaimLock,
} from "@atomica/sdk/ethereum";
import { generateLockedBalanceProof } from "@atomica/sdk/ethereum/proofs";
import type { LockedBalanceProof } from "@atomica/sdk/ethereum/proofs";
import {
  aptos,
  assertSiweDomain,
  getRegisterLockPayload,
  getCreateAuctionPayload,
  getWindowDeadlineUs,
  waitForCertifiedBlock,
} from "@atomica/sdk/aptos";
import { submitNativeTransaction } from "@atomica/sdk";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";

const ACCOUNT = "0x1234567890123456789012345678901234567890";
/** The window_deadline_us answer of the mock above. */
const WINDOW_DEADLINE_US = 1_794_469_500_000_000n;
const STORAGE_KEY = `sell-flow-${ACCOUNT.toLowerCase()}`;
const LOCK_BOX = "0x" + "11".repeat(20);
const FAKE_ETH = "0x" + "22".repeat(20);

const PROOF = {
  blockNumber: 100,
  blockHash: "0x" + "aa".repeat(32),
  stateRoot: "0x" + "bb".repeat(32),
  contractAddress: LOCK_BOX,
  userAddress: ACCOUNT,
  tokenAddress: FAKE_ETH,
  lockNonce: 3n,
  lockId: "0x" + "dd".repeat(32),
  storageKey: "0x" + "cc".repeat(32),
  storageValue: 10n ** 18n,
  accountProof: ["0x01"],
  storageProof: ["0x02"],
} as unknown as LockedBalanceProof;

/** Persisted state of a confirmed lock, ready for proof generation. */
const LOCKED = {
  step: "generating-proof",
  lockBlock: 100,
  lockNonce: "3",
  windowId: "41538",
  amount: "1000000000000000000",
};

/** The receipt id is the proof's LockBox lock id (issue 171). */
const EXPECTED_LOCK_ID = PROOF.lockId;

type WindowWithEthereum = { ethereum?: unknown };

function installWalletProvider() {
  (window as unknown as WindowWithEthereum).ethereum = {
    request: vi.fn(),
  };
}

function persist(state: Record<string, unknown>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function stored(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Record<
    string,
    unknown
  >;
}

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

  // SCOUT(#217) EDIT: the minPrice fixture is micro-dollars.
  it("resumes bigint fields (amount) from stringified localStorage and ignores an old minPrice", async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        step: "monitoring",
        minPrice: "2000000000", // saved by an older build
        amount: "1000000000000000000", // bigint serialized as string
        auctionEndTime: 9999999999,
      }),
    );
    const { result } = renderHook(() => useSellFlow(ACCOUNT));
    await act(async () => {});
    expect(result.current).not.toHaveProperty("minPrice");
    expect(stored()).not.toHaveProperty("minPrice");
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

  // ── Blockchain-dependent transitions (SDK mocked) ───────────────────────

  describe("blockchain actions", () => {
    beforeEach(() => {
      vi.clearAllMocks();
      installWalletProvider();
    });

    afterEach(() => {
      delete (window as unknown as WindowWithEthereum).ethereum;
      vi.restoreAllMocks();
    });

    it("lockEth: approves then locks, and moves lock → confirming with the receipt", async () => {
      // The confirming step polls the chain; report zero confirmations so it stays put.
      vi.spyOn(
        ethers.JsonRpcProvider.prototype,
        "getBlockNumber",
      ).mockResolvedValue(77);
      vi.mocked(approveFakeEth).mockResolvedValue(undefined as never);
      vi.mocked(lockFakeEth).mockResolvedValue({
        hash: "0xlocktx",
        blockNumber: 77,
      } as never);

      const { result, unmount } = renderHook(() => useSellFlow(ACCOUNT));
      await act(async () => {});
      expect(result.current.step).toBe("lock");

      await act(async () => {
        await result.current.lockEth(10n ** 18n);
      });

      expect(approveFakeEth).toHaveBeenCalledWith(
        expect.anything(),
        10n ** 18n,
      );
      // The lock is bound to the current window, with its eth_lock_deadline.
      expect(lockFakeEth).toHaveBeenCalledWith(expect.anything(), 10n ** 18n, {
        windowId: 41538n,
        pairHash: "0x" + "ee".repeat(32),
        deadline: 1_794_728_700n,
      });
      expect(
        vi.mocked(approveFakeEth).mock.invocationCallOrder[0],
      ).toBeLessThan(vi.mocked(lockFakeEth).mock.invocationCallOrder[0]);
      expect(lockFromReceipt).toHaveBeenCalledWith({
        hash: "0xlocktx",
        blockNumber: 77,
      });
      expect(result.current.step).toBe("confirming");
      expect(result.current.txHash).toBe("0xlocktx");
      expect(result.current.lockBlock).toBe(77);
      expect(result.current.lockNonce).toBe(3n);
      expect(result.current.amount).toBe(10n ** 18n);
      expect(result.current).not.toHaveProperty("minPrice");
      expect(result.current.windowId).toBe(41538n);
      // unlockTime is the lock deadline: after it anyone may reclaim the lock.
      expect(result.current.unlockTime).toBe(1_794_728_700);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeUndefined();
      expect(stored()).toMatchObject({
        step: "confirming",
        txHash: "0xlocktx",
        lockBlock: 77,
        lockNonce: "3",
        windowId: "41538",
        amount: "1000000000000000000",
      });
      expect(stored()).not.toHaveProperty("minPrice");
      unmount();
    });

    it("confirming: moves to generating-proof once the lock block has 1 confirmation", async () => {
      vi.spyOn(
        ethers.JsonRpcProvider.prototype,
        "getBlockNumber",
      ).mockResolvedValue(101);
      persist({ step: "confirming", txHash: "0xlocktx", lockBlock: 100 });

      const { result, unmount } = renderHook(() => useSellFlow(ACCOUNT));
      await act(async () => {});
      await vi.waitFor(() => {
        expect(result.current.step).toBe("generating-proof");
      });
      expect(result.current.blockConfirmed).toBe(true);
      unmount();
    });

    it("generateProof: proves at a certified block covering the lock and moves to submitting-proof", async () => {
      vi.mocked(generateLockedBalanceProof).mockResolvedValue(PROOF);
      // The validators certified block 104, after the lock block 100.
      vi.mocked(waitForCertifiedBlock).mockResolvedValueOnce(104);
      persist(LOCKED);

      const { result } = renderHook(() => useSellFlow(ACCOUNT));
      await act(async () => {});
      await act(async () => {
        await result.current.generateProof();
      });

      expect(waitForCertifiedBlock).toHaveBeenCalledWith(100);
      expect(generateLockedBalanceProof).toHaveBeenCalledWith(
        expect.anything(),
        LOCK_BOX,
        ACCOUNT,
        FAKE_ETH,
        3n,
        {
          amount: 10n ** 18n,
          windowId: 41538n,
          pairHash: "0x" + "ee".repeat(32),
          deadline: 1_794_728_700n,
        },
        104,
      );
      expect(result.current.step).toBe("submitting-proof");
      expect(result.current.proof).toBe(PROOF);
      expect(result.current.loading).toBe(false);
      // The proof is too large to persist; only the step is stored.
      expect(stored().step).toBe("submitting-proof");
      expect(localStorage.getItem(STORAGE_KEY)).not.toContain("accountProof");
    });

    it("submitProof: registers the lock on Aptos and moves to creating-auction with the lock_id", async () => {
      vi.mocked(generateLockedBalanceProof).mockResolvedValue(PROOF);
      vi.mocked(getRegisterLockPayload).mockReturnValue({
        fn: "register_lock",
      } as never);
      vi.mocked(submitNativeTransaction).mockResolvedValue(undefined as never);
      persist(LOCKED);

      const { result } = renderHook(() => useSellFlow(ACCOUNT));
      await act(async () => {});
      await act(async () => {
        await result.current.generateProof();
      });
      await act(async () => {
        await result.current.submitProof();
      });

      expect(getRegisterLockPayload).toHaveBeenCalledWith(PROOF);
      expect(submitNativeTransaction).toHaveBeenCalledWith(aptos, ACCOUNT, {
        fn: "register_lock",
      });
      expect(result.current.error).toBeUndefined();
      expect(result.current.step).toBe("creating-auction");
      expect(result.current.lockId).toBe(EXPECTED_LOCK_ID);
      expect(stored()).toMatchObject({
        step: "creating-auction",
        lockId: EXPECTED_LOCK_ID,
      });
    });

    it("createAuction: submits the 3-argument create_auction and ends at the chain's window deadline", async () => {
      vi.mocked(getCreateAuctionPayload).mockReturnValue({
        fn: "create_auction",
      } as never);
      vi.mocked(submitNativeTransaction).mockResolvedValue(undefined as never);
      persist({
        step: "creating-auction",
        lockId: EXPECTED_LOCK_ID,
        windowId: "41538",
        amount: "1000000000000000000",
      });

      const { result } = renderHook(() => useSellFlow(ACCOUNT));
      await act(async () => {});
      await act(async () => {
        await result.current.createAuction();
      });

      expect(getCreateAuctionPayload).toHaveBeenCalledTimes(1);
      const args = vi.mocked(getCreateAuctionPayload).mock.calls[0];
      expect(args).toHaveLength(3);
      const [windowId, pairBcs, lockIdBytes] = args;
      expect(windowId).toBe(41538n);
      expect(pairBcs).toEqual(LAUNCH_PAIR_BCS);
      expect(lockIdBytes).toEqual(ethers.getBytes(EXPECTED_LOCK_ID));
      expect(submitNativeTransaction).toHaveBeenCalledWith(aptos, ACCOUNT, {
        fn: "create_auction",
      });
      expect(result.current.step).toBe("monitoring");
      // The end time is the window_deadline_us view, not a local clock.
      expect(getWindowDeadlineUs).toHaveBeenCalledWith(41538n);
      expect(result.current.auctionEndTime).toBe(
        Number(WINDOW_DEADLINE_US / 1_000_000n),
      );
      expect(stored().step).toBe("monitoring");
    });

    it("createAuction submits exactly one transaction and never calls registerTimelock", async () => {
      vi.mocked(getCreateAuctionPayload).mockReturnValue({
        fn: "create_auction",
      } as never);
      vi.mocked(submitNativeTransaction).mockResolvedValue(undefined as never);
      persist({ step: "creating-auction", lockId: EXPECTED_LOCK_ID });

      const { result } = renderHook(() => useSellFlow(ACCOUNT));
      await act(async () => {});
      await act(async () => {
        await result.current.createAuction();
      });

      expect(result.current.error).toBeUndefined();
      expect(submitNativeTransaction).toHaveBeenCalledTimes(1);
      // No transaction goes to the framework's timelock registration.
      for (const call of vi.mocked(getCreateAuctionPayload).mock.calls) {
        expect(call).toHaveLength(3);
      }
      expect(
        vi
          .mocked(submitNativeTransaction)
          .mock.calls.some(
            ([, , payload]) =>
              (payload as { function?: string }).function ===
              "0x1::ibe_config::register_timelock",
          ),
      ).toBe(false);
      expect("registerTimelock" in (await import("@atomica/sdk/aptos"))).toBe(
        false,
      );
    });

    it("createAuction runs when the saved state has no minimum price", async () => {
      vi.mocked(getCreateAuctionPayload).mockReturnValue({
        fn: "create_auction",
      } as never);
      vi.mocked(submitNativeTransaction).mockResolvedValue(undefined as never);
      // Only the lock id: no price was ever saved.
      persist({ step: "creating-auction", lockId: EXPECTED_LOCK_ID });

      const { result } = renderHook(() => useSellFlow(ACCOUNT));
      await act(async () => {});
      await act(async () => {
        await result.current.createAuction();
      });

      expect(result.current.error).toBeUndefined();
      expect(getCreateAuctionPayload).toHaveBeenCalledTimes(1);
      expect(vi.mocked(getCreateAuctionPayload).mock.calls[0]).toHaveLength(3);
      expect(submitNativeTransaction).toHaveBeenCalledTimes(1);
      expect(result.current.step).toBe("monitoring");
      expect(stored()).not.toHaveProperty("minPrice");
    });

    it("cancelAndUnlock: reclaims the lock to the seller and resets the flow to lock", async () => {
      vi.mocked(reclaimLock).mockResolvedValue(undefined as never);
      persist({
        step: "creating-auction",
        lockId: EXPECTED_LOCK_ID,
        lockNonce: "3",
        windowId: "41538",
        amount: "1000000000000000000",
        unlockTime: 1,
      });

      const { result } = renderHook(() => useSellFlow(ACCOUNT));
      await act(async () => {});
      await act(async () => {
        await result.current.cancelAndUnlock();
      });

      expect(reclaimLock).toHaveBeenCalledWith(expect.anything(), {
        depositor: ACCOUNT,
        token: FAKE_ETH,
        nonce: 3n,
        amount: 10n ** 18n,
        windowId: 41538n,
        pairHash: "0x" + "ee".repeat(32),
        deadline: 1_794_728_700n,
      });
      expect(result.current.step).toBe("lock");
      expect(result.current.lockId).toBeUndefined();
      expect(result.current.amount).toBeUndefined();
      expect(stored()).toEqual({ step: "lock" });
    });

    it("lockEth error: sets the error message and stays at lock", async () => {
      vi.mocked(approveFakeEth).mockResolvedValue(undefined as never);
      vi.mocked(lockFakeEth).mockRejectedValue(new Error("user rejected lock"));

      const { result } = renderHook(() => useSellFlow(ACCOUNT));
      await act(async () => {});
      await act(async () => {
        await result.current.lockEth(10n ** 18n);
      });

      expect(result.current.step).toBe("lock");
      expect(result.current.error).toBe("user rejected lock");
      expect(result.current.loading).toBe(false);
      expect(result.current.txHash).toBeUndefined();
      expect(lockFromReceipt).not.toHaveBeenCalled();
      expect(stored().step).toBe("lock");
    });

    it("lockEth shows the pinned address and stays at the lock step when the SDK rejects with the pin mismatch", async () => {
      const pinned = "0x" + "77".repeat(20);
      const message = `LockBox address mismatch: Aptos pins ${pinned}, but this client is configured with ${"0x" + "11".repeat(20)}. Aptos accepts locks only in ${pinned}. Refusing to approve or lock.`;
      vi.mocked(approveFakeEth).mockRejectedValueOnce(new Error(message));

      const { result } = renderHook(() => useSellFlow(ACCOUNT));
      await act(async () => {});
      await act(async () => {
        await result.current.lockEth(10n ** 18n);
      });

      expect(result.current.step).toBe("lock");
      expect(result.current.error).toBe(message);
      expect(result.current.error).toContain(pinned);
      expect(result.current.loading).toBe(false);
      expect(lockFakeEth).not.toHaveBeenCalled();
      expect(stored().step).toBe("lock");
    });

    it("lockEth on another host: sends no approve or lock and shows the expected SIWE domain", async () => {
      vi.mocked(assertSiweDomain).mockRejectedValueOnce(
        new Error(
          "This page runs on evil.example, but lock receipts belong to accounts of localhost:3000. Open the app on localhost:3000 before you lock tokens.",
        ),
      );

      const { result } = renderHook(() => useSellFlow(ACCOUNT));
      await act(async () => {});
      await act(async () => {
        await result.current.lockEth(10n ** 18n);
      });

      expect(assertSiweDomain).toHaveBeenCalledWith(window.location.host);
      expect(approveFakeEth).not.toHaveBeenCalled();
      expect(lockFakeEth).not.toHaveBeenCalled();
      expect(result.current.step).toBe("lock");
      expect(result.current.error).toContain("localhost:3000");
      expect(result.current.loading).toBe(false);
    });

    it("submitProof error: sets the error message and stays at submitting-proof", async () => {
      vi.mocked(generateLockedBalanceProof).mockResolvedValue(PROOF);
      vi.mocked(getRegisterLockPayload).mockReturnValue({
        fn: "register_lock",
      } as never);
      vi.mocked(submitNativeTransaction).mockRejectedValue(
        new Error("SIWE signature rejected"),
      );
      persist(LOCKED);

      const { result } = renderHook(() => useSellFlow(ACCOUNT));
      await act(async () => {});
      await act(async () => {
        await result.current.generateProof();
      });
      await act(async () => {
        await result.current.submitProof();
      });

      expect(result.current.step).toBe("submitting-proof");
      expect(result.current.error).toBe("SIWE signature rejected");
      expect(result.current.loading).toBe(false);
      expect(result.current.lockId).toBeUndefined();
      // The proof survives the failure so the user can retry.
      expect(result.current.proof).toBe(PROOF);
    });
  });
});
