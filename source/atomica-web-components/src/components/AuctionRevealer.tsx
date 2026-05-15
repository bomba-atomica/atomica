import { useState, useEffect, useCallback, useRef } from "react";
import { isRevealed, submitCleartextAndClear } from "@atomica/sdk/aptos";
import { useWallet } from "../context/WalletContext";

/**
 * AuctionRevealer — monitors decryption key availability and triggers
 * cleartext submission for a sealed-bid auction window (v0 Beta, Phase 3e).
 *
 * Flow:
 *   1. Polls `timelock_config::is_revealed(timelockId)` on-chain every
 *      `POLL_INTERVAL_MS` milliseconds.
 *   2. On `true`: notifies the operator, who can trigger cleartext submission.
 *   3. Calls `auction::submit_cleartext_and_clear` with the decrypted bid
 *      prices (entered manually in this scaffold; full off-chain decryption via
 *      `@atomica/state-proof-verifier/ibe` is wired in a follow-up issue).
 *   4. Displays reveal status and submitted cleartext count.
 *
 * Phase 3e scope note: this component wires the identity + MPK fetch plumbing
 * and the `submit_cleartext_and_clear` call site. Full off-chain IBE decryption
 * (fetching the DK, calling `decrypt()`) is deferred to v1 (out of scope for
 * this issue per the issue body's "Out" section).
 *
 * Requires {@link WalletContext} to be mounted above this component.
 *
 * @see docs/architecture/v0-architecture.md §2.6 — cleartext submission
 * @see source/atomica-move-contracts/sources/auction.move — submit_cleartext_and_clear
 */

const POLL_INTERVAL_MS = 5_000;

export function AuctionRevealer() {
  const { account } = useWallet();

  // ── Inputs ─────────────────────────────────────────────────────────────────
  const [windowId, setWindowId] = useState("0");
  const [pairBcsHex, setPairBcsHex] = useState("");
  const [cleartextsRaw, setCleartextsRaw] = useState("");

  // ── Poll state ─────────────────────────────────────────────────────────────
  const [polling, setPolling] = useState(false);
  const [revealed, setRevealed] = useState<boolean | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  // ── Submit state ───────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [submittedCount, setSubmittedCount] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Poll logic ─────────────────────────────────────────────────────────────
  const checkRevealed = useCallback(async () => {
    try {
      const timelockId = BigInt(windowId);
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
    setSubmitStatus(null);
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

  // ── Submit handler ─────────────────────────────────────────────────────────
  const handleSubmitCleartexts = async () => {
    if (!account) return;
    setSubmitting(true);
    setSubmitStatus("Submitting cleartexts...");
    try {
      const windowIdBn = BigInt(windowId);
      const pairBcs = pairBcsHex
        ? new Uint8Array(
            (pairBcsHex.replace(/^0x/, "").match(/.{1,2}/g) ?? []).map((b) =>
              parseInt(b, 16),
            ),
          )
        : new Uint8Array(0);

      // Parse comma-separated cleartext bid prices (u64 values)
      const cleartexts: bigint[] = cleartextsRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => BigInt(s));

      if (cleartexts.length === 0) {
        setSubmitStatus("Error: enter at least one cleartext bid price.");
        return;
      }

      setSubmitStatus("Please sign the transaction...");
      await submitCleartextAndClear(account, windowIdBn, pairBcs, cleartexts);

      setSubmittedCount(cleartexts.length);
      setSubmitStatus(
        `Submitted ${cleartexts.length} cleartext(s) and triggered clearing.`,
      );
    } catch (err) {
      console.error(err);
      setSubmitStatus(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
      <h2 className="text-xl font-bold mb-4 text-zinc-300">
        Auction Revealer
      </h2>

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
            placeholder="0x... (leave empty for default)"
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
              ? "Decryption key is REVEALED. You may now submit cleartexts."
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

        {/* Cleartext submission — only shown once key is revealed */}
        {revealed === true && (
          <div
            data-testid="cleartext-submission-section"
            className="space-y-3 pt-2 border-t border-zinc-700"
          >
            <p className="text-xs text-zinc-500">
              Enter the decrypted bid prices (comma-separated u64 values) in
              bid-submission order, then submit to trigger uniform-price clearing.
            </p>
            <div>
              <label className="block text-zinc-500 text-sm mb-1">
                Cleartext Bid Prices (comma-separated)
              </label>
              <input
                data-testid="cleartexts-input"
                type="text"
                value={cleartextsRaw}
                onChange={(e) => setCleartextsRaw(e.target.value)}
                placeholder="e.g. 110, 105, 95"
                className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 font-mono text-sm"
              />
            </div>

            <button
              data-testid="submit-cleartexts-button"
              onClick={handleSubmitCleartexts}
              disabled={submitting || !account}
              className={`w-full py-2 rounded font-bold transition-colors ${
                submitting || !account
                  ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
                  : "bg-zinc-100 hover:bg-white text-zinc-900"
              }`}
            >
              {submitting ? "Submitting..." : "Submit Cleartexts & Clear"}
            </button>

            {submittedCount !== null && (
              <div
                data-testid="submitted-count"
                className="text-xs text-zinc-500 font-mono"
              >
                Submitted cleartext count: {submittedCount}
              </div>
            )}

            {submitStatus && (
              <div
                data-testid="submit-status"
                className="text-sm font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800"
              >
                {submitStatus}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
