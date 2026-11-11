import { useState } from "react";
import { ethers } from "ethers";
// SCOUT(#243) REMOVE: drop the registerTimelock import.
// SCOUT(#238) REMOVE: drop the getMpk import.
import {
  submitCreateAuction,
  getMpk,
  registerTimelock,
} from "@atomica/sdk/aptos";
import { useWallet } from "../context/WalletContext";

// SCOUT(#238) EDIT: this header describes the MPK fetch and the mpk_bytes argument; both go.
// SCOUT(#241) EDIT: this header lists the minimum price; it goes.
// SCOUT(#243) EDIT: this header says the screen registers the timelock; create_auction does it.
/**
 * UI panel for creating a new sealed-bid auction on Aptos (v0 Beta).
 *
 * Fetches the IBE Master Public Key from `timelock_config::get_mpk()` on-chain
 * (Phase 3e), collects the LockBox `lock_id`, window ID, pair BCS bytes, and
 * minimum price from the seller, registers the window timelock with
 * `ibe_config::register_timelock`, then calls `auction::create_auction` via
 * the SIWE-authenticated Aptos transaction flow.
 *
 * Phase 3e change: no local `generateSystemParameters()` — MPK is fetched from
 * the on-chain timelock_config module so all auction participants share the same
 * authoritative key.
 *
 * `create_auction` takes
 // SCOUT(#241) EDIT: min_price leaves this argument list.
 // SCOUT(#243) EDIT: timelock_id leaves this argument list.
 // SCOUT(#238) EDIT: mpk_bytes leaves this argument list.
 * `(window_id, pair_bcs, lock_id, min_price, timelock_id, mpk_bytes)`.
 *
 * Requires {@link WalletContext} to be mounted above this component.
 *
 * @see docs/architecture/v0-architecture.md#§2-auction-mechanism-v01-beta
 */
export function AuctionCreator() {
  const { account } = useWallet();
  const [lockIdHex, setLockIdHex] = useState("");
  const [windowId, setWindowId] = useState("0");
  // SCOUT(#224) EDIT: default to the SDK launch pair constant.
  const [pairBcsHex, setPairBcsHex] = useState("");
  // SCOUT(#241) REMOVE: the minimum price state, its input and its argument.
  // SCOUT(#217) EDIT: while the field exists, its text goes through parsePrice.
  const [minPrice, setMinPrice] = useState("100");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleCreateAuction = async () => {
    if (!account) return;
    setLoading(true);
    setStatus("Fetching MPK from chain...");
    try {
      // SCOUT(#238) REMOVE: create_auction has no _mpk_bytes argument, so the getMpk fetch goes.
      // 1. Fetch Master Public Key from on-chain timelock_config::get_mpk()
      const mpk = await getMpk();

      // SCOUT(#243) REMOVE: create_auction registers the window timelock itself; this caller-chosen one hour deadline goes.
      // SCOUT(#225) EDIT: this call aborts with E_NOT_REGISTRAR once the validator image has the registrar check.
      // 2. Register the timelock that opens the window's bids. Its deadline
      //    is one hour out, the sell flow's auction length.
      setStatus("Please sign the timelock registration in MetaMask...");
      const deadlineUs =
        BigInt(Math.floor(Date.now() / 1000) + 3600) * 1_000_000n;
      const timelockId = await registerTimelock(account, deadlineUs);

      // 3. Submit Transaction
      setStatus("Please sign the transaction in MetaMask...");

      // Convert inputs
      // SCOUT(#243) EDIT: remove the 32 zero byte default lock id; the UI happy path issue (236) assigns it to this issue, whose text does not mention it.
      const lockId = ethers.getBytes(lockIdHex || "0x" + "00".repeat(32));
      const windowIdBn = BigInt(windowId);
      // SCOUT(#224) EDIT: fall back to the launch pair; empty bytes are not on the allowlist.
      // pairBcs: BCS-encoded Pair struct; demo uses empty bytes (scaffold body aborts anyway)
      const pairBcs = pairBcsHex
        ? ethers.getBytes(pairBcsHex)
        : new Uint8Array(0);
      // SCOUT(#217) EDIT: price parse (BigInt of the text); use parsePrice while the field exists.
      // SCOUT(#241) REMOVE: minPriceBn.
      const minPriceBn = BigInt(minPrice);

      // SCOUT(#241) EDIT: drop the minPriceBn argument.
      // SCOUT(#243) EDIT: drop the timelockId argument.
      // SCOUT(#238) EDIT: drop the mpk argument.
      const pendingTx = await submitCreateAuction(
        account,
        windowIdBn,
        pairBcs,
        lockId,
        minPriceBn,
        timelockId,
        mpk,
      );

      const hash = (pendingTx as { hash?: string }).hash || "submitted";
      setStatus(`Auction Created! Tx: ${hash}`);
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
      <h2 className="text-xl font-bold mb-4 text-zinc-300">Sell</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-zinc-500 text-sm mb-1">Window ID</label>
          <input
            type="number"
            value={windowId}
            onChange={(e) => setWindowId(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
        </div>
        {/* SCOUT(#224) EDIT: the hint text and the empty fallback change to the launch pair. */}
        <div>
          <label className="block text-zinc-500 text-sm mb-1">
            Pair BCS (0x hex, optional)
          </label>
          <input
            type="text"
            value={pairBcsHex}
            onChange={(e) => setPairBcsHex(e.target.value)}
            placeholder="0x... (leave empty for default)"
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 font-mono text-xs"
          />
        </div>
        <div>
          <label className="block text-zinc-500 text-sm mb-1">
            Lock ID (0x hex from proof step)
          </label>
          <input
            type="text"
            value={lockIdHex}
            onChange={(e) => setLockIdHex(e.target.value)}
            placeholder="0x..."
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500 font-mono text-xs"
          />
        </div>
        {/* SCOUT(#241) REMOVE: the Min Price field. */}
        {/* SCOUT(#217) EDIT: price input in whole USD, while it exists. */}
        <div>
          <label className="block text-zinc-500 text-sm mb-1">
            Min Price (USD)
          </label>
          <input
            type="number"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value)}
            className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
          />
        </div>
        <button
          onClick={handleCreateAuction}
          disabled={loading}
          className={`w-full py-2 rounded font-bold transition-colors ${
            loading
              ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
              : "bg-zinc-100 hover:bg-white text-zinc-900"
          }`}
        >
          {loading ? "Processing..." : "Create Auction"}
        </button>
        {status && (
          <div className="mt-4 text-sm font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
