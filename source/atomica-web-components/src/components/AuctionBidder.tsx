import { useState } from "react";
import { ethers } from "ethers";
import {
  aptos,
  assertSiweDomain,
  getRegisterLockPayload,
  sealBid,
  submitBid,
} from "@atomica/sdk/aptos";
import {
  approveFakeUsd,
  currentWindowId,
  lockBinding,
  lockFakeUsd,
  lockFromReceipt,
  type LockFields,
} from "@atomica/sdk/ethereum";
import { getChainConfig } from "@atomica/sdk/chain-config";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";
import { getDerivedAddress, submitNativeTransaction } from "@atomica/sdk";
import { useWallet } from "../context/WalletContext";
import { proveLock } from "../hooks/proveLock";
import { saveBidPrice } from "../storage/bidStorage";

// SCOUT(#228) EDIT: this header describes the commitment and the price_le8 || salt32 plaintext; rewrite it for the 8-byte price and the five-argument submit_bid.
/**
 * UI panel for submitting a sealed bid on an active auction (v0 Beta).
 *
 * V2 bid wrapper: `auction::submit_bid` takes a V2 bid ciphertext
 * `BCS(vk, U, nonce, C, sig)` and a 32-byte price commitment. The contract builds
 * the associated data on chain and aborts unless `ibe::verify_bid_ct` accepts the
 * ciphertext. The client encrypts the bid itself with `sealBid` from
 * `@atomica/sdk/aptos`: it builds the timelock identity and the associated data
 * for the sender's derived Aptos address locally, from the chain id and the
 * timelock's epoch and deadline. It refuses to seal when the node's
 * `timelock::get_timelock_identity` or `auction::bid_associated_data` differ, or
 * when configured Aptos endpoints disagree on `timelock::get_mpk`. The status
 * line shows that error and no `submit_bid` is sent. It encrypts
 * `price_le8 || salt32` and commits to the price.
 *
 * Phase 3b adds a two-step flow that mirrors the seller's Step2Lock:
 *
 *   Step 1 — Lock FakeUSD:
 *     Bidder approves and locks FakeUSD collateral in the Ethereum LockBox,
 *     bound to the current window and to the pair the bid will name. The
 *     lock is read from the `Locked` event. The screen waits for a certified
 *     Ethereum block, proves the lock ({@link proveLock}, shared with the
 *     seller flow) and registers it on Aptos with
 *     `getRegisterLockPayload(proof, "FakeUSD")`. That creates the
 *     `LockReceipt<Ethereum, FakeUSD>` that `auction::submit_bid` consumes.
 *     The collateral lock id is the LockBox lock id, never a transaction
 *     hash. If the proof or the registration fails, the lock is kept, so a
 *     retry registers it without a second approve or lock.
 *
 *   Step 2 — Submit Encrypted Bid:
 *     Calls `auction::submit_bid` via the SIWE-authenticated Aptos transaction
 *     flow with the V2 ciphertext, the price commitment, the lock ID as
 *     collateral margin and the bid quantity.  Persists the bid price to
 *     localStorage (`saveBidPrice`).
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

/** A FakeUSD lock made on Ethereum and not yet registered on Aptos. */
interface UnregisteredLock {
  lock: LockFields;
  /** Ethereum block of the lock transaction */
  block: number;
}

/** Bytes of a 0x hex field; an empty field is empty bytes. */
function hexBytes(hex: string): Uint8Array {
  return new Uint8Array(
    (hex.replace(/^0x/, "").match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)),
  );
}

/** Pair bytes of the input. An empty input means the launch pair. */
function pairBytes(hex: string): Uint8Array {
  return hex.replace(/^0x/, "") === "" ? LAUNCH_PAIR_BCS : hexBytes(hex);
}

export function AuctionBidder() {
  const { account } = useWallet();

  // ── Step state ─────────────────────────────────────────────────────────────
  const [bidStep, setBidStep] = useState<BidStep>("lock-collateral");

  // ── Step 1: Lock FakeUSD collateral ───────────────────────────────────────
  const [collateralAmount, setCollateralAmount] = useState("500");
  const [lockLoading, setLockLoading] = useState(false);
  const [lockStatus, setLockStatus] = useState<string | null>(null);
  // Kept after a failed proof or registration, so a retry does not lock again.
  const [unregistered, setUnregistered] = useState<UnregisteredLock | null>(
    null,
  );

  // ── Step 2: Submit encrypted bid ──────────────────────────────────────────
  const [windowId, setWindowId] = useState("0");
  // Wei of FakeETH. submit_bid aborts on zero (E_ZERO_QUANTITY, 37) and above
  // the window supply (E_QUANTITY_ABOVE_SUPPLY, 38).
  const [quantity, setQuantity] = useState("1");
  // Set on the lock step: the same bytes feed lockBinding, sealBid and submitBid.
  const [pairBcsHex, setPairBcsHex] = useState(ethers.hexlify(LAUNCH_PAIR_BCS));
  const [collateralLockIdHex, setCollateralLockIdHex] = useState("");
  // SCOUT(#217) EDIT: price input state; the text goes through the SDK parsePrice (whole USD per whole base token).
  const [bidAmount, setBidAmount] = useState("110");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // ── Step 1 handler: approve + lock + prove + register FakeUSD ─────────────
  // SCOUT(#218) EDIT: a collateral below the new minimum locks on Ethereum and then aborts on Aptos, so the lock waits for reclaim; read the SDK limits view reader before the lock.
  const handleLockCollateral = async () => {
    if (!account) return;
    setLockLoading(true);
    try {
      // A receipt belongs to the depositor's account of the pinned SIWE
      // domain. Refuse to lock from any other host: Aptos would never let
      // this wallet claim the lock.
      await assertSiweDomain(window.location.host);
      let pending = unregistered;
      if (!pending) {
        setLockStatus("Waiting for MetaMask — Approve FakeUSD...");
        const provider = new ethers.BrowserProvider(
          (window as unknown as { ethereum: ethers.Eip1193Provider }).ethereum,
        );
        const amountWei = ethers.parseUnits(collateralAmount || "0", 6); // FakeUSD uses 6 decimals

        // 1. Approve LockBox to spend FakeUSD.
        await approveFakeUsd(provider, amountWei);
        setLockStatus("Approved. Waiting for MetaMask — Lock FakeUSD...");

        // 2. Lock FakeUSD in LockBox as collateral margin, bound to the
        //    current window and the pair the bid names. Step 2 starts on
        //    that window. LockBox computes the lock deadline, and reverts
        //    (WindowClosed) if the window closed before the lock is mined.
        const binding = lockBinding(
          currentWindowId(BigInt(Math.floor(Date.now() / 1000))),
          pairBytes(pairBcsHex),
        );
        const lockReceipt = await lockFakeUsd(provider, amountWei, binding);
        // 3. The lock id and nonce come from the Locked event.
        pending = {
          lock: lockFromReceipt(lockReceipt),
          block: lockReceipt.blockNumber,
        };
        setUnregistered(pending);
        setWindowId(pending.lock.windowId.toString());
      }

      // 4. Prove the lock at a certified Ethereum block.
      const { lock, block } = pending;
      setLockStatus(
        `FakeUSD locked (nonce ${lock.nonce}). Waiting for a certified Ethereum block...`,
      );
      const proof = await proveLock(
        {
          ...lock,
          depositor: account,
          token: getChainConfig().ethereum.fakeUSD,
        },
        block,
        (proofBlock) =>
          setLockStatus(`Building the lock proof at block ${proofBlock}...`),
      );

      // 5. Register the lock on Aptos as a FakeUSD receipt.
      setLockStatus("Please sign — register the FakeUSD lock on Aptos...");
      await submitNativeTransaction(
        aptos,
        account,
        getRegisterLockPayload(proof, "FakeUSD"),
      );

      setCollateralLockIdHex(lock.lockId);
      setUnregistered(null);
      setLockStatus(
        `FakeUSD lock registered. Lock ID: ${lock.lockId}. Proceed to submit bid.`,
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

      // SCOUT(#217) EDIT: price parse; use the SDK parsePrice, which throws on empty, signed, decimal, zero and above u64.
      const price = BigInt(bidAmount);
      // SCOUT(#217) EDIT: price comparison; parsePrice makes it redundant, and a unit test expects the word positive in its message.
      if (price <= 0n) {
        throw new Error("The bid price must be a positive whole number.");
      }
      const bidQuantity = BigInt(quantity);
      if (bidQuantity <= 0n) {
        throw new Error("The bid quantity must be above zero.");
      }

      // Prepare sealed-bid arguments: the pair the lock is bound to.
      const pairBcs = pairBytes(pairBcsHex);

      // The LockBox lock id the lock step registered (or typed after Skip).
      if (!collateralLockIdHex) {
        throw new Error(
          "Lock FakeUSD first, or enter the collateral lock id of a registered lock.",
        );
      }
      const collateralLockId = hexBytes(collateralLockIdHex);

      // Encrypt the bid to the window's timelock. The ciphertext is bound to
      // the sender, so seal it for this wallet's derived Aptos address.
      setStatus("Encrypting bid to the timelock key...");
      const bidder = (await getDerivedAddress(account)).toString();
      // sealBid throws when a node lies about the identity, the associated
      // data or the key; the catch below shows it and nothing is submitted.
      // SCOUT(#228) EDIT: sealBid returns no commitment and no salt.
      const sealed = await sealBid(windowIdBn, pairBcs, bidder, price);

      // Submit
      setStatus("Please sign the transaction...");

      // SCOUT(#228) EDIT: drop the sealed.commitment argument (five-argument submit_bid).
      const pendingTx = await submitBid(
        account,
        windowIdBn,
        pairBcs,
        sealed.ciphertext,
        sealed.commitment,
        collateralLockId,
        bidQuantity,
      );

      // SCOUT(#217) EDIT: the stored price changes unit with the input.
      // SCOUT(#228) REMOVE: nothing is stored once the salt is gone.
      // Persist the bid price in localStorage. Nothing reads it yet; the
      // price unit issue (217) owns the stored price.
      // Key: windowId (string) used as auction identifier in this v0 shape
      saveBidPrice(windowId, account, price);

      const hash = (pendingTx as { hash?: string }).hash || "submitted";
      setStatus(`Bid Submitted! Tx: ${hash}`);
    } catch (error: unknown) {
      console.error(error);
      const msg = error instanceof Error ? error.message : "Unknown error";
      // `\b` keeps "abort 37" from matching "abort 370".
      if (/E_QUANTITY_ABOVE_SUPPLY|abort 38\b/.test(msg)) {
        setStatus(
          "Error: the bid quantity is above the window supply. Bid at most the FakeETH the sellers locked.",
        );
      } else if (/E_ZERO_QUANTITY|abort 37\b/.test(msg)) {
        setStatus("Error: the bid quantity must be above zero.");
      } else {
        setStatus(`Error: ${msg}`);
      }
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
            Lock FakeUSD in the Ethereum LockBox as collateral margin, then
            register the lock on Aptos. You'll confirm the approve and the lock
            in MetaMask, then sign the registration.
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
              disabled={unregistered !== null}
              min="0"
              step="10"
              className="w-full bg-zinc-800 text-zinc-200 rounded p-2 border border-zinc-700 focus:outline-none focus:border-zinc-500"
            />
          </div>

          <div>
            <label className="block text-zinc-500 text-sm mb-1">
              Pair BCS (0x hex, optional)
            </label>
            <input
              data-testid="pair-bcs-input"
              type="text"
              value={pairBcsHex}
              onChange={(e) => setPairBcsHex(e.target.value)}
              disabled={unregistered !== null}
              placeholder="0x... (leave empty for the launch pair)"
              className="w-full bg-zinc-800 text-zinc-200 rounded p-2 text-xs font-mono border border-zinc-700 focus:outline-none focus:border-zinc-500"
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
            {lockLoading
              ? "Working..."
              : unregistered
                ? "Retry Proof & Registration"
                : "Approve & Lock FakeUSD"}
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
          {/* SCOUT(#217) EDIT: price input; type number accepts decimals that parsePrice rejects, and the label must say whole USD per whole FakeETH. */}
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
