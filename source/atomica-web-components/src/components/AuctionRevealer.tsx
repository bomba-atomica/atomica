import { useState, useEffect, useCallback, useRef } from "react";
import {
  MAX_OPEN_BIDS_PER_CALL,
  decryptWindowBids,
  finalizeWindow,
  getOpenCursor,
  getTimelockStatus,
  getWindowTimelockId,
  openBids,
  type OpenedBid,
  type TimelockExpiryReason,
} from "@atomica/sdk/aptos";
import { formatPrice } from "@atomica/sdk";
import { useWallet } from "../context/WalletContext";

/**
 * AuctionRevealer — the open step of a trade (open, settle, release): it
 * monitors decryption key availability and opens the bids of one auction
 * window on chain. The window comes from the `windowId` and `pairBcs` props.
 *
 * Flow:
 *   1. Reads the window's timelock id (`auction::window_timelock`) and polls
 *      its status (`timelock::get_status`) every `POLL_INTERVAL_MS`
 *      milliseconds. An expired timelock can never open the bids: the
 *      revealer says so, stops polling and points to the Unwind action of
 *      UnwindButton, which returns every lock to its depositor.
 *   2. On `true`: one permissionless "Open bids" action. Any account may send
 *      it. It sends `auction::open_bids` with `MAX_OPEN_BIDS_PER_CALL` until
 *      `auction::get_open_cursor` reports every bid opened, showing the opened
 *      count, then sends `auction::finalize_window` once to clear the window.
 *      The chain decrypts every bid itself. Nobody types a price or a salt.
 *   3. "Preview bids" decrypts the bids off chain with the revealed key
 *      (`decryptWindowBids`). It is read-only.
 *
 * Requires {@link WalletContext} to be mounted above this component.
 *
 * @see docs/architecture/v0-architecture.md §2.6 — on-chain opening
 * @see source/atomica-move-contracts/sources/auction.move — open_bids, finalize_window
 */

const POLL_INTERVAL_MS = 5_000;

const EXPIRY_TEXT: Record<TimelockExpiryReason, string> = {
  "epoch-ended": "the validator epoch ended before the key was revealed",
  "reveal-window-elapsed": "the reveal window elapsed without a key",
  "key-check-failed": "the revealed key failed its check",
};

export interface AuctionRevealerProps {
  /** Auction window id. */
  windowId: bigint;
  /** Pair bytes of the window key. */
  pairBcs: Uint8Array;
}

export function AuctionRevealer({ windowId, pairBcs }: AuctionRevealerProps) {
  const { account } = useWallet();

  // ── Poll state ─────────────────────────────────────────────────────────────
  const [polling, setPolling] = useState(false);
  const [revealed, setRevealed] = useState<boolean | null>(null);
  const [expired, setExpired] = useState<
    TimelockExpiryReason | "unknown" | null
  >(null);
  const [pollError, setPollError] = useState<string | null>(null);

  // ── Decrypt state ──────────────────────────────────────────────────────────
  const [decrypting, setDecrypting] = useState(false);
  const [decrypted, setDecrypted] = useState<OpenedBid[] | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  // ── Open state ─────────────────────────────────────────────────────────────
  const [opening, setOpening] = useState(false);
  const [openStatus, setOpenStatus] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ next: bigint; total: bigint } | null>(
    null,
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Poll logic ─────────────────────────────────────────────────────────────
  const checkRevealed = useCallback(async () => {
    try {
      // One timelock per window id, shared by every pair.
      const timelockId = await getWindowTimelockId(windowId);
      const result = await getTimelockStatus(timelockId);
      setRevealed(result.status === "revealed");
      setExpired(
        result.status === "expired" ? (result.reason ?? "unknown") : null,
      );
      setPollError(null);
    } catch (err) {
      setPollError(err instanceof Error ? err.message : "Poll failed");
    }
  }, [windowId]);

  const startPolling = useCallback(() => {
    if (polling) return;
    setPolling(true);
    setRevealed(null);
    setExpired(null);
    setPollError(null);
    setOpenStatus(null);
    checkRevealed();
    intervalRef.current = setInterval(checkRevealed, POLL_INTERVAL_MS);
  }, [polling, checkRevealed]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setPolling(false);
  }, []);

  // Stop polling once the timelock is final: revealed or expired.
  useEffect(() => {
    if (
      (revealed === true || expired !== null) &&
      intervalRef.current !== null
    ) {
      stopPolling();
    }
  }, [revealed, expired, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // ── Preview handler ────────────────────────────────────────────────────────
  // Read-only: decrypts the bids off chain with the revealed key. The chain
  // opens them itself with open_bids.
  const handleDecrypt = async () => {
    setDecrypting(true);
    setDecryptError(null);
    try {
      setDecrypted(await decryptWindowBids(windowId, pairBcs));
    } catch (err) {
      setDecryptError(err instanceof Error ? err.message : "Decrypt failed");
    } finally {
      setDecrypting(false);
    }
  };

  // ── Open handler ───────────────────────────────────────────────────────────
  // Sends open_bids in batches of MAX_OPEN_BIDS_PER_CALL until the cursor
  // reaches the bid count, then finalize_window once. A bid that does not
  // decrypt to an 8-byte price, or whose collateral is below its quote, does
  // not abort a batch: the chain marks it invalid and it never fills.
  const handleOpenBids = async () => {
    if (!account) return;
    setOpening(true);
    setOpenStatus("Reading the opening cursor...");
    try {
      let current = await getOpenCursor(windowId, pairBcs);
      setCursor(current);
      if (current.total === 0n) {
        setOpenStatus("No bids in this window: nothing to open or clear.");
        return;
      }
      while (current.next < current.total) {
        setOpenStatus(
          `Please sign open_bids (${current.next} of ${current.total} opened)...`,
        );
        await openBids(account, windowId, pairBcs, MAX_OPEN_BIDS_PER_CALL);
        const after = await getOpenCursor(windowId, pairBcs);
        if (after.next <= current.next) {
          throw new Error("open_bids did not move the opening cursor.");
        }
        current = after;
        setCursor(current);
      }
      setOpenStatus("Every bid is opened. Please sign finalize_window...");
      await finalizeWindow(account, windowId, pairBcs);
      setOpenStatus(
        `Opened ${current.total} bid(s) and cleared the window with finalize_window.`,
      );
    } catch (err) {
      console.error(err);
      setOpenStatus(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setOpening(false);
    }
  };

  return (
    <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
      <h2 className="text-xl font-bold mb-4 text-zinc-300">Auction Revealer</h2>
      <p
        data-testid="revealer-window"
        className="text-xs text-zinc-500 font-mono mb-4"
      >
        Window {windowId.toString()}
      </p>

      <div className="space-y-4">
        {/* Poll controls */}
        <div className="flex gap-2">
          <button
            data-testid="start-polling-button"
            onClick={startPolling}
            disabled={polling}
            className={`flex-1 py-2 rounded font-bold transition-colors text-sm ${
              polling
                ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
                : "bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
            }`}
          >
            {polling ? "Polling..." : "Start Polling is_revealed"}
          </button>
          <button
            data-testid="stop-polling-button"
            onClick={stopPolling}
            disabled={!polling}
            className={`py-2 px-4 rounded border text-sm transition-colors ${
              !polling
                ? "border-zinc-800 text-zinc-700 cursor-not-allowed"
                : "border-zinc-600 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Stop
          </button>
        </div>

        {/* Reveal status */}
        {revealed !== null && expired === null && (
          <div
            data-testid="reveal-status"
            className={`text-sm font-mono p-2 rounded border ${
              revealed
                ? "bg-green-950 border-green-800 text-green-300"
                : "bg-zinc-950 border-zinc-700 text-zinc-400"
            }`}
          >
            {revealed
              ? "Decryption key is REVEALED. Anyone may now open the bids."
              : "Waiting for decryption key reveal..."}
          </div>
        )}

        {expired !== null && (
          <div
            data-testid="timelock-expired"
            className="text-sm p-2 rounded border bg-amber-950 border-amber-800 text-amber-300"
          >
            The window&apos;s timelock expired (
            {expired === "unknown" ? "no reason given" : EXPIRY_TEXT[expired]}
            ), so its bids can never be opened. Use the Unwind action to return
            every lock to its depositor.
          </div>
        )}

        {pollError && (
          <div
            data-testid="poll-error"
            className="text-sm font-mono text-red-400 p-2 bg-zinc-950 rounded border border-red-900"
          >
            Poll error: {pollError}
          </div>
        )}

        {/* On-chain opening — only shown once key is revealed */}
        {revealed === true && (
          <div
            data-testid="open-bids-section"
            className="space-y-3 pt-2 border-t border-zinc-700"
          >
            <p className="text-xs text-zinc-500">
              The chain decrypts every bid itself. Open bids sends open_bids in
              batches of {MAX_OPEN_BIDS_PER_CALL.toString()} until every bid is
              opened, then finalize_window to clear the window. Any account may
              send them.
            </p>

            <button
              data-testid="open-bids-button"
              onClick={handleOpenBids}
              disabled={opening || !account}
              className={`w-full py-2 rounded font-bold transition-colors ${
                opening || !account
                  ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
                  : "bg-zinc-100 hover:bg-white text-zinc-900"
              }`}
            >
              {opening ? "Opening..." : "Open bids"}
            </button>

            {cursor !== null && (
              <div
                data-testid="opened-count"
                className="text-xs text-zinc-500 font-mono"
              >
                Opened bids: {cursor.next.toString()} of{" "}
                {cursor.total.toString()}
              </div>
            )}

            {openStatus && (
              <div
                data-testid="open-status"
                className="text-sm font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800"
              >
                {openStatus}
              </div>
            )}

            <button
              data-testid="decrypt-bids-button"
              onClick={handleDecrypt}
              disabled={decrypting}
              className={`w-full py-2 rounded font-bold transition-colors text-sm ${
                decrypting
                  ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
                  : "bg-zinc-700 hover:bg-zinc-600 text-zinc-200"
              }`}
            >
              {decrypting ? "Decrypting..." : "Preview bids (off chain)"}
            </button>

            {decryptError && (
              <div
                data-testid="decrypt-error"
                className="text-sm font-mono text-red-400 p-2 bg-zinc-950 rounded border border-red-900"
              >
                Decrypt error: {decryptError}
              </div>
            )}

            {decrypted && (
              <ul
                data-testid="decrypted-bids"
                className="text-xs font-mono text-zinc-400 space-y-1"
              >
                {decrypted.length === 0 && <li>No bids in this window.</li>}
                {decrypted.map((b) => (
                  <li key={b.index} data-testid="decrypted-bid">
                    #{b.index} {b.bidder.slice(0, 10)}…{" "}
                    {b.price !== undefined
                      ? `price ${formatPrice(b.price)}`
                      : "unreadable"}
                    {b.alreadyOpened
                      ? b.valid
                        ? " (opened)"
                        : " (opened, invalid: never fills, collateral returned)"
                      : b.error !== undefined
                        ? ` (invalid when opened: ${b.error})`
                        : " (not opened yet)"}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
