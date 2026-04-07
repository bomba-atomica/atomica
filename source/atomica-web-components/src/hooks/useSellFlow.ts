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
import { generateLockedBalanceProof } from "@atomica/sdk/ethereum";
import type { LockedBalanceProof } from "@atomica/sdk/ethereum";
import {
  approveFakeEth,
  lockFakeEth,
  getUnlockTime,
  withdrawFakeEth,
} from "@atomica/sdk/ethereum";
import { getChainConfig } from "@atomica/sdk/chain-config";
import {
  getRegisterLockPayload,
  getCreateAuctionPayload,
} from "@atomica/sdk/aptos";
import { submitNativeTransaction } from "@atomica/sdk";
import { aptos } from "@atomica/sdk/aptos";
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
  lockId?: string; // hex string
  auctionEndTime?: number;
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
  lockId?: string;
  auctionEndTime?: number;
  minPrice?: bigint;
  amount?: bigint;
  unlockTime?: number;
  error?: string; // not persisted (transient)
  loading: boolean;
}

export interface SellFlowActions {
  /** Step 2: approve + lock FakeETH. amount and minPrice in wei. */
  lockEth: (amount: bigint, minPrice: bigint) => Promise<void>;
  /** Step 4: generate storage proof for the confirmed lock block */
  generateProof: () => Promise<void>;
  /** Step 5: submit proof to Aptos → creates LockReceipt */
  submitProof: () => Promise<void>;
  /** Step 6: create auction on Aptos — consumes the LockReceipt */
  createAuction: () => Promise<void>;
  /** Cancel & unlock — only callable when unlockTime has passed */
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

// ── Lock ID helpers ───────────────────────────────────────────────────────────

/**
 * Compute lock_id from a submitted proof.
 * Matches generate_lock_id() in lock_receipt.move:
 *   keccak256(blockHash || contractAddress || userAddress || tokenAddress || storageKey)
 */
function computeLockId(proof: LockedBalanceProof): string {
  const data = Buffer.concat([
    Buffer.from(proof.blockHash.slice(2), "hex"),
    Buffer.from(proof.contractAddress.slice(2), "hex"),
    Buffer.from(proof.userAddress.slice(2), "hex"),
    Buffer.from(proof.tokenAddress.slice(2), "hex"),
    Buffer.from(proof.storageKey.slice(2), "hex"),
  ]);
  return ethers.keccak256(data);
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
      blockConfirmed: false, // will be re-checked on mount
      lockId: persisted.lockId,
      auctionEndTime: persisted.auctionEndTime,
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
        blockConfirmed: false,
        lockId: persisted.lockId,
        auctionEndTime: persisted.auctionEndTime,
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
      lockId: state.lockId,
      auctionEndTime: state.auctionEndTime,
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
    state.lockId,
    state.auctionEndTime,
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

  const lockEth = useCallback(
    async (amount: bigint, minPrice: bigint) => {
      if (!account || !window.ethereum) return;
      setState((s) => ({ ...s, loading: true, error: undefined }));

      try {
        const provider = new ethers.BrowserProvider(window.ethereum);

        // Step 1: Approve
        setState((s) => ({ ...s, loading: true }));
        await approveFakeEth(provider, amount);

        // Step 2: Lock
        const receipt = await lockFakeEth(provider, amount);

        const unlockTime = await getUnlockTime(
          new ethers.JsonRpcProvider(getChainConfig().ethereum.rpcUrl),
          account,
        );

        setState((s) => ({
          ...s,
          step: "confirming",
          txHash: receipt.hash,
          lockBlock: receipt.blockNumber ?? undefined,
          amount,
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
    if (!account || !state.lockBlock) return;
    setState((s) => ({
      ...s,
      step: "generating-proof",
      loading: true,
      error: undefined,
    }));

    try {
      const config = getChainConfig();
      const provider = new ethers.JsonRpcProvider(config.ethereum.rpcUrl);

      const proof = await generateLockedBalanceProof(
        provider,
        config.ethereum.lockBox,
        account,
        config.ethereum.fakeETH,
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
  }, [account, state.lockBlock, setError]);

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
      const payload = getRegisterLockPayload(proof);
      await submitNativeTransaction(aptos, account, payload);

      const lockId = computeLockId(proof);

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
    if (!account || !state.minPrice || !state.lockId) return;
    setState((s) => ({
      ...s,
      step: "creating-auction",
      loading: true,
      error: undefined,
    }));

    try {
      const lockIdBytes = ethers.getBytes(state.lockId);
      // Duration: 1 hour default for demo
      const duration = BigInt(3600);
      // MPK: empty bytes for demo (timelock encryption deferred to Production)
      const mpk = new Uint8Array(0);

      const payload = getCreateAuctionPayload(
        lockIdBytes,
        state.minPrice,
        duration,
        mpk,
      );
      await submitNativeTransaction(aptos, account, payload);

      const auctionEndTime = Math.floor(Date.now() / 1000) + 3600;

      setState((s) => ({
        ...s,
        step: "monitoring",
        auctionEndTime,
        loading: false,
      }));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [account, state.minPrice, state.lockId, setError]);

  const cancelAndUnlock = useCallback(async () => {
    if (!account || !window.ethereum || !state.amount) return;
    setState((s) => ({ ...s, loading: true, error: undefined }));

    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      await withdrawFakeEth(provider, state.amount);

      if (account) clearState(account);
      setState({ step: "lock", blockConfirmed: false, loading: false });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [account, state.amount, setError]);

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
