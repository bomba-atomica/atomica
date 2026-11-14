import { useState, useEffect, useCallback, useRef } from "react";
import {
  MAX_OPEN_BIDS_PER_CALL,
  decryptWindowBids,
  finalizeWindow,
  getOpenCursor,
  getWindowTimelockId,
  isRevealed,
  openBids,
  type OpenedBid,
} from "@atomica/sdk/aptos";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";
import { formatPrice } from "@atomica/sdk";
import { useWallet } from "../context/WalletContext";

// SCOUT(#236) EDIT: this component gets exported and mounted, so it needs windowId and pairBcs props instead of free-text inputs.
/**
 * AuctionRevealer — monitors decryption key availability and opens the bids
 * of a sealed-bid auction window on chain (v0 Beta).
 *
 * Flow:
 *   1. Reads the window's timelock id (`auction::window_timelock`) and polls
 *      `timelock::is_revealed(timelockId)` every `POLL_INTERVAL_MS` milliseconds.
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

/** Pair bytes of the input. An empty input means the launch pair. */
function parsePairBcs(hex: string): Uint8Array {
  if (hex.replace(/^0x/, "") === "") return LAUNCH_PAIR_BCS;
  return new Uint8Array(
    (hex.replace(/^0x/, "").match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)),
  );
}

export function AuctionRevealer() {
  const { account } = useWallet();

  // ── Inputs ─────────────────────────────────────────────────────────────────
  const [windowId, setWindowId] = useState("0");
  const [pairBcsHex, setPairBcsHex] = useState("");

  // ── Poll state ─────────────────────────────────────────────────────────────
  const [polling, setPolling] = useState(false);
  const [revealed, setRevealed] = useState<boolean | null>(null);
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
  // SCOUT(#236) EDIT: only is_revealed is polled, so an expired timelock waits forever; report it and hand over to Unwind (SDK unwind issue (195)).
  const checkRevealed = useCallback(async () => {
    try {
      // One timelock per window id, shared by every pair.
      const timelockId = await getWindowTimelockId(BigInt(windowId));
      const result = await isRevealed(timelockId);
      setRevealed(result);
      setPollError(null);
    } catch (err) {
      setPollError(err instanceof Error ? err.message : "Poll failed");
    }
  }, [windowId]);

  const startPolling = useCallback(() => {
    if (polling) return;
    setPolling(true);
    setRevealed(null);
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

  // Stop polling when key is revealed
  useEffect(() => {
    if (revealed === true && intervalRef.current !== null) {
      stopPolling();
    }
  }, [revealed, stopPolling]);

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
      setDecrypted(
        await decryptWindowBids(BigInt(windowId), parsePairBcs(pairBcsHex)),
      );
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
      const windowIdBn = BigInt(windowId);
      const pairBcs = parsePairBcs(pairBcsHex);
      let current = await getOpenCursor(windowIdBn, pairBcs);
      setCursor(current);
      if (current.total === 0n) {
        setOpenStatus("No bids in this window: nothing to open or clear.");
        return;
      }
      while (current.next < current.total) {
        setOpenStatus(
          `Please sign open_bids (${current.next} of ${current.total} opened)...`,
        );
        await openBids(account, windowIdBn, pairBcs, MAX_OPEN_BIDS_PER_CALL);
        const after = await getOpenCursor(windowIdBn, pairBcs);
        if (after.next <= current.next) {
          throw new Error("open_bids did not move the opening cursor.");
        }
        current = after;
        setCursor(current);
      }
      setOpenStatus("Every bid is opened. Please sign finalize_window...");
      await finalizeWindow(account, windowIdBn, pairBcs);
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

      <div className="space-y-4">
        {/* Window ID */}
        <div>
          <label className="block text-zinc-500 text-sm mb-1">Window ID</label>
          <input
            data-testid="revealer-window-id-input"
            type="number"
            value={windowId}
            onChange={(e) => setWindowId(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
        </div>

        {/* Pair BCS */}
        <div>
          <label className="block text-zinc-500 text-sm mb-1">
            Pair BCS (0x hex, optional)
          </label>
          <input
            data-testid="revealer-pair-bcs-input"
            type="text"
            value={pairBcsHex}
            onChange={(e) => setPairBcsHex(e.target.value)}
            placeholder="0x... (leave empty for the launch pair)"
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 text-xs font-mono border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
        </div>

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
        {revealed !== null && (
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
