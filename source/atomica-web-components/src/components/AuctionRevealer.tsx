import { useState, useEffect, useCallback, useRef } from "react";
// SCOUT(#228) EDIT: replace submitCleartextAndClear with the SDK openBids; decryptWindowBids stays as a read-only preview.
import {
  decryptWindowBids,
  getWindowTimelockId,
  isRevealed,
  submitCleartextAndClear,
  type OpenedBid,
} from "@atomica/sdk/aptos";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";
import { useWallet } from "../context/WalletContext";

// SCOUT(#228) EDIT: rewrite this flow comment: one permissionless Open bids action, no prices and no salts.
// SCOUT(#236) EDIT: this component gets exported and mounted, so it needs windowId and pairBcs props instead of free-text inputs.
/**
 * AuctionRevealer — monitors decryption key availability and triggers
 * cleartext submission for a sealed-bid auction window (v0 Beta, Phase 3e).
 *
 * Flow:
 *   1. Reads the window's timelock id (`auction::get_window_status`) and polls
 *      `timelock::is_revealed(timelockId)` every `POLL_INTERVAL_MS` milliseconds.
 *   2. On `true`: "Decrypt Bids" reads the revealed key with
 *      `timelock::get_decryption_key`, decrypts every bid ciphertext off chain
 *      with the V2 decryptor (`decryptWindowBids`) and fills in the prices and
 *      salts. A bid that does not decrypt, or whose plaintext does not match its
 *      commitment, is skipped (empty salt): only its bidder can open it.
 *   3. Calls `auction::submit_cleartext_and_clear` with the prices and salts.
 *      The contract checks every opening against the commitment made at
 *      submission.
 *   4. Displays reveal status and submitted cleartext count.
 *
 * Requires {@link WalletContext} to be mounted above this component.
 *
 * @see docs/architecture/v0-architecture.md §2.6 — cleartext submission
 * @see source/atomica-move-contracts/sources/auction.move — submit_cleartext_and_clear
 */

const POLL_INTERVAL_MS = 5_000;

/** Pair bytes of the input. An empty input means the launch pair. */
function parsePairBcs(hex: string): Uint8Array {
  if (hex.replace(/^0x/, "") === "") return LAUNCH_PAIR_BCS;
  return new Uint8Array(
    (hex.replace(/^0x/, "").match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)),
  );
}

function toHex(bytes: Uint8Array): string {
  return (
    "0x" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  );
}

// SCOUT(#236) EDIT: make the open step one action, built from decryptWindowBids before on-chain decryption (228) and from openBids after it.
export function AuctionRevealer() {
  const { account } = useWallet();

  // ── Inputs ─────────────────────────────────────────────────────────────────
  const [windowId, setWindowId] = useState("0");
  const [pairBcsHex, setPairBcsHex] = useState("");
  // SCOUT(#228) REMOVE: hand-typed cleartext prices and salts.
  // SCOUT(#236) REMOVE: the user types no price and no salt.
  const [cleartextsRaw, setCleartextsRaw] = useState("");
  const [saltsRaw, setSaltsRaw] = useState("");

  // ── Poll state ─────────────────────────────────────────────────────────────
  const [polling, setPolling] = useState(false);
  const [revealed, setRevealed] = useState<boolean | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  // ── Decrypt state ──────────────────────────────────────────────────────────
  const [decrypting, setDecrypting] = useState(false);
  const [decrypted, setDecrypted] = useState<OpenedBid[] | null>(null);
  const [decryptError, setDecryptError] = useState<string | null>(null);

  // ── Submit state ───────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<string | null>(null);
  const [submittedCount, setSubmittedCount] = useState<number | null>(null);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Poll logic ─────────────────────────────────────────────────────────────
  // SCOUT(#236) EDIT: only is_revealed is polled, so an expired timelock waits forever; report it and hand over to Unwind (SDK unwind issue (195)).
  const checkRevealed = useCallback(async () => {
    try {
      const timelockId = await getWindowTimelockId(
        BigInt(windowId),
        parsePairBcs(pairBcsHex),
      );
      const result = await isRevealed(timelockId);
      setRevealed(result);
      setPollError(null);
    } catch (err) {
      setPollError(err instanceof Error ? err.message : "Poll failed");
    }
  }, [windowId, pairBcsHex]);

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

  // ── Decrypt handler ────────────────────────────────────────────────────────
  // SCOUT(#228) EDIT: decrypt becomes a preview only; the 8-byte plaintext has no salt and nothing to match against a commitment.
  const handleDecrypt = async () => {
    setDecrypting(true);
    setDecryptError(null);
    try {
      const bids = await decryptWindowBids(
        BigInt(windowId),
        parsePairBcs(pairBcsHex),
      );
      setDecrypted(bids);
      // Index-aligned openings. Skip (empty salt) a bid already opened or one
      // whose decryption does not match its commitment.
      const usable = (b: OpenedBid) =>
        b.matchesCommitment && !b.alreadyOpened && b.salt !== undefined;
      // SCOUT(#217) EDIT: prices formatted to text as raw integers; this file is missing from the price unit issue's touchpoints.
      setCleartextsRaw(
        bids.map((b) => (usable(b) ? b.price!.toString() : "0")).join(", "),
      );
      setSaltsRaw(
        bids.map((b) => (usable(b) ? toHex(b.salt!) : "")).join(", "),
      );
    } catch (err) {
      setDecryptError(err instanceof Error ? err.message : "Decrypt failed");
    } finally {
      setDecrypting(false);
    }
  };

  // ── Submit handler ─────────────────────────────────────────────────────────
  // SCOUT(#228) REMOVE: replace with openBids(account, windowId, pairBcs, maxBids), repeated until every bid is opened.
  // SCOUT(#236) EDIT: one open-and-clear transaction with no typed input.
  // SCOUT(#216) EDIT: an invalid bid no longer aborts this call; show the validity flag of the bid view.
  const handleSubmitCleartexts = async () => {
    if (!account) return;
    setSubmitting(true);
    setSubmitStatus("Submitting cleartexts...");
    try {
      const windowIdBn = BigInt(windowId);
      const pairBcs = parsePairBcs(pairBcsHex);

      // Parse comma-separated cleartext bid prices (u64 values)
      // SCOUT(#217) EDIT: prices parsed from text with BigInt.
      const cleartexts: bigint[] = cleartextsRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => BigInt(s));

      if (cleartexts.length === 0) {
        setSubmitStatus("Error: enter at least one cleartext bid price.");
        return;
      }

      // Parse comma-separated 32-byte salts (0x hex), index-aligned to the
      // cleartexts. An empty entry skips that bid.
      const salts: Uint8Array[] = saltsRaw.split(",").map((s) => {
        const hex = s.trim().replace(/^0x/, "");
        return new Uint8Array(
          (hex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)),
        );
      });
      if (salts.length !== cleartexts.length) {
        setSubmitStatus(
          "Error: enter one salt per cleartext (leave an entry empty to skip a bid).",
        );
        return;
      }
      if (salts.some((salt) => salt.length !== 0 && salt.length !== 32)) {
        setSubmitStatus(
          "Error: every salt must be 32 bytes (64 hex characters).",
        );
        return;
      }

      setSubmitStatus("Please sign the transaction...");
      // SCOUT(#228) REMOVE: submitCleartextAndClear is deleted from the SDK.
      await submitCleartextAndClear(
        account,
        windowIdBn,
        pairBcs,
        cleartexts,
        salts,
      );

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
              Decrypt the bids off chain with the revealed key. Each bid
              plaintext is price (8 bytes, little-endian) then a 32-byte salt.
              The prices and salts below are in bid-submission order. The
              contract checks each opening against the bid's commitment, so a
              wrong value aborts the call.
            </p>

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
              {decrypting ? "Decrypting..." : "Decrypt Bids with Revealed Key"}
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
                {/* SCOUT(#217) EDIT: price shown as a raw integer; route it through formatPrice. */}
                {/* SCOUT(#216) EDIT: show whether an opened bid is valid. */}
                {/* SCOUT(#228) EDIT: the matches-commitment wording goes. */}
                {decrypted.map((b) => (
                  <li key={b.index} data-testid="decrypted-bid">
                    #{b.index} {b.bidder.slice(0, 10)}…{" "}
                    {b.price !== undefined ? `price ${b.price}` : "unreadable"}
                    {b.alreadyOpened
                      ? " (already opened)"
                      : b.matchesCommitment
                        ? " (matches commitment)"
                        : ` (cannot open: ${b.error ?? "commitment mismatch"})`}
                  </li>
                ))}
              </ul>
            )}
            {/* SCOUT(#228) REMOVE: the cleartext price input and the salt input below it. */}
            {/* SCOUT(#217) EDIT: price input (comma-separated raw integers) until on-chain decryption removes it. */}
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

            <div>
              <label className="block text-zinc-500 text-sm mb-1">
                Salts (comma-separated 0x hex, 32 bytes each)
              </label>
              <input
                data-testid="salts-input"
                type="text"
                value={saltsRaw}
                onChange={(e) => setSaltsRaw(e.target.value)}
                placeholder="0x..., 0x..."
                className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 font-mono text-xs"
              />
            </div>

            {/* SCOUT(#228) EDIT: this becomes the Open bids button. */}
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
