import { useState } from "react";
import { submitBid } from "@atomica/sdk/aptos";
import * as ibe from "@atomica/state-proof-verifier/ibe";
import { useWallet } from "../context/WalletContext";
import { saveBidPrice } from "../storage/bidStorage";

/**
 * UI panel for submitting a sealed bid on an active auction (v0 Beta).
 *
 * Encrypts the bid price with IBE (Boneh-Franklin) using the window ID and
 * pair as the identity context, then calls `auction::submit_bid` via the
 * SIWE-authenticated Aptos transaction flow. Persists the bid price to
 * localStorage so {@link useFeeRebate} can compute the post-settlement rebate.
 *
 * v0 Beta breaking change from Demo phase: `submit_bid` now takes
 * `(window_id, pair_bcs, u_bytes, ciphertext, collateral_lock_id)` instead of
 * `(seller_addr, amount_usd)`.
 *
 * Requires {@link WalletContext} to be mounted above this component.
 *
 * @see docs/architecture/v0-architecture.md#§2-auction-mechanism-v01-beta
 */
export function AuctionBidder() {
  const { account } = useWallet();
  const [windowId, setWindowId] = useState("0");
  const [pairBcsHex, setPairBcsHex] = useState("");
  const [collateralLockIdHex, setCollateralLockIdHex] = useState("");
  const [bidAmount, setBidAmount] = useState("110");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleBid = async () => {
    if (!account) return;
    setLoading(true);
    setStatus("Encrypting Bid...");
    try {
      // 1. Encrypt Bid with IBE (Boneh-Franklin)
      // Identity bytes: window_id (u64 big-endian) used as timelock identity
      const windowIdBn = BigInt(windowId);
      const identityBytes = new Uint8Array(8);
      const view = new DataView(identityBytes.buffer);
      view.setBigUint64(0, windowIdBn, false); // big-endian

      // Generate system parameters and encrypt the bid price
      const { mpk } = await ibe.generateSystemParameters();
      const payload = new TextEncoder().encode(bidAmount);
      const { u, v } = await ibe.encrypt(mpk, identityBytes, payload);

      // 2. Prepare sealed-bid arguments
      const pairBcs = pairBcsHex
        ? new Uint8Array(
            (pairBcsHex.replace(/^0x/, "").match(/.{1,2}/g) ?? []).map((b) =>
              parseInt(b, 16),
            ),
          )
        : new Uint8Array(0);

      const collateralLockId = collateralLockIdHex
        ? new Uint8Array(
            (collateralLockIdHex.replace(/^0x/, "").match(/.{1,2}/g) ?? []).map(
              (b) => parseInt(b, 16),
            ),
          )
        : new Uint8Array(32); // placeholder: 32 zero bytes

      // 3. Submit
      setStatus("Please sign the transaction...");

      const pendingTx = await submitBid(
        account,
        windowIdBn,
        pairBcs,
        u,
        v,
        collateralLockId,
      );

      // Persist bid price in localStorage for post-settlement rebate computation
      // Key: windowId (string) used as auction identifier in this v0 shape
      saveBidPrice(windowId, account, BigInt(bidAmount));

      const hash = (pendingTx as { hash?: string }).hash || "submitted";
      setStatus(`Bid Submitted! Tx: ${hash}`);
    } catch (error: unknown) {
      console.error(error);
      setStatus(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-900 p-6 rounded-lg border border-zinc-800">
      <h2 className="text-xl font-bold mb-4 text-zinc-300">Buy</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-zinc-500 text-sm mb-1">Window ID</label>
          <input
            data-testid="window-id-input"
            type="number"
            value={windowId}
            onChange={(e) => setWindowId(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="block text-zinc-500 text-sm mb-1">
            Pair BCS (0x hex, optional)
          </label>
          <input
            type="text"
            value={pairBcsHex}
            onChange={(e) => setPairBcsHex(e.target.value)}
            placeholder="0x... (leave empty for default)"
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 text-xs font-mono border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <div>
          <label className="block text-zinc-500 text-sm mb-1">
            Collateral Lock ID (0x hex)
          </label>
          <input
            data-testid="collateral-lock-id-input"
            type="text"
            value={collateralLockIdHex}
            onChange={(e) => setCollateralLockIdHex(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 text-xs font-mono border border-zinc-700 focus:outline-none focus:border-zinc-500"
            placeholder="0x..."
          />
        </div>
        <div>
          <label className="block text-zinc-500 text-sm mb-1">
            Bid Amount (USD)
          </label>
          <input
            data-testid="bid-amount-input"
            type="number"
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
        </div>

        <button
          data-testid="submit-bid-button"
          onClick={handleBid}
          disabled={loading}
          className={`w-full py-2 rounded font-bold transition-colors ${
            loading
              ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
              : "bg-zinc-100 hover:bg-white text-zinc-900"
          }`}
        >
          {loading ? "Processing..." : "Submit Encrypted Bid"}
        </button>
        {status && (
          <div
            data-testid="bid-status"
            className="mt-4 text-sm font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800"
          >
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
