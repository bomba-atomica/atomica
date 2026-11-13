/**
 * useSellFlow — 7-step sell flow state machine
 *
 * Manages the full seller journey:
 *   connect → lock → confirming → generating-proof → submitting-proof
 *   → creating-auction → monitoring
 *
 * State is persisted to localStorage keyed by wallet address so the user
 * can resume after a page reload.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import type { LockedBalanceProof } from "@atomica/sdk/ethereum/proofs";
import {
  approveFakeEth,
  currentWindowId,
  lockBinding,
  lockFakeEth,
  lockFromReceipt,
  reclaimLock,
} from "@atomica/sdk/ethereum";
import { getChainConfig } from "@atomica/sdk/chain-config";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";
// SCOUT(#243) REMOVE: drop the registerTimelock import.
import {
  assertSiweDomain,
  getRegisterLockPayload,
  getCreateAuctionPayload,
  registerTimelock,
} from "@atomica/sdk/aptos";
import { submitNativeTransaction } from "@atomica/sdk";
import { aptos } from "@atomica/sdk/aptos";
import { proveLock } from "./proveLock";
// ── Types ─────────────────────────────────────────────────────────────────────

export type SellFlowStep =
  | "connect"
  | "lock"
  | "confirming"
  | "generating-proof"
  | "submitting-proof"
  | "creating-auction"
  | "monitoring";

/** Persisted subset — stored in localStorage (no proof: too large) */
interface PersistedState {
  step: SellFlowStep;
  txHash?: string;
  lockBlock?: number;
  lockNonce?: string; // bigint as string
  windowId?: string; // bigint as string
  lockId?: string; // hex string
  auctionEndTime?: number;
  // Saved state from older builds may still hold a reserve price key. The loader
  // ignores it, and the next save drops it: there is no reserve price.
  amount?: string; // bigint as string
  unlockTime?: number;
}

export interface SellFlowState {
  step: SellFlowStep;
  txHash?: string;
  lockBlock?: number;
  blockConfirmed: boolean;
  proof?: LockedBalanceProof; // not persisted
  /** LockBox nonce of the lock: names the lock and its Aptos receipt */
  lockNonce?: bigint;
  /** Auction window the lock is bound to (LockBox lock field) */
  windowId?: bigint;
  lockId?: string;
  auctionEndTime?: number;
  // SCOUT(#217) EDIT: holds micro-dollars today (Step2Lock parses with 6 decimals).
  amount?: bigint;
  /** The lock's deadline (unix seconds): after it, anyone may reclaim it to the seller */
  unlockTime?: number;
  error?: string; // not persisted (transient)
  loading: boolean;
}

export interface SellFlowActions {
  /** Step 2: approve + lock FakeETH. amount in wei. */
  lockEth: (amount: bigint) => Promise<void>;
  /** Step 4: generate storage proof for the confirmed lock block */
  generateProof: () => Promise<void>;
  /** Step 5: submit proof to Aptos → creates LockReceipt */
  submitProof: () => Promise<void>;
  // SCOUT(#243) EDIT: createAuction sends one transaction.
  /** Step 6: register the window timelock, then create the auction (consumes the LockReceipt) */
  createAuction: () => Promise<void>;
  /** Return the lock to the seller after its deadline (LockBox.reclaim) */
  cancelAndUnlock: () => Promise<void>;
  /** Hard reset — clears localStorage and returns to connect step */
  reset: () => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const CONFIRMATION_TARGET = 1; // Demo: 1 block; MVP: 64

// ── Persistence helpers ───────────────────────────────────────────────────────

function storageKey(address: string): string {
  return `sell-flow-${address.toLowerCase()}`;
}

function saveState(address: string, state: PersistedState): void {
  try {
    localStorage.setItem(storageKey(address), JSON.stringify(state));
  } catch {
    // quota exceeded — ignore
  }
}

function loadState(address: string): PersistedState | null {
  try {
    const raw = localStorage.getItem(storageKey(address));
    if (!raw) return null;
    return JSON.parse(raw) as PersistedState;
  } catch {
    return null;
  }
}

function clearState(address: string): void {
  localStorage.removeItem(storageKey(address));
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useSellFlow(
  account: string | null,
): SellFlowState & SellFlowActions {
  const [state, setState] = useState<SellFlowState>(() => {
    if (!account)
      return { step: "connect", blockConfirmed: false, loading: false };

    const persisted = loadState(account);
    if (!persisted)
      return { step: "lock", blockConfirmed: false, loading: false };

    return {
      step: persisted.step,
      txHash: persisted.txHash,
      lockBlock: persisted.lockBlock,
      lockNonce: persisted.lockNonce ? BigInt(persisted.lockNonce) : undefined,
      windowId: persisted.windowId ? BigInt(persisted.windowId) : undefined,
      blockConfirmed: false, // will be re-checked on mount
      lockId: persisted.lockId,
      auctionEndTime: persisted.auctionEndTime,
      amount: persisted.amount ? BigInt(persisted.amount) : undefined,
      unlockTime: persisted.unlockTime,
      loading: false,
    };
  });

  // Ref to latest proof (not stored in state to avoid re-renders from large objects)
  const proofRef = useRef<LockedBalanceProof | undefined>(undefined);

  // Track the previous account so we can skip persisting during account transitions
  const prevAccountRef = useRef<string | null>(account);

  // When account changes, reload persisted state (must run BEFORE persist effect)
  useEffect(() => {
    if (!account) {
      setState({ step: "connect", blockConfirmed: false, loading: false });
      prevAccountRef.current = account;
      return;
    }
    const persisted = loadState(account);
    if (!persisted) {
      setState({ step: "lock", blockConfirmed: false, loading: false });
    } else {
      setState({
        step: persisted.step,
        txHash: persisted.txHash,
        lockBlock: persisted.lockBlock,
        lockNonce: persisted.lockNonce
          ? BigInt(persisted.lockNonce)
          : undefined,
        windowId: persisted.windowId ? BigInt(persisted.windowId) : undefined,
        blockConfirmed: false,
        lockId: persisted.lockId,
        auctionEndTime: persisted.auctionEndTime,
        amount: persisted.amount ? BigInt(persisted.amount) : undefined,
        unlockTime: persisted.unlockTime,
        loading: false,
      });
    }
    prevAccountRef.current = account;
  }, [account]);

  // Persist whenever persisted fields change (skip when account just changed)
  useEffect(() => {
    if (!account) return;
    // Skip persisting right after an account change — the reload effect handles
    // loading the correct state, and persisting here would overwrite it.
    if (prevAccountRef.current !== account) return;
    const persisted: PersistedState = {
      step: state.step,
      txHash: state.txHash,
      lockBlock: state.lockBlock,
      lockNonce: state.lockNonce?.toString(),
      windowId: state.windowId?.toString(),
      lockId: state.lockId,
      auctionEndTime: state.auctionEndTime,
      amount: state.amount?.toString(),
      unlockTime: state.unlockTime,
    };
    saveState(account, persisted);
  }, [
    account,
    state.step,
    state.txHash,
    state.lockBlock,
    state.lockNonce,
    state.windowId,
    state.lockId,
    state.auctionEndTime,
    state.amount,
    state.unlockTime,
  ]);

  // Poll for block confirmations when in 'confirming' step
  useEffect(() => {
    if (state.step !== "confirming" || !state.lockBlock || !account) return;

    let cancelled = false;

    async function checkConfirmations() {
      const config = getChainConfig();
      const provider = new ethers.JsonRpcProvider(config.ethereum.rpcUrl);

      const poll = async () => {
        if (cancelled) return;
        try {
          const latest = await provider.getBlockNumber();
          const confirmations = latest - state.lockBlock!;
          if (confirmations >= CONFIRMATION_TARGET) {
            if (!cancelled) {
              setState((s) => ({
                ...s,
                step: "generating-proof",
                blockConfirmed: true,
              }));
            }
          } else {
            setTimeout(poll, 3000);
          }
        } catch {
          setTimeout(poll, 5000);
        }
      };

      poll();
    }

    checkConfirmations();
    return () => {
      cancelled = true;
    };
  }, [state.step, state.lockBlock, account]);

  // ── Actions ───────────────────────────────────────────────────────────────

  const setError = useCallback((error: string) => {
    setState((s) => ({ ...s, error, loading: false }));
  }, []);

  // SCOUT(#218) EDIT: a lock below the new minimum, or a seller lock past the cap, locks on Ethereum and then aborts in create_auction; pre-check with the SDK limits view reader, or the lock waits for reclaim.
  const lockEth = useCallback(
    async (amount: bigint) => {
      if (!account || !window.ethereum) return;
      setState((s) => ({ ...s, loading: true, error: undefined }));

      try {
        // A receipt belongs to the seller's account of the pinned SIWE
        // domain. Refuse to lock from any other host: Aptos would never let
        // this wallet claim the lock.
        await assertSiweDomain(window.location.host);
        const provider = new ethers.BrowserProvider(window.ethereum);

        // Step 1: Approve
        setState((s) => ({ ...s, loading: true }));
        await approveFakeEth(provider, amount);

        // Step 2: Lock into the current window. LockBox computes its
        // deadline, lockDeadline(windowId) = auction::eth_lock_deadline:
        // after it, anyone may reclaim the lock to the seller. LockBox
        // reverts (WindowClosed) if the window closed by the time the lock
        // is mined, so a wrong client clock fails here with no funds moved.
        const binding = lockBinding(
          currentWindowId(BigInt(Math.floor(Date.now() / 1000))),
          LAUNCH_PAIR_BCS,
        );
        const receipt = await lockFakeEth(provider, amount, binding);
        const lock = lockFromReceipt(receipt);
        const lockNonce = lock.nonce;
        const unlockTime = Number(lock.deadline);

        setState((s) => ({
          ...s,
          step: "confirming",
          txHash: receipt.hash,
          lockBlock: receipt.blockNumber ?? undefined,
          lockNonce,
          windowId: lock.windowId,
          amount,
          unlockTime,
          loading: false,
        }));
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      }
    },
    [account, setError],
  );

  const generateProof = useCallback(async () => {
    if (
      !account ||
      !state.lockBlock ||
      state.lockNonce === undefined ||
      state.windowId === undefined ||
      !state.amount
    )
      return;
    setState((s) => ({
      ...s,
      step: "generating-proof",
      loading: true,
      error: undefined,
    }));

    try {
      // Prove at a certified block that covers the lock (shared with the
      // bidder's FakeUSD lock step).
      const proof = await proveLock(
        {
          depositor: account,
          token: getChainConfig().ethereum.fakeETH,
          nonce: state.lockNonce,
          amount: state.amount,
          // lockBinding carries the computed deadline the commitment binds.
          ...lockBinding(state.windowId, LAUNCH_PAIR_BCS),
        },
        state.lockBlock,
      );

      proofRef.current = proof;

      setState((s) => ({
        ...s,
        step: "submitting-proof",
        loading: false,
        proof,
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [
    account,
    state.lockBlock,
    state.lockNonce,
    state.windowId,
    state.amount,
    setError,
  ]);

  const submitProof = useCallback(async () => {
    if (!account || !proofRef.current) return;
    setState((s) => ({
      ...s,
      step: "submitting-proof",
      loading: true,
      error: undefined,
    }));

    try {
      const proof = proofRef.current;
      // The asset defaults to FakeETH: the seller's receipt type.
      const payload = getRegisterLockPayload(proof);
      await submitNativeTransaction(aptos, account, payload);

      // The receipt id is the LockBox lock id (issue 171), not the block.
      const lockId = proof.lockId;

      // Go directly to creating-auction — no mint step needed.
      // auction::create_auction consumes the LockReceipt directly.
      setState((s) => ({
        ...s,
        step: "creating-auction",
        lockId,
        loading: false,
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [account, setError]);

  const createAuction = useCallback(async () => {
    if (!account || !state.lockId) return;
    setState((s) => ({
      ...s,
      step: "creating-auction",
      loading: true,
      error: undefined,
    }));

    try {
      const lockIdBytes = ethers.getBytes(state.lockId);
      // The window the lock is bound to. Older persisted state has none:
      // fall back to the current_window_id formula on the client clock.
      const windowId =
        state.windowId ??
        currentWindowId(BigInt(Math.floor(Date.now() / 1000)));
      // The window's pair: the launch pair, the bytes the lock is bound to.
      const pairBcs = LAUNCH_PAIR_BCS;
      // SCOUT(#243) REMOVE: registerTimelock and the local one hour auctionEndTime; read the window deadline from the new view instead.
      // SCOUT(#225) EDIT: this call aborts with E_NOT_REGISTRAR once the validator image has the registrar check.
      // create_auction records the timelock that opens the window's bids, so
      // register it first. Its deadline is the auction end.
      const auctionEndTime = Math.floor(Date.now() / 1000) + 3600;
      const timelockId = await registerTimelock(
        account,
        BigInt(auctionEndTime) * 1_000_000n,
      );

      // SCOUT(#243) EDIT: drop timelockId.
      const payload = getCreateAuctionPayload(
        windowId,
        pairBcs,
        lockIdBytes,
        timelockId,
      );
      await submitNativeTransaction(aptos, account, payload);

      setState((s) => ({
        ...s,
        step: "monitoring",
        auctionEndTime,
        loading: false,
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [account, state.lockId, state.windowId, setError]);

  const cancelAndUnlock = useCallback(async () => {
    if (
      !account ||
      !window.ethereum ||
      !state.amount ||
      state.lockNonce === undefined ||
      state.windowId === undefined
    )
      return;
    setState((s) => ({ ...s, loading: true, error: undefined }));

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      // SCOUT(#222) EDIT: reclaim keeps its rule; a lock whose leaf is unpayable needs reclaimUnpayable, which no UI calls.
      // Reverts before the lock deadline (DeadlineNotReached), and once the
      // window's outcome is recorded on Ethereum (that path is releaseByOutcome).
      await reclaimLock(provider, {
        depositor: account,
        token: getChainConfig().ethereum.fakeETH,
        nonce: state.lockNonce,
        amount: state.amount,
        // The Lock struct's deadline is LockBox.lockDeadline(windowId), as lockBinding returns it.
        // The same pair bytes as the lock binding.
        ...lockBinding(state.windowId, LAUNCH_PAIR_BCS),
      });

      if (account) clearState(account);
      setState({ step: "lock", blockConfirmed: false, loading: false });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [account, state.amount, state.lockNonce, state.windowId, setError]);

  const reset = useCallback(() => {
    if (account) clearState(account);
    proofRef.current = undefined;
    setState({ step: "lock", blockConfirmed: false, loading: false });
  }, [account]);

  return {
    ...state,
    proof: state.proof,
    lockEth,
    generateProof,
    submitProof,
    createAuction,
    cancelAndUnlock,
    reset,
  };
}
