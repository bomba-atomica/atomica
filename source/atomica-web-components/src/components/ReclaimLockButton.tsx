import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  getReclaimEligibility,
  reclaimLock,
  type LockFields,
  type ReclaimEligibility,
} from "@atomica/sdk/ethereum";
import { useWallet } from "../context/WalletContext";

export interface ReclaimLockButtonProps {
  /** The lock, with its fields from its `Locked` event (`getLocks`, `getLockById`). */
  lock: LockFields;
  /** How often to re-read eligibility. Defaults to 10 000 ms. */
  pollIntervalMs?: number;
  /** Called after the reclaim transaction is mined. */
  onReclaimed?: (txHash: string) => void;
}

const REASON_TEXT: Record<ReclaimEligibility, string> = {
  eligible:
    "The deadline passed with no proven settlement. Anyone may return it.",
  "not-open": "This lock is no longer open.",
  "before-deadline": "The lock deadline has not passed yet.",
  "outcome-recorded":
    "A proven outcome covers this auction. Release the lock instead.",
};

/**
 * ReclaimLockButton — return an Ethereum lock to its depositor after its
 * deadline (`LockBox.reclaim`).
 *
 * Enabled only for an open lock whose deadline has passed on the Ethereum
 * clock and whose auction has no proven outcome on LockBox. Anyone may press
 * it. The tokens always go to the lock's depositor.
 */
export function ReclaimLockButton({
  lock,
  pollIntervalMs = 10_000,
  onReclaimed,
}: ReclaimLockButtonProps) {
  const { account } = useWallet();
  const [eligibility, setEligibility] = useState<ReclaimEligibility | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function read() {
      const eth = (window as unknown as { ethereum?: ethers.Eip1193Provider })
        .ethereum;
      if (!eth) return;
      try {
        const e = await getReclaimEligibility(
          new ethers.BrowserProvider(eth),
          lock,
        );
        if (!cancelled) setEligibility(e);
      } catch (e) {
        if (!cancelled) {
          setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }
    read();
    const timer = setInterval(read, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [lock, pollIntervalMs, refresh]);

  const handleReclaim = useCallback(async () => {
    setBusy(true);
    setStatus("Returning the lock to its depositor…");
    try {
      const provider = new ethers.BrowserProvider(
        (window as unknown as { ethereum: ethers.Eip1193Provider }).ethereum,
      );
      const receipt = await reclaimLock(provider, lock);
      setStatus(`Reclaimed to ${lock.depositor}. Tx: ${receipt.hash}`);
      onReclaimed?.(receipt.hash);
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      setRefresh((n) => n + 1);
    }
  }, [lock, onReclaimed]);

  const enabled = !!account && !busy && eligibility === "eligible";

  return (
    <div data-testid="reclaim-lock" className="flex flex-col gap-2">
      <button
        data-testid="reclaim-lock-button"
        onClick={handleReclaim}
        disabled={!enabled}
        className={`w-full py-2 rounded font-semibold text-sm transition-colors ${
          enabled
            ? "bg-zinc-100 hover:bg-white text-zinc-900"
            : "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
        }`}
      >
        {busy ? "Reclaiming…" : "Reclaim Lock"}
      </button>
      {eligibility && (
        <div
          data-testid="reclaim-lock-eligibility"
          data-reason={eligibility}
          className="text-xs font-mono text-zinc-500"
        >
          {REASON_TEXT[eligibility]}
        </div>
      )}
      {status && (
        <div
          data-testid="reclaim-lock-status"
          className="text-xs font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800"
        >
          {status}
        </div>
      )}
    </div>
  );
}
