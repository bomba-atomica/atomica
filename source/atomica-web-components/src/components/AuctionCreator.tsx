import { useState } from "react";
import { ethers } from "ethers";
import { submitCreateAuction, getMpk } from "@atomica/sdk/aptos";
import { useWallet } from "../context/WalletContext";

/**
 * UI panel for creating a new sealed-bid auction on Aptos (v0 Beta).
 *
 * Fetches the IBE Master Public Key from `timelock_config::get_mpk()` on-chain
 * (Phase 3e), collects the LockBox `lock_id`, window ID, pair BCS bytes, and
 * minimum price from the seller, then calls `auction::create_auction` via the
 * SIWE-authenticated Aptos transaction flow.
 *
 * Phase 3e change: no local `generateSystemParameters()` — MPK is fetched from
 * the on-chain timelock_config module so all auction participants share the same
 * authoritative key.
 *
 * v0 Beta breaking change from Demo phase: `create_auction` now takes
 * `(window_id, pair_bcs, lock_id, min_price, mpk_bytes)` instead of
 * `(lock_id, min_price, duration, mpk_bytes)`.
 *
 * Requires {@link WalletContext} to be mounted above this component.
 *
 * @see docs/architecture/v0-architecture.md#§2-auction-mechanism-v01-beta
 */
export function AuctionCreator() {
  const { account } = useWallet();
  const [lockIdHex, setLockIdHex] = useState("");
  const [windowId, setWindowId] = useState("0");
  const [pairBcsHex, setPairBcsHex] = useState("");
  const [minPrice, setMinPrice] = useState("100");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleCreateAuction = async () => {
    if (!account) return;
    setLoading(true);
    setStatus("Fetching MPK from chain...");
    try {
      // 1. Fetch Master Public Key from on-chain timelock_config::get_mpk()
      const mpk = await getMpk();

      // 2. Submit Transaction
      setStatus("Please sign the transaction in MetaMask...");

      // Convert inputs
      const lockId = ethers.getBytes(lockIdHex || "0x" + "00".repeat(32));
      const windowIdBn = BigInt(windowId);
      // pairBcs: BCS-encoded Pair struct; demo uses empty bytes (scaffold body aborts anyway)
      const pairBcs = pairBcsHex
        ? ethers.getBytes(pairBcsHex)
        : new Uint8Array(0);
      const minPriceBn = BigInt(minPrice);

      const pendingTx = await submitCreateAuction(
        account,
        windowIdBn,
        pairBcs,
        lockId,
        minPriceBn,
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
