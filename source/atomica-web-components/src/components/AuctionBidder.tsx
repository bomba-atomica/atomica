import { useState } from "react";
import { ethers } from "ethers";
import { sealBid, submitBid } from "@atomica/sdk/aptos";
import {
  approveFakeUsd,
  currentWindowId,
  lockBinding,
  lockFakeUsd,
} from "@atomica/sdk/ethereum";
import { getDerivedAddress } from "@atomica/sdk";
import { useWallet } from "../context/WalletContext";
import { saveBidPrice } from "../storage/bidStorage";

/**
 * UI panel for submitting a sealed bid on an active auction (v0 Beta).
 *
 * V2 bid wrapper: `auction::submit_bid` takes a V2 bid ciphertext
 * `BCS(vk, U, nonce, C, sig)` and a 32-byte price commitment. The contract builds
 * the associated data on chain and aborts unless `ibe::verify_bid_ct` accepts the
 * ciphertext. The client encrypts the bid itself with `sealBid` from
 * `@atomica/sdk/aptos`: it reads `timelock::get_mpk`, the window's
 * `timelock::get_timelock_identity` and `auction::bid_associated_data` for the
 * sender's derived Aptos address, encrypts `price_le8 || salt32` and commits to
 * the price.
 *
 * Phase 3b adds a two-step flow that mirrors the seller's Step2Lock:
 *
 *   Step 1 — Lock FakeUSD:
 *     Bidder approves and locks FakeUSD collateral in the Ethereum LockBox.
 *     The resulting `collateral_lock_id` (entered manually in this scaffold)
 *     identifies the `LockReceipt<Ethereum, FakeUSD>` that will be consumed
 *     on the Aptos side by `auction::submit_bid`.
 *
 *     In the production flow the lock ID is derived from the `Locked`
 *     event on the lock transaction receipt and a state-proof is generated
 *     off-chain.  Full proof generation for FakeUSD is deferred to the same
 *     pipeline as FakeETH (already implemented for the seller path); here the
 *     lock ID field is pre-filled with a placeholder after a successful lock.
 *
 *   Step 2 — Submit Encrypted Bid:
 *     Calls `auction::submit_bid` via the SIWE-authenticated Aptos transaction
 *     flow with the V2 ciphertext, the price commitment, the lock ID as
 *     collateral margin and the bid quantity.  Persists the bid price to
 *     localStorage so {@link useFeeRebate} can compute the post-settlement rebate.
 *
 * `submit_bid` takes
 * `(window_id, pair_bcs, ciphertext, commitment, collateral_lock_id, quantity)`.
 *
 * Requires {@link WalletContext} to be mounted above this component.
 *
 * @see docs/architecture/v0-architecture.md#§2-auction-mechanism-v01-beta
 * @see docs/architecture/v0-architecture.md#§2-5-bidder-collateral
 */

/** Bidder flow step — lock FakeUSD before submitting the sealed bid. */
type BidStep = "lock-collateral" | "submit-bid";

export function AuctionBidder() {
  const { account } = useWallet();

  // ── Step state ─────────────────────────────────────────────────────────────
  const [bidStep, setBidStep] = useState<BidStep>("lock-collateral");

  // ── Step 1: Lock FakeUSD collateral ───────────────────────────────────────
  const [collateralAmount, setCollateralAmount] = useState("500");
  const [lockLoading, setLockLoading] = useState(false);
  const [lockStatus, setLockStatus] = useState<string | null>(null);

  // ── Step 2: Submit encrypted bid ──────────────────────────────────────────
  const [windowId, setWindowId] = useState("0");
  const [quantity, setQuantity] = useState("1");
  const [pairBcsHex, setPairBcsHex] = useState("");
  const [collateralLockIdHex, setCollateralLockIdHex] = useState("");
  const [bidAmount, setBidAmount] = useState("110");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // ── Step 1 handler: approve + lock FakeUSD ────────────────────────────────
  const handleLockCollateral = async () => {
    if (!account) return;
    setLockLoading(true);
    setLockStatus("Waiting for MetaMask — Approve FakeUSD...");
    try {
      const provider = new ethers.BrowserProvider(
        (window as unknown as { ethereum: ethers.Eip1193Provider }).ethereum,
      );
      const amountWei = ethers.parseUnits(collateralAmount || "0", 6); // FakeUSD uses 6 decimals

      // 1. Approve LockBox to spend FakeUSD.
      await approveFakeUsd(provider, amountWei);
      setLockStatus("Approved. Waiting for MetaMask — Lock FakeUSD...");

      // 2. Lock FakeUSD in LockBox as collateral margin, bound to the
      //    current window and the scaffold pair (empty pair BCS). Step 2
      //    starts on that window.
      const binding = lockBinding(
        currentWindowId(BigInt(Math.floor(Date.now() / 1000))),
        new Uint8Array(0),
      );
      const lockReceipt = await lockFakeUsd(provider, amountWei, binding);
      setWindowId(binding.windowId.toString());

      // In the full proof-generation flow the lock ID is derived from the
      // Locked event via a state proof (same as the FakeETH seller path).
      // For this Phase 3b scaffold we pre-fill the field with the transaction
      // hash as a placeholder so the flow compiles end-to-end.  The user can
      // override the field before submitting the bid.
      const placeholder = lockReceipt.hash ?? lockReceipt.blockHash ?? "";
      setCollateralLockIdHex(placeholder);

      setLockStatus(
        `FakeUSD locked! Tx: ${lockReceipt.hash ?? "confirmed"}. Proceed to submit bid.`,
      );
      setBidStep("submit-bid");
    } catch (error: unknown) {
      console.error(error);
      setLockStatus(
        `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setLockLoading(false);
    }
  };

  // ── Step 2 handler: encrypt + submit bid ──────────────────────────────────
  const handleBid = async () => {
    if (!account) return;
    setLoading(true);
    setStatus("Preparing bid...");
    try {
      const windowIdBn = BigInt(windowId);

      const price = BigInt(bidAmount);
      if (price <= 0n) {
        throw new Error("The bid price must be a positive whole number.");
      }

      // Prepare sealed-bid arguments
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

      // Encrypt the bid to the window's timelock. The ciphertext is bound to
      // the sender, so seal it for this wallet's derived Aptos address.
      setStatus("Encrypting bid to the timelock key...");
      const bidder = (await getDerivedAddress(account)).toString();
      const sealed = await sealBid(windowIdBn, pairBcs, bidder, price);

      // Submit
      setStatus("Please sign the transaction...");

      const pendingTx = await submitBid(
        account,
        windowIdBn,
        pairBcs,
        sealed.ciphertext,
        sealed.commitment,
        collateralLockId,
        BigInt(quantity),
      );

      // Persist bid price in localStorage for post-settlement rebate computation
      // Key: windowId (string) used as auction identifier in this v0 shape
      saveBidPrice(windowId, account, price);

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

      {/* Step indicator */}
      <div className="flex gap-2 mb-5">
        <span
          data-testid="step-indicator-lock"
          className={`text-xs px-2 py-0.5 rounded ${
            bidStep === "lock-collateral"
              ? "bg-zinc-100 text-zinc-900 font-bold"
              : "bg-zinc-800 text-zinc-500"
          }`}
        >
          1. Lock FakeUSD
        </span>
        <span
          data-testid="step-indicator-bid"
          className={`text-xs px-2 py-0.5 rounded ${
            bidStep === "submit-bid"
              ? "bg-zinc-100 text-zinc-900 font-bold"
              : "bg-zinc-800 text-zinc-500"
          }`}
        >
          2. Submit Bid
        </span>
      </div>

      {/* ── Step 1: Lock FakeUSD collateral ─────────────────────────────── */}
      {bidStep === "lock-collateral" && (
        <div data-testid="lock-collateral-step" className="space-y-4">
          <p className="text-sm text-zinc-400">
            Lock FakeUSD in the Ethereum LockBox as collateral margin. You'll
            need to confirm two MetaMask transactions: approve and lock.
          </p>
          <div>
            <label className="block text-zinc-500 text-sm mb-1">
              Collateral Amount (FakeUSD)
            </label>
            <input
              data-testid="collateral-amount-input"
              type="number"
              value={collateralAmount}
              onChange={(e) => setCollateralAmount(e.target.value)}
              min="0"
              step="10"
              className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
            />
          </div>

          <button
            data-testid="approve-lock-usd-button"
            onClick={handleLockCollateral}
            disabled={lockLoading}
            className={`w-full py-2 rounded font-bold transition-colors ${
              lockLoading
                ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
                : "bg-zinc-100 hover:bg-white text-zinc-900"
            }`}
          >
            {lockLoading ? "Waiting for MetaMask..." : "Approve & Lock FakeUSD"}
          </button>

          {lockStatus && (
            <div
              data-testid="lock-status"
              className="mt-2 text-sm font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800"
            >
              {lockStatus}
            </div>
          )}

          <button
            data-testid="skip-to-bid-button"
            onClick={() => setBidStep("submit-bid")}
            className="w-full py-1.5 rounded text-xs font-semibold border border-zinc-700 text-zinc-500 hover:border-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Skip (enter Collateral Lock ID manually)
          </button>
        </div>
      )}

      {/* ── Step 2: Submit encrypted bid ────────────────────────────────── */}
      {bidStep === "submit-bid" && (
        <div data-testid="submit-bid-step" className="space-y-4">
          <div>
            <label className="block text-zinc-500 text-sm mb-1">
              Window ID
            </label>
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
              Quantity (wei of FakeETH)
            </label>
            <input
              data-testid="bid-quantity-input"
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
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
              placeholder="0x... (pre-filled from Step 1)"
            />
          </div>
          <div>
            <label className="block text-zinc-500 text-sm mb-1">
              Bid Price (USD, encrypted until the reveal)
            </label>
            <input
              data-testid="bid-amount-input"
              type="number"
              value={bidAmount}
              onChange={(e) => setBidAmount(e.target.value)}
              className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div className="flex gap-2">
            <button
              data-testid="back-to-lock-button"
              onClick={() => setBidStep("lock-collateral")}
              className="py-2 px-4 rounded border border-zinc-700 text-zinc-400 hover:text-zinc-200 text-sm transition-colors"
            >
              Back
            </button>
            <button
              data-testid="submit-bid-button"
              onClick={handleBid}
              disabled={loading}
              className={`flex-1 py-2 rounded font-bold transition-colors ${
                loading
                  ? "bg-zinc-800 cursor-not-allowed text-zinc-600 border border-zinc-700"
                  : "bg-zinc-100 hover:bg-white text-zinc-900"
              }`}
            >
              {loading ? "Processing..." : "Submit Encrypted Bid"}
            </button>
          </div>

          {status && (
            <div
              data-testid="bid-status"
              className="mt-4 text-sm font-mono text-zinc-400 break-all p-2 bg-zinc-950 rounded border border-zinc-800"
            >
              {status}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
