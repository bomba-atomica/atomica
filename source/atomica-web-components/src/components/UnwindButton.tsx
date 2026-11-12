import { useCallback, useEffect, useState } from "react";
import { ethers } from "ethers";
import {
  CONTRACT_ADDR,
  getUnwindEligibility,
  submitUnwind,
  type UnwindEligibility,
} from "@atomica/sdk/aptos";
import { outcomeEventOfTransaction } from "@atomica/sdk/settlement/outcome-carrier";
import {
  carryAndReleaseWindow,
  defaultAptosNodes,
  type WindowReleaseResult,
} from "@atomica/sdk/settlement/window-release";
import { useWallet } from "../context/WalletContext";

export interface UnwindButtonProps {
  /** Auction window to unwind. */
  windowId: bigint;
  /** Window key pair bytes (`pair_bcs`). */
  pairBcs: Uint8Array;
  /** How often to re-read eligibility from Aptos. Defaults to 10 000 ms. */
  pollIntervalMs?: number;
}

/** Microseconds since the epoch as a UTC string. */
function formatUs(us: bigint): string {
  return new Date(Number(us / 1000n)).toISOString().replace(".000Z", "Z");
}

function describeRelease(result: WindowReleaseResult): string {
  if (result.carry && result.carry.status === "unprovable") {
    return `The outcome cannot be proven now (${result.carry.reason}). Each lock goes home by Reclaim after its deadline.`;
  }
  if (result.carry && result.carry.status === "stale-light-client") {
    return "The Ethereum light client passed its age limit, so no outcome can be recorded. Each lock goes home by Reclaim after its deadline.";
  }
  return `Outcome on Ethereum. Released ${result.released.length} lock(s).`;
}

/**
 * UnwindButton — permissionless unwind of a finished or stuck auction.
 *
 * Owner axioms: any user can unwind a finished or stuck auction, and every
 * lock goes home unless the auction executed flawlessly. No relayer is
 * involved.
 *
 * - **Unwind** sends `auction::unwind`. It is enabled only when Aptos would
 *   accept it: the window's stuck deadline has passed, and the window is
 *   either unfinished or finished with receipts it still holds
 *   (`getUnwindEligibility`). After the unwind it carries the outcome.
 * - **Carry outcome** brings the window's validator-signed `AuctionOutcome`
 *   to the LockBox and releases each open lock per its leaf
 *   (`carryAndReleaseWindow`). It is enabled once the window has an outcome
 *   (it settled, refunded or was unwound). Any wallet may press it.
 *
 * @see docs/specifications/auction-timing.md — stuck deadline
 * @see docs/decisions/trustless-v0-1-unwinding.md
 */
export function UnwindButton({
  windowId,
  pairBcs,
  pollIntervalMs = 10_000,
}: UnwindButtonProps) {
  const { account } = useWallet();
  const [eligibility, setEligibility] = useState<UnwindEligibility | null>(
    null,
  );
  const [readError, setReadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function read() {
      try {
        const e = await getUnwindEligibility(windowId, pairBcs);
        if (!cancelled) {
          setEligibility(e);
          setReadError(null);
        }
      } catch (e) {
        if (!cancelled)
          setReadError(e instanceof Error ? e.message : String(e));
      }
    }
    read();
    const timer = setInterval(read, pollIntervalMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [windowId, pairBcs, pollIntervalMs, refresh]);

  const carry = useCallback(
    async (unwindHash?: string) => {
      const provider = new ethers.BrowserProvider(
        (window as unknown as { ethereum: ethers.Eip1193Provider }).ethereum,
      );
      const nodes = defaultAptosNodes();
      const outcomeAt = unwindHash
        ? ((await outcomeEventOfTransaction(
            nodes[0],
            CONTRACT_ADDR,
            unwindHash,
          )) ?? undefined)
        : undefined;
      setStatus("Carrying the outcome proof to Ethereum…");
      const result = await carryAndReleaseWindow({
        signer: await provider.getSigner(),
        provider,
        windowId,
        pairBcs,
        outcomeAt,
        nodes,
      });
      setStatus(describeRelease(result));
    },
    [windowId, pairBcs],
  );

  const handleUnwind = useCallback(async () => {
    if (!account) return;
    setBusy(true);
    setStatus("Unwinding the auction on Aptos…");
    try {
      const tx = await submitUnwind(account, windowId, pairBcs);
      await carry(tx.hash);
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      setRefresh((n) => n + 1);
    }
  }, [account, windowId, pairBcs, carry]);

  const handleCarry = useCallback(async () => {
    if (!account) return;
    setBusy(true);
    try {
      await carry();
    } catch (e) {
      setStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      setRefresh((n) => n + 1);
    }
  }, [account, carry]);

  const canUnwind = !!account && !busy && eligibility?.eligible === true;
  const canCarry = !!account && !busy && eligibility?.final === true;

  const buttonClass = (enabled: boolean) =>
    `w-full py-2 rounded font-semibold text-sm transition-colors ${
      enabled
        ? "bg-zinc-100 hover:bg-white text-zinc-900"
        : "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
    }`;

  return (
    <div data-testid="unwind" className="flex flex-col gap-2">
      <button
        data-testid="unwind-button"
        onClick={handleUnwind}
        disabled={!canUnwind}
        className={buttonClass(canUnwind)}
      >
        {busy ? "Working…" : "Unwind Auction"}
      </button>
      <button
        data-testid="carry-outcome-button"
        onClick={handleCarry}
        disabled={!canCarry}
        className={buttonClass(canCarry)}
      >
        Carry Outcome and Release Locks
      </button>
      {eligibility && (
        <div
          data-testid="unwind-eligibility"
          data-reason={eligibility.reason}
          className="text-xs font-mono text-zinc-500"
        >
          {eligibility.reason === "before-stuck-deadline" &&
            `Anyone may unwind from ${formatUs(eligibility.stuckDeadlineUs)}.`}
          {eligibility.reason === "nothing-to-return" &&
            "This auction is final and holds no locks."}
          {eligibility.reason === "eligible" &&
            (eligibility.final
              ? `The auction is final and still holds ${eligibility.heldLocks} lock(s).`
              : "The auction is stuck. Anyone may unwind it.")}
        </div>
      )}
      {readError && (
        <div data-testid="unwind-read-error" className="text-xs text-amber-400">
          {readError}
        </div>
      )}
      {status && (
        <div
          data-testid="unwind-status"
          className="text-xs font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800"
        >
          {status}
        </div>
      )}
    </div>
  );
}
