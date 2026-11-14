/**
 * useWindowRelease — the state and the action behind ReleaseButton, the
 * third step of a trade (open, settle, release).
 *
 * Reads, every `pollIntervalMs` and after each action:
 *   - whether the window settled on Aptos (`isSettled`);
 *   - every lock of the window (`getWindowLockIds`: seller locks, then bid
 *     collateral locks);
 *   - each lock's fields from its `Locked` event (`getLockById`), its LockBox
 *     status (`getLockStatus`) and, once settled, its leaf payouts
 *     (`getLockOutcome`);
 *   - whether LockBox holds the window's outcome root (`getRecordedOutcome`).
 *
 * `release` calls `carryAndReleaseWindow`: it records the window's
 * `AuctionOutcome` on LockBox when it is missing (the carrier finds the event
 * with `findOutcomeEvent`), then closes every lock that is still open with
 * `releaseByOutcome`, or with `reclaimUnpayable` when its leaf is unpayable
 * (`planWindowReleases`). Anyone may call it: no argument names a seller or a
 * bidder, and LockBox checks every proof itself.
 *
 * A leaf may pay less than the lock amount: LockBox sends the remainder to
 * the depositor. The payouts shown are the leaf's, not the whole lock.
 *
 * @see source/atomica-sdk/src/settlement/window-release.ts
 * @see docs/decisions/trustless-v0-1-unwinding.md
 */

import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  getLockOutcome,
  getWindowLockIds,
  isSettled,
} from "@atomica/sdk/aptos";
import { getChainConfig } from "@atomica/sdk/chain-config";
import {
  getLockById,
  getLockStatus,
  getRecordedOutcome,
  LOCK_STATUS,
  type LockFields,
} from "@atomica/sdk/ethereum";
import {
  carryAndReleaseWindow,
  defaultAptosNodes,
  type WindowReleaseResult,
} from "@atomica/sdk/settlement/window-release";

/** Ethereum state of one lock of a window. */
export type WindowLockStatus = "open" | "released" | "reclaimed" | "unknown";

/** One lock of a window, with what its outcome leaf pays. */
export interface WindowLockRelease {
  /** bytes32 lock id (LockBox.getLockId). */
  lockId: string;
  /** Which token the lock holds. */
  asset: "FakeETH" | "FakeUSD";
  /** LockBox.statuses(lockId). */
  status: WindowLockStatus;
  /** Lock amount from its `Locked` event; null when no event was found. */
  amount: bigint | null;
  /** Payouts of the lock's outcome leaf; empty before the window settles. */
  payouts: Array<{ recipient: string; amount: bigint }>;
}

/** What ReleaseButton renders and calls. */
export interface WindowReleaseState {
  /** True once the window settled on Aptos. */
  settled: boolean;
  /** True once LockBox holds the window's outcome root. */
  outcomeRecorded: boolean;
  /** Every lock of the window: seller locks, then bid collateral locks. */
  locks: WindowLockRelease[];
  /** True when no lock of the window is still open. */
  allReleased: boolean;
  /** True until the first read finishes. */
  loading: boolean;
  /** True while `release` runs. */
  releasing: boolean;
  /** Result of the last `release`. */
  result?: WindowReleaseResult;
  error?: string;
  /** Record the outcome if needed, then close every open lock. */
  release: () => Promise<void>;
}

function statusName(code: number): WindowLockStatus {
  if (code === LOCK_STATUS.Open) return "open";
  if (code === LOCK_STATUS.Released) return "released";
  if (code === LOCK_STATUS.Reclaimed) return "reclaimed";
  return "unknown";
}

/**
 * The provider reads go through: the wallet's when one is injected (the same
 * node the release transactions go to), else the configured Ethereum RPC.
 */
function readProvider(): ethers.Provider {
  const injected = (window as unknown as { ethereum?: ethers.Eip1193Provider })
    .ethereum;
  return injected
    ? new ethers.BrowserProvider(injected)
    : new ethers.JsonRpcProvider(getChainConfig().ethereum.rpcUrl);
}

interface WindowRead {
  settled: boolean;
  outcomeRecorded: boolean;
  locks: WindowLockRelease[];
}

async function readWindow(
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<WindowRead> {
  const settled = await isSettled(windowId, pairBcs);
  const ids = await getWindowLockIds(windowId, pairBcs);
  const entries = [
    ...ids.sellers.map((id) => ({ id, asset: "FakeETH" as const })),
    ...ids.collateral.map((id) => ({ id, asset: "FakeUSD" as const })),
  ];
  const provider = readProvider();
  let firstLock: LockFields | null = null;
  const locks: WindowLockRelease[] = [];
  for (const { id, asset } of entries) {
    const [fields, code, outcome] = await Promise.all([
      getLockById(provider, id),
      getLockStatus(provider, id),
      settled ? getLockOutcome(asset, id) : Promise.resolve(null),
    ]);
    firstLock ??= fields;
    locks.push({
      lockId: id,
      asset,
      status: statusName(code),
      amount: fields?.amount ?? null,
      payouts: outcome
        ? outcome.recipients.map((recipient, i) => ({
            recipient,
            amount: outcome.amounts[i],
          }))
        : [],
    });
  }
  const outcomeRecorded = firstLock
    ? (await getRecordedOutcome(provider, firstLock)).recorded
    : false;
  return { settled, outcomeRecorded, locks };
}

export function useWindowRelease(
  windowId: bigint | null,
  pairBcs: Uint8Array | null,
  account: string | null,
  pollIntervalMs = 10_000,
): WindowReleaseState {
  const [read, setRead] = useState<WindowRead | null>(null);
  const [error, setError] = useState<string | undefined>(undefined);
  const [releasing, setReleasing] = useState(false);
  const [result, setResult] = useState<WindowReleaseResult | undefined>(
    undefined,
  );
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (windowId === null || pairBcs === null) return;
    let cancelled = false;
    async function poll() {
      try {
        const r = await readWindow(windowId!, pairBcs!);
        if (!cancelled) {
          setRead(r);
          setError(undefined);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }
    }
    poll();
    const timer = setInterval(poll, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [windowId, pairBcs, pollIntervalMs, refresh]);

  const locks = read?.locks ?? [];
  const anyOpen = locks.some((l) => l.status === "open");

  const release = useCallback(async () => {
    if (!account || windowId === null || pairBcs === null) return;
    setReleasing(true);
    setError(undefined);
    try {
      // Re-read first: a lock another wallet closed meanwhile needs no
      // transaction, and with no open lock nothing is sent at all.
      const fresh = await readWindow(windowId, pairBcs);
      setRead(fresh);
      if (!fresh.settled || !fresh.locks.some((l) => l.status === "open")) {
        return;
      }
      const provider = new ethers.BrowserProvider(
        (window as unknown as { ethereum: ethers.Eip1193Provider }).ethereum,
      );
      setResult(
        await carryAndReleaseWindow({
          signer: await provider.getSigner(),
          provider,
          windowId,
          pairBcs,
          nodes: defaultAptosNodes(),
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setReleasing(false);
      setRefresh((n) => n + 1);
    }
  }, [account, windowId, pairBcs]);

  return {
    settled: read?.settled ?? false,
    outcomeRecorded: read?.outcomeRecorded ?? false,
    locks,
    allReleased: read !== null && !anyOpen,
    loading: read === null && error === undefined,
    releasing,
    result,
    error,
    release,
  };
}
