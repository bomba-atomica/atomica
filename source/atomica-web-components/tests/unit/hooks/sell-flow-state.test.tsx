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
// SCOUT(#220) EDIT: old-formula fixture pair 83075 and 1_794_700_800 (mock values only).
// SCOUT(#221) EDIT: the lockBinding and lockFromReceipt mocks carry a deadline; the asserts on lockFakeEth, the proof input and reclaimLock below repeat it.
vi.mock("@atomica/sdk/ethereum", () => ({
  approveFakeEth: vi.fn(),
  lockFakeEth: vi.fn(),
  currentWindowId: vi.fn(() => 83075n),
  lockBinding: vi.fn((windowId: bigint) => ({
    windowId,
    pairHash: "0x" + "ee".repeat(32),
    deadline: 1_794_700_800n,
  })),
  lockFromReceipt: vi.fn(() => ({
    lockId: "0x" + "dd".repeat(32),
    depositor: "0x1234567890123456789012345678901234567890",
    token: "0x" + "22".repeat(20),
    nonce: 3n,
    amount: 10n ** 18n,
    windowId: 83075n,
    pairHash: "0x" + "ee".repeat(32),
    deadline: 1_794_700_800n,
  })),
  reclaimLock: vi.fn(),
}));
vi.mock("@atomica/sdk/ethereum/proofs", () => ({
  generateLockedBalanceProof: vi.fn(),
}));
// SCOUT(#243) REMOVE: the registerTimelock mock.
vi.mock("@atomica/sdk/aptos", () => ({
  getRegisterLockPayload: vi.fn(),
  getCreateAuctionPayload: vi.fn(),
  registerTimelock: vi.fn(),
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
  getRegisterLockPayload,
  getCreateAuctionPayload,
  registerTimelock,
  waitForCertifiedBlock,
} from "@atomica/sdk/aptos";
import { submitNativeTransaction } from "@atomica/sdk";

const ACCOUNT = "0x1234567890123456789012345678901234567890";
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
  windowId: "83075",
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

  // SCOUT(#241) EDIT: minPrice is ignored on resume.
  // SCOUT(#217) EDIT: the minPrice fixture is micro-dollars.
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

    // SCOUT(#241) EDIT: lockEth takes the amount only (also in the two error cases below).
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
        await result.current.lockEth(10n ** 18n, 2_000_000_000n);
      });

      expect(approveFakeEth).toHaveBeenCalledWith(
        expect.anything(),
        10n ** 18n,
      );
      // The lock is bound to the current window, with its eth_lock_deadline.
      expect(lockFakeEth).toHaveBeenCalledWith(expect.anything(), 10n ** 18n, {
        windowId: 83075n,
        pairHash: "0x" + "ee".repeat(32),
        deadline: 1_794_700_800n,
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
      expect(result.current.minPrice).toBe(2_000_000_000n);
      expect(result.current.windowId).toBe(83075n);
      // unlockTime is the lock deadline: after it anyone may reclaim the lock.
      expect(result.current.unlockTime).toBe(1_794_700_800);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeUndefined();
      expect(stored()).toMatchObject({
        step: "confirming",
        txHash: "0xlocktx",
        lockBlock: 77,
        lockNonce: "3",
        windowId: "83075",
        amount: "1000000000000000000",
        minPrice: "2000000000",
      });
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
          windowId: 83075n,
          pairHash: "0x" + "ee".repeat(32),
          deadline: 1_794_700_800n,
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

    // SCOUT(#243) REMOVE: the timelock registration asserts and the local one hour end time.
    // SCOUT(#241) EDIT: no minPrice in the persisted state or in the payload.
    // SCOUT(#238) EDIT: no mpk argument.
    // SCOUT(#224) EDIT: pairBcs equals the launch pair, not empty bytes.
    it("createAuction: registers the timelock first, then submits the 6-argument create_auction", async () => {
      vi.mocked(registerTimelock).mockResolvedValue(42n);
      vi.mocked(getCreateAuctionPayload).mockReturnValue({
        fn: "create_auction",
      } as never);
      vi.mocked(submitNativeTransaction).mockResolvedValue(undefined as never);
      persist({
        step: "creating-auction",
        lockId: EXPECTED_LOCK_ID,
        minPrice: "2000000000",
        amount: "1000000000000000000",
      });

      const { result } = renderHook(() => useSellFlow(ACCOUNT));
      await act(async () => {});
      const before = Math.floor(Date.now() / 1000);
      await act(async () => {
        await result.current.createAuction();
      });
      const after = Math.floor(Date.now() / 1000);

      // The timelock is registered before the payload is built or submitted.
      expect(registerTimelock).toHaveBeenCalledTimes(1);
      const registerOrder =
        vi.mocked(registerTimelock).mock.invocationCallOrder[0];
      expect(registerOrder).toBeLessThan(
        vi.mocked(getCreateAuctionPayload).mock.invocationCallOrder[0],
      );
      expect(registerOrder).toBeLessThan(
        vi.mocked(submitNativeTransaction).mock.invocationCallOrder[0],
      );
      // Its deadline is the auction end, in microseconds.
      const [registerAccount, deadlineUs] =
        vi.mocked(registerTimelock).mock.calls[0];
      expect(registerAccount).toBe(ACCOUNT);
      expect(deadlineUs).toBe(
        BigInt(result.current.auctionEndTime!) * 1_000_000n,
      );

      expect(getCreateAuctionPayload).toHaveBeenCalledTimes(1);
      const args = vi.mocked(getCreateAuctionPayload).mock.calls[0];
      expect(args).toHaveLength(6);
      // SCOUT(#241) EDIT: the payload loses minPrice.
      // SCOUT(#243) EDIT: the payload loses timelockId.
      // SCOUT(#238) EDIT: the payload loses mpk; three arguments remain.
      const [windowId, pairBcs, lockIdBytes, minPrice, timelockId, mpk] = args;
      expect(typeof windowId).toBe("bigint");
      expect(pairBcs).toEqual(new Uint8Array(0));
      expect(lockIdBytes).toEqual(ethers.getBytes(EXPECTED_LOCK_ID));
      expect(minPrice).toBe(2_000_000_000n);
      expect(timelockId).toBe(42n);
      expect(mpk).toEqual(new Uint8Array(0));
      expect(submitNativeTransaction).toHaveBeenCalledTimes(1);
      expect(submitNativeTransaction).toHaveBeenCalledWith(aptos, ACCOUNT, {
        fn: "create_auction",
      });
      expect(result.current.step).toBe("monitoring");
      expect(result.current.auctionEndTime).toBeGreaterThanOrEqual(
        before + 3600,
      );
      expect(result.current.auctionEndTime).toBeLessThanOrEqual(after + 3600);
      expect(stored().step).toBe("monitoring");
    });

    // SCOUT(#243) REMOVE: this case.
    it("createAuction: does not submit create_auction when timelock registration fails", async () => {
      vi.mocked(registerTimelock).mockRejectedValue(
        new Error("E_IBE_NOT_READY"),
      );
      persist({
        step: "creating-auction",
        lockId: EXPECTED_LOCK_ID,
        minPrice: "2000000000",
      });

      const { result } = renderHook(() => useSellFlow(ACCOUNT));
      await act(async () => {});
      await act(async () => {
        await result.current.createAuction();
      });

      expect(getCreateAuctionPayload).not.toHaveBeenCalled();
      expect(submitNativeTransaction).not.toHaveBeenCalled();
      expect(result.current.step).toBe("creating-auction");
      expect(result.current.error).toBe("E_IBE_NOT_READY");
    });

    it("cancelAndUnlock: reclaims the lock to the seller and resets the flow to lock", async () => {
      vi.mocked(reclaimLock).mockResolvedValue(undefined as never);
      persist({
        step: "creating-auction",
        lockId: EXPECTED_LOCK_ID,
        lockNonce: "3",
        windowId: "83075",
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
        windowId: 83075n,
        pairHash: "0x" + "ee".repeat(32),
        deadline: 1_794_700_800n,
      });
      expect(result.current.step).toBe("lock");
      expect(result.current.lockId).toBeUndefined();
      expect(result.current.amount).toBeUndefined();
      expect(stored()).toEqual({ step: "lock" });
    });

    // SCOUT(#234) EDIT: this existing case already covers a rejected lock; extend it with the pin mismatch message (the issue names SellFlow.error.test.tsx instead).
    it("lockEth error: sets the error message and stays at lock", async () => {
      vi.mocked(approveFakeEth).mockResolvedValue(undefined as never);
      vi.mocked(lockFakeEth).mockRejectedValue(new Error("user rejected lock"));

      const { result } = renderHook(() => useSellFlow(ACCOUNT));
      await act(async () => {});
      await act(async () => {
        await result.current.lockEth(10n ** 18n, 2_000_000_000n);
      });

      expect(result.current.step).toBe("lock");
      expect(result.current.error).toBe("user rejected lock");
      expect(result.current.loading).toBe(false);
      expect(result.current.txHash).toBeUndefined();
      expect(lockFromReceipt).not.toHaveBeenCalled();
      expect(stored().step).toBe("lock");
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

  it.todo("SCOUT(#243) createAuction submits exactly one transaction and never calls registerTimelock");
  it.todo("SCOUT(#241) createAuction runs when the saved state has no minimum price");
  it.todo("SCOUT(#234) lockEth shows the pinned address and stays at the lock step when the SDK rejects with the pin mismatch");
});
