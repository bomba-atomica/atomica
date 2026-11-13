import { useState } from "react";
import { ethers } from "ethers";
// SCOUT(#243) REMOVE: drop the registerTimelock import.
import { submitCreateAuction, registerTimelock } from "@atomica/sdk/aptos";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";
import { useWallet } from "../context/WalletContext";

// SCOUT(#243) EDIT: this header says the screen registers the timelock; create_auction does it.
/**
 * UI panel for creating a new sealed-bid auction on Aptos (v0 Beta).
 *
 * Collects the LockBox `lock_id`, window ID and pair BCS bytes from the
 * seller, registers the window timelock with
 * `ibe_config::register_timelock`, then calls `auction::create_auction` via
 * the SIWE-authenticated Aptos transaction flow.
 *
 * `create_auction` takes
 // SCOUT(#243) EDIT: timelock_id leaves this argument list.
 * `(window_id, pair_bcs, lock_id, timelock_id)`. There is no reserve price.
 *
 * Requires {@link WalletContext} to be mounted above this component.
 *
 * @see docs/architecture/v0-architecture.md#§2-auction-mechanism-v01-beta
 */
export function AuctionCreator() {
  const { account } = useWallet();
  const [lockIdHex, setLockIdHex] = useState("");
  const [windowId, setWindowId] = useState("0");
  const [pairBcsHex, setPairBcsHex] = useState(ethers.hexlify(LAUNCH_PAIR_BCS));
  // SCOUT(#217) EDIT: while the field exists, its text goes through parsePrice.
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleCreateAuction = async () => {
    if (!account) return;
    setLoading(true);
    try {
      // SCOUT(#243) REMOVE: create_auction registers the window timelock itself; this caller-chosen one hour deadline goes.
      // SCOUT(#225) EDIT: this call aborts with E_NOT_REGISTRAR once the validator image has the registrar check.
      // 1. Register the timelock that opens the window's bids. Its deadline
      //    is one hour out, the sell flow's auction length.
      setStatus("Please sign the timelock registration in MetaMask...");
      const deadlineUs =
        BigInt(Math.floor(Date.now() / 1000) + 3600) * 1_000_000n;
      const timelockId = await registerTimelock(account, deadlineUs);

      // 2. Submit Transaction
      setStatus("Please sign the transaction in MetaMask...");

      // Convert inputs
      // SCOUT(#243) EDIT: remove the 32 zero byte default lock id; the UI happy path issue (236) assigns it to this issue, whose text does not mention it.
      const lockId = ethers.getBytes(lockIdHex || "0x" + "00".repeat(32));
      const windowIdBn = BigInt(windowId);
      // pairBcs: must be on the pair allowlist; an empty input means the launch pair.
      const pairBcs = pairBcsHex
        ? ethers.getBytes(pairBcsHex)
        : LAUNCH_PAIR_BCS;
      // SCOUT(#217) EDIT: price parse (BigInt of the text); use parsePrice while the field exists.

      // SCOUT(#243) EDIT: drop the timelockId argument.
      const pendingTx = await submitCreateAuction(
        account,
        windowIdBn,
        pairBcs,
        lockId,
        timelockId,
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
            placeholder="0x... (leave empty for the launch pair)"
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
        {/* SCOUT(#217) EDIT: price input in whole USD, while it exists. */}
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
