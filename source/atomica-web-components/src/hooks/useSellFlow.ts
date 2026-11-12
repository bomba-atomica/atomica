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
  // SCOUT(#241) EDIT: keep reading saved state that still has minPrice, and ignore it.
  minPrice?: string; // bigint as string
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
  // SCOUT(#241) REMOVE: minPrice leaves the flow state.
  // SCOUT(#217) EDIT: holds micro-dollars today (Step2Lock parses with 6 decimals).
  minPrice?: bigint;
  amount?: bigint;
  /** The lock's deadline (unix seconds): after it, anyone may reclaim it to the seller */
  unlockTime?: number;
  error?: string; // not persisted (transient)
  loading: boolean;
}

export interface SellFlowActions {
  // SCOUT(#241) EDIT: lockEth takes the amount only.
  /** Step 2: approve + lock FakeETH. amount and minPrice in wei. */
  lockEth: (amount: bigint, minPrice: bigint) => Promise<void>;
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

// SCOUT(#224) EDIT: SELL_PAIR_BCS becomes the SDK launch pair constant; a lock made with the empty bytes cannot join a window.
/** Pair BCS of the sell flow's window (scaffold: empty, as in createAuction). */
const SELL_PAIR_BCS = new Uint8Array(0);

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
      // SCOUT(#241) REMOVE: restore of minPrice (first of two copies of this block).
      minPrice: persisted.minPrice ? BigInt(persisted.minPrice) : undefined,
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
        // SCOUT(#241) REMOVE: restore of minPrice (second copy).
        minPrice: persisted.minPrice ? BigInt(persisted.minPrice) : undefined,
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
      // SCOUT(#241) REMOVE: minPrice is no longer persisted.
      minPrice: state.minPrice?.toString(),
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
    // SCOUT(#241) REMOVE: minPrice leaves the persisted-state dependency list.
    state.minPrice,
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

  // SCOUT(#241) EDIT: drop the minPrice parameter.
  // SCOUT(#218) EDIT: a lock below the new minimum, or a seller lock past the cap, locks on Ethereum and then aborts in create_auction; pre-check with the SDK limits view reader, or the lock waits for reclaim.
  const lockEth = useCallback(
    async (amount: bigint, minPrice: bigint) => {
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

        // SCOUT(#221) EDIT: the binding loses the caller deadline; LockBox.lock reverts for a closed window or one more than one ahead, so a wrong client clock fails here.
        // Step 2: Lock into the current window. Its deadline is
        // auction::eth_lock_deadline(windowId): after it, anyone may
        // reclaim the lock to the seller.
        const binding = lockBinding(
          currentWindowId(BigInt(Math.floor(Date.now() / 1000))),
          SELL_PAIR_BCS,
        );
        const receipt = await lockFakeEth(provider, amount, binding);
        const lock = lockFromReceipt(receipt);
        const lockNonce = lock.nonce;
        // SCOUT(#221) EDIT: the Locked event still carries the computed deadline; no change if lockFromReceipt keeps the field.
        const unlockTime = Number(lock.deadline);

        setState((s) => ({
          ...s,
          step: "confirming",
          txHash: receipt.hash,
          lockBlock: receipt.blockNumber ?? undefined,
          lockNonce,
          windowId: lock.windowId,
          amount,
          // SCOUT(#241) REMOVE: lockEth stores no minPrice.
          minPrice,
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
      // SCOUT(#221) EDIT: lockBinding spreads a deadline into the proof input; follow the SDK shape.
      const proof = await proveLock(
        {
          depositor: account,
          token: getChainConfig().ethereum.fakeETH,
          nonce: state.lockNonce,
          amount: state.amount,
          // SCOUT(#221) EDIT: the proof input takes the lock fields; follow the SDK lockBinding shape once the caller deadline goes.
          // SCOUT(#224) EDIT: SELL_PAIR_BCS becomes the launch pair, so this binding and the lock stay equal.
          ...lockBinding(state.windowId, SELL_PAIR_BCS),
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
      // SCOUT(#221) EDIT: the payload drops the deadline argument inside the SDK; no change here.
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
    // SCOUT(#241) EDIT: this guard returns early when minPrice is missing or zero; drop the minPrice test or createAuction never runs.
    if (!account || !state.minPrice || !state.lockId) return;
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
      // SCOUT(#224) EDIT: use the launch pair.
      // pairBcs: empty bytes for scaffold
      const pairBcs = SELL_PAIR_BCS;
      // SCOUT(#238) REMOVE: the mpk argument.
      // MPK: empty bytes for scaffold (create_auction does not read it yet)
      const mpk = new Uint8Array(0);

      // SCOUT(#243) REMOVE: registerTimelock and the local one hour auctionEndTime; read the window deadline from the new view instead.
      // SCOUT(#225) EDIT: this call aborts with E_NOT_REGISTRAR once the validator image has the registrar check.
      // create_auction records the timelock that opens the window's bids, so
      // register it first. Its deadline is the auction end.
      const auctionEndTime = Math.floor(Date.now() / 1000) + 3600;
      const timelockId = await registerTimelock(
        account,
        BigInt(auctionEndTime) * 1_000_000n,
      );

      // SCOUT(#241) EDIT: drop state.minPrice.
      // SCOUT(#243) EDIT: drop timelockId.
      // SCOUT(#238) EDIT: drop mpk.
      const payload = getCreateAuctionPayload(
        windowId,
        pairBcs,
        lockIdBytes,
        state.minPrice,
        timelockId,
        mpk,
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
    // SCOUT(#241) EDIT: drop state.minPrice from this dependency list.
  }, [account, state.minPrice, state.lockId, state.windowId, setError]);

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
      // SCOUT(#221) EDIT: reclaim still takes the full lock struct with its deadline; follow the SDK lockBinding shape.
      // SCOUT(#222) EDIT: reclaim keeps its rule; a lock whose leaf is unpayable needs reclaimUnpayable, which no UI calls.
      // Reverts before the lock deadline (DeadlineNotReached), and once the
      // window's outcome is recorded on Ethereum (that path is releaseByOutcome).
      await reclaimLock(provider, {
        depositor: account,
        token: getChainConfig().ethereum.fakeETH,
        nonce: state.lockNonce,
        amount: state.amount,
        // SCOUT(#221) EDIT: reclaim passes the full Lock struct; its deadline is the computed lockDeadline(windowId), which lockBinding must still return.
        // SCOUT(#224) EDIT: the reclaim binding must use the same pair bytes as the lock, so change both together.
        ...lockBinding(state.windowId, SELL_PAIR_BCS),
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
