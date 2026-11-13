import type {
  Aptos,
  InputGenerateTransactionPayloadData,
} from "@aptos-labs/ts-sdk";
import { ethers } from "ethers";
import { CONTRACT_ADDR, aptos } from "./config.js";
import { getDerivedAddress } from "../siwe.js";
import { submitNativeTransaction } from "../transaction.js";
import type { LockedBalanceProof } from "../ethereum/proofs/generator.js";
import { LAUNCH_PAIR_BCS } from "../settlement/bridge.js";
import {
  setPinnedEthereumConfigReader,
  type PinnedEthereumConfig,
} from "../ethereum-pin.js";

export {
  assertEthereumConfigMatchesPin,
  type PinnedEthereumConfig,
} from "../ethereum-pin.js";

/**
 * Sanity Test: Simple APT transfer using MetaMask signature
 * This tests ONLY the signature verification without any custom contracts
 */
export async function testSimpleAPTTransfer(
  ethAddress: string,
  customRecipient?: string,
) {
  console.log("\n=== 🧪 Sanity Test: Simple APT Transfer ===");
  console.log(
    "This tests signature verification with the simplest possible transaction",
  );
  console.log(
    "Using: 0x1::aptos_account::transfer (standard Aptos function)\n",
  );

  // Show which addresses we're using
  const derivedAddress = await getDerivedAddress(ethAddress.toLowerCase());
  console.log("ETH Address (identity):", ethAddress);
  console.log("Aptos Derived Address (sender):", derivedAddress.toString());
  console.log("This is the same address the faucet funded ✓\n");

  // Generate a random recipient address (standard Ed25519 Aptos account) if not provided
  const randomRecipient =
    "0x" +
    Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join("");

  const recipient = customRecipient || randomRecipient;

  console.log("Recipient:", recipient);
  console.log("Amount: 100 octas (0.000001 APT)\n");

  try {
    const result = await submitNativeTransaction(aptos, ethAddress, {
      function: "0x1::aptos_account::transfer",
      functionArguments: [recipient, 100],
    });

    console.log("\n✅ SANITY TEST PASSED!");
    console.log("Transaction hash:", result.hash);
    console.log("\nConclusion: Signature verification is working correctly!");
    console.log(
      "The issue with the custom contract call is likely contract-specific\n",
    );

    return { success: true, hash: result.hash };
  } catch (e: unknown) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("\n❌ SANITY TEST FAILED!");
    console.error("Error:", errorMessage);
    console.error(
      "\nConclusion: There's a fundamental issue with signature verification",
    );
    console.error("This needs to be fixed before trying custom contracts\n");

    return { success: false, error: errorMessage };
  }
}

/**
 * Step 1: Request APT tokens for gas via web funding API
 */
export async function requestAPT(ethAddress: string) {
  // Always use lowercase for consistency with submitNativeTransaction
  const derived = await getDerivedAddress(ethAddress.toLowerCase());

  // Do not pass host from the client — the server determines the Aptos node
  // URL from its own environment (ATOMICA_APTOS_HOST). Passing a client-side
  // host value caused TLS errors when localStorage held a stale https:// URL.
  const res = await fetch("/api/aptos/fund", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: derived.toString(),
      amount: 100000000,
    }),
  });

  const body = (await res.json().catch(() => ({}))) as {
    txHash?: string;
    error?: string;
  };

  if (!res.ok) {
    const text = body.error || "No response text";
    console.error(
      `Funding API Failed: ${res.status} ${res.statusText} - ${text}`,
    );
    throw new Error(`Funding API Failed: ${text}`);
  }

  return { hash: body.txHash || "apt-funded" };
}

/**
 * Check if auction contracts are deployed
 */
export async function areContractsDeployed(): Promise<boolean> {
  return areCoreContractsDeployed();
}

export async function areCoreContractsDeployed(): Promise<boolean> {
  const requiredModules = ["lock_receipt", "eth_proof"];
  try {
    const modules = await aptos.getAccountModules({
      accountAddress: CONTRACT_ADDR,
    });
    const deployed = new Set(
      modules
        .map((module: { abi?: { name?: string } }) => module.abi?.name)
        .filter(Boolean),
    );
    return requiredModules.every((name) => deployed.has(name));
  } catch (e) {
    console.log("Core Aptos contracts not yet deployed:", e);
    return false;
  }
}

/** The launch pair bytes, the default `pairBcs` of every client. */
export { LAUNCH_PAIR_BCS };

/**
 * Query `auction::is_pair_allowed`: whether a window may be created for these
 * pair bytes.
 *
 * @see docs/architecture/v0-architecture.md §2.3
 */
export async function isPairAllowed(pairBcs: Uint8Array): Promise<boolean> {
  const result = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::auction::is_pair_allowed`,
      functionArguments: [pairBcs],
    },
  });
  return result[0] as boolean;
}

/**
 * Query `auction::launch_pair_bcs`: the launch pair bytes as the chain
 * computes them. They equal {@link LAUNCH_PAIR_BCS}.
 *
 * @see docs/architecture/v0-architecture.md §2.4
 */
export async function getLaunchPairBcs(): Promise<Uint8Array> {
  const result = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::auction::launch_pair_bcs`,
      functionArguments: [],
    },
  });
  return ethers.getBytes(result[0] as string);
}

// SCOUT(#243) EDIT: drop the timelockId parameter and argument; create_auction registers the window's timelock itself.
// SCOUT(#217) EDIT: minPrice is a whole-USD price for as long as the reserve price exists.
/**
 * Build payload for auction::create_auction (v0 Beta global-registry).
 *
 *   create_auction(seller, window_id, pair_bcs, lock_id, timelock_id)
 *
 * `pairBcs` must be on the pair allowlist (`E_PAIR_NOT_ALLOWED` otherwise);
 * pass {@link LAUNCH_PAIR_BCS}.
 * There is no reserve price: clearing alone sets the price.
 * `timelockId` is the id that `ibe_config::register_timelock` returned for the
 * window's deadline. Register it first with {@link registerTimelock}.
 *
 * @see docs/architecture/v0-architecture.md §2.3
 */
export function getCreateAuctionPayload(
  windowId: bigint,
  pairBcs: Uint8Array,
  lockId: Uint8Array,
  timelockId: bigint,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::auction::create_auction`,
    functionArguments: [windowId, pairBcs, lockId, timelockId],
  };
}

// SCOUT(#243) EDIT: drop the timelockId parameter.
export async function submitCreateAuction(
  ethAddress: string,
  windowId: bigint,
  pairBcs: Uint8Array,
  lockId: Uint8Array,
  timelockId: bigint,
) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getCreateAuctionPayload(windowId, pairBcs, lockId, timelockId),
  );
}

// SCOUT(#243) REMOVE: the SDK no longer builds a register_timelock payload; the integration helper registerTimelockDirect imports this one.
// SCOUT(#225) EDIT: once the framework pin has the registrar check, this entry aborts with E_NOT_REGISTRAR for every wallet.
/**
 * Build payload for the framework entry
 * `0x1::ibe_config::register_timelock(account, deadline_us)`.
 *
 * The chain aborts unless the epoch's IBE key is ready, `deadlineUs` is in the
 * future, and `deadlineUs` is at least 15 minutes before the epoch ends.
 */
export function getRegisterTimelockPayload(
  deadlineUs: bigint,
): InputGenerateTransactionPayloadData {
  return {
    function: "0x1::ibe_config::register_timelock",
    functionArguments: [deadlineUs],
  };
}

// SCOUT(#243) EDIT: decide whether this constant and timelockIdFromEvents stay for the live test that reads the registration event, or go with registerTimelock.
/** Event type that `ibe_config::register_timelock` emits. */
export const TIMELOCK_REGISTRATION_EVENT =
  "0x1::ibe_config::TimelockRegistrationEvent";

/**
 * Read the timelock id from the events of a `register_timelock` transaction.
 * Throws when the transaction emitted no `TimelockRegistrationEvent`.
 */
export function timelockIdFromEvents(
  events: ReadonlyArray<{ type: string; data: unknown }>,
): bigint {
  const event = events.find((e) => e.type === TIMELOCK_REGISTRATION_EVENT);
  if (!event) {
    throw new Error("register_timelock emitted no TimelockRegistrationEvent");
  }
  return BigInt((event.data as { timelock_id: string }).timelock_id);
}

// SCOUT(#243) REMOVE: no client registers a timelock; AuctionCreator and useSellFlow call this today.
// SCOUT(#225) EDIT: this call fails for every user wallet once the framework pin has the registrar check.
/**
 * Register a timelock for `deadlineUs` and return its id. Call this before
 * `create_auction`, which records the id on the window.
 */
export async function registerTimelock(
  ethAddress: string,
  deadlineUs: bigint,
): Promise<bigint> {
  const { hash } = await submitNativeTransaction(
    aptos,
    ethAddress,
    getRegisterTimelockPayload(deadlineUs),
  );
  const tx = await aptos.waitForTransaction({ transactionHash: hash });
  return timelockIdFromEvents("events" in tx ? tx.events : []);
}

// SCOUT(#243) ADD: derives the package's timelock registrar address, object::create_object_address(@atomica, seed), from the module address.
export function timelockRegistrarAddress(_moduleAddress?: string): string {
  throw new Error("NOT_IMPLEMENTED: SCOUT(#243) timelockRegistrarAddress");
}

// SCOUT(#243) ADD: reader for the view that returns the timelock id of a window id.
export async function getWindowTimelock(_windowId: bigint): Promise<bigint> {
  throw new Error("NOT_IMPLEMENTED: SCOUT(#243) getWindowTimelock");
}

// SCOUT(#243) ADD: reader for the view that returns the timelock deadline of a window id, in microseconds.
export async function getWindowDeadlineUs(_windowId: bigint): Promise<bigint> {
  throw new Error("NOT_IMPLEMENTED: SCOUT(#243) getWindowDeadlineUs");
}

/** The asset of a lock receipt: the `lock_receipt` type argument. */
export type RegisterLockAsset = "FakeETH" | "FakeUSD";

/**
 * Build payload for lock_receipt::register_ethereum_lock<Asset>.
 *
 * `asset` sets the receipt type: `FakeETH` (the default) for a seller lock,
 * `FakeUSD` for a bidder's collateral lock. It must name the token the proof
 * covers, or Aptos rejects the registration.
 *
 * Serialises directly from LockedBalanceProof, matching the Move entry function:
 *   register_ethereum_lock<Asset>(carrier, block_number, user_address,
 *     lock_nonce, amount, window_id, pair_hash, account_proof, storage_proof)
 *
 * The proof covers LockBox `commitments[lockId]`; Aptos recomputes the
 * commitment from (amount, window_id, pair_hash) and the deadline
 * `auction::eth_lock_deadline(window_id)`, which LockBox computed. No deadline
 * is sent.
 *
 * Any account may send it. Aptos reads the state root of `blockNumber` from
 * the validator-certified `0x1::ethereum_headers` store, so prove at a
 * certified block ({@link waitForCertifiedBlock}). Aptos also derives the
 * LockBox address, the token, the storage key and the receipt owner (the
 * depositor's Ethereum-derivable account), so the proof's own root and key are
 * not sent.
 */
export function getRegisterLockPayload(
  proof: LockedBalanceProof,
  asset: RegisterLockAsset = "FakeETH",
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::lock_receipt::register_ethereum_lock`,
    typeArguments: [`${CONTRACT_ADDR}::lock_receipt::${asset}`],
    functionArguments: [
      proof.blockNumber,
      ethers.getBytes(proof.userAddress),
      proof.lockNonce.toString(), // u64 as decimal string
      proof.amount.toString(), // u256 as decimal string
      proof.windowId.toString(), // u64 as decimal string
      ethers.getBytes(proof.pairHash),
      proof.accountProof.map((node) => ethers.getBytes(node)),
      proof.storageProof.map((node) => ethers.getBytes(node)),
    ],
  };
}

/**
 * Highest Ethereum block number the Aptos validators certified
 * (`0x1::ethereum_headers::latest_block_number`), or `undefined` before the
 * first certified header.
 */
export async function getLatestCertifiedBlock(
  client: Aptos = aptos,
): Promise<number | undefined> {
  const [latest] = await client.view({
    payload: {
      function: "0x1::ethereum_headers::latest_block_number",
      functionArguments: [],
    },
  });
  // Option<u64> is returned as { vec: [] } or { vec: ["123"] }.
  const vec = (latest as { vec: (string | number)[] }).vec;
  return vec.length === 0 ? undefined : Number(vec[0]);
}

/**
 * Wait until the validators certify an Ethereum block at or after
 * `minBlock`, and return the highest certified block number. Prove a lock at
 * that block: its state root is on Aptos and it includes the lock.
 *
 * Throws after `timeoutMs` without such a block.
 */
export async function waitForCertifiedBlock(
  minBlock: number,
  timeoutMs = 120_000,
  client: Aptos = aptos,
  pollMs = 2_000,
): Promise<number> {
  const deadline = Date.now() + timeoutMs;
  let latest: number | undefined;
  for (;;) {
    latest = await getLatestCertifiedBlock(client);
    if (latest !== undefined && latest >= minBlock) return latest;
    if (Date.now() >= deadline) break;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error(
    `No certified Ethereum block at or after ${minBlock} within ${timeoutMs} ms (latest certified: ${latest ?? "none"})`,
  );
}

// SCOUT(#228) EDIT: drop the commitment parameter; submit_bid takes five arguments.
/**
 * Build payload for auction::submit_bid (V2 bid wrapper).
 *
 *   submit_bid(bidder, window_id, pair_bcs, ciphertext, commitment,
 *              collateral_lock_id, quantity)
 *
 * `ciphertext` is the V2 bid ciphertext `BCS(vk, U, nonce, C, sig)`. The contract
 * builds the associated data on chain (see `buildBidAd`) and aborts unless
 * `ibe::verify_bid_ct` accepts the ciphertext for it.
 * `commitment` is the 32-byte price commitment (see `computeBidCommitment`).
 * `collateralLockId` is the FakeUSD LockReceipt ID held as margin.
 * `quantity` is the bid quantity in wei (u256).
 *
 * @see atomica/docs/decisions/auction-v2-bid-wrapper.md
 */
export function getBidPayload(
  windowId: bigint,
  pairBcs: Uint8Array,
  ciphertext: Uint8Array,
  commitment: Uint8Array,
  collateralLockId: Uint8Array,
  quantity: bigint,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::auction::submit_bid`,
    functionArguments: [
      windowId,
      pairBcs,
      ciphertext,
      commitment,
      collateralLockId,
      quantity,
    ],
  };
}

// SCOUT(#228) EDIT: drop the commitment parameter.
export async function submitBid(
  ethAddress: string,
  windowId: bigint,
  pairBcs: Uint8Array,
  ciphertext: Uint8Array,
  commitment: Uint8Array,
  collateralLockId: Uint8Array,
  quantity: bigint,
) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getBidPayload(
      windowId,
      pairBcs,
      ciphertext,
      commitment,
      collateralLockId,
      quantity,
    ),
  );
}

/**
 * Build payload for auction::settle (v0 Beta global-registry).
 *
 * Parameters match the Phase 3a rewrite from issue #86:
 *   settle(caller, window_id, pair_bcs)
 *
 * @see docs/architecture/v0-architecture.md §2.7
 */
export function getSettlePayload(
  windowId: bigint,
  pairBcs: Uint8Array,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::auction::settle`,
    functionArguments: [windowId, pairBcs],
  };
}

export async function submitSettle(
  ethAddress: string,
  windowId: bigint,
  pairBcs: Uint8Array,
) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getSettlePayload(windowId, pairBcs),
  );
}

/**
 * Query `auction::is_settled` view function (v0 Beta window-keyed).
 *
 * Returns true if the auction window identified by (windowId, pairBcs) has
 * been settled. Returns false if no window exists.
 *
 * @see docs/architecture/v0-architecture.md §2.3
 */
export async function isSettled(
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<boolean> {
  const result = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::auction::is_settled`,
      functionArguments: [windowId, pairBcs],
    },
  });
  return result[0] as boolean;
}

// SCOUT(#217) EDIT: clearingPrice is whole USD per whole base token; say so in the doc.
/**
 * Query `auction::get_settlement` view function (v0 Beta window-keyed).
 *
 * Returns { clearingPrice, totalFilled } after settlement. `totalFilled` is
 * the sum of the winners' fills, not the window supply. Both are 0 before the
 * window settles. Aborts if no window exists for (windowId, pairBcs).
 *
 * @see docs/architecture/v0-architecture.md §2.7
 */
export async function getSettlement(
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<{ clearingPrice: bigint; totalFilled: bigint }> {
  const result = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::auction::get_settlement`,
      functionArguments: [windowId, pairBcs],
    },
  });
  return {
    clearingPrice: BigInt(result[0] as string),
    totalFilled: BigInt(result[1] as string),
  };
}

// ── Bid result view (issue #112) ──────────────────────────────────────────────

/**
 * A single bid result entry returned by `auction::get_bid_results`.
 *
 * Mirrors the on-chain `auction::BidResult` struct used to join AuctionSettled
 * events with per-winner Ethereum addresses and fill amounts.
 *
 * @see docs/architecture/v0-architecture.md §2.9 — AuctionSettled event
 */
export interface BidResult {
  /** Aptos address (32-byte hex) of the bidder. */
  bidder: string;
  /** Fill amount in base-token wei (0 for losers). */
  fillAmount: bigint;
  /** True if this bidder won and was filled at the clearing price. */
  isWinner: boolean;
}

/**
 * Query `auction::get_bid_results` view function (issue #112).
 *
 * Returns the full list of bid results for a settled auction window, for
 * display. Payouts on Ethereum come from the per-lock outcomes Aptos records
 * (`getLockOutcome`), carried by settlement/outcome-carrier.ts.
 *
 * NOTE: This function will return an empty array if called before settlement
 * is finalized for the given window/pair combination.
 *
 * @param windowId - Auction window ID
 * @param pairBcs  - BCS-encoded Pair struct
 * @returns Array of {@link BidResult} entries (empty if not yet settled).
 *
 * @see docs/architecture/v0-architecture.md §2.9
 */
export async function getBidResults(
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<BidResult[]> {
  try {
    const result = await aptos.view({
      payload: {
        function: `${CONTRACT_ADDR}::auction::get_bid_results`,
        functionArguments: [windowId, pairBcs],
      },
    });
    // The Move function returns vector<BidResult> serialised as an array of objects.
    const raw = result[0] as Array<{
      bidder: string;
      fill_amount: string;
      is_winner: boolean;
    }>;
    return raw.map(({ bidder, fill_amount, is_winner }) => ({
      bidder,
      fillAmount: BigInt(fill_amount),
      isWinner: is_winner,
    }));
  } catch (e: unknown) {
    // Return empty array for not-yet-settled windows to allow callers to handle gracefully.
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("ABORTED") || msg.includes("abort_code")) {
      return [];
    }
    throw e;
  }
}

// SCOUT(#218) ADD: the four window limits the new auction view returns.
export interface WindowLimits {
  maxBidsPerWindow: bigint;
  maxSellerLocksPerWindow: bigint;
  minSellerLockAmount: bigint;
  minBidCollateral: bigint;
}

// SCOUT(#218) ADD: reader for the window limits view.
export async function getWindowLimits(): Promise<WindowLimits> {
  throw new Error("NOT_IMPLEMENTED: SCOUT(#218) getWindowLimits");
}

// SCOUT(#236) REMOVE: the faucet claim payload.
/**
 * Build payload for fake_eth::mint (Demo-phase winner payout).
 *
 * Entry function: mint(account: &signer, amount: u64)
 * In Demo phase, `mint` is a public faucet anyone can call. It mints FakeETH
 * to the signer's own Aptos account. The winner calls this directly via SIWE
 * to self-mint the payout amount.
 */
export function getClaimMintPayload(
  amount: bigint,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::fake_eth::mint`,
    functionArguments: [amount],
  };
}

// SCOUT(#236) REMOVE: the faucet claim.
/**
 * Submit a Demo-phase claim: the winner self-mints FakeETH via SIWE.
 */
export async function submitClaim(ethAddress: string, amount: bigint) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getClaimMintPayload(amount),
  );
}

// SCOUT(#236) EDIT: only ClaimButton and the claim tests read this Aptos-side balance; remove it with them or name its new reader.
/**
 * Query `fake_eth::balance` view function.
 * Returns the FakeETH FA balance for the given Aptos address.
 */
export async function getFakeEthBalance(ownerAddr: string): Promise<bigint> {
  const result = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::fake_eth::balance`,
      functionArguments: [ownerAddr],
    },
  });
  return BigInt(result[0] as string);
}

/**
 * Query `timelock::get_mpk` view function.
 *
 * Returns the master public key of the current epoch (compressed G2, 96 bytes)
 * stored by the registry.
 *
 * @see atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md section 7
 */
export async function getMpk(): Promise<Uint8Array> {
  const result = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::timelock::get_mpk`,
      functionArguments: [],
    },
  });
  const hex = result[0] as string;
  const clean = hex.replace(/^0x/, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Query `timelock::is_revealed` view function.
 *
 * Returns true once the verified decryption key of the timelock is on chain,
 * enabling off-chain bid decryption.
 *
 * @param timelockId - Timelock identifier
 */
export async function isRevealed(timelockId: bigint): Promise<boolean> {
  const result = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::timelock::is_revealed`,
      functionArguments: [timelockId],
    },
  });
  return result[0] as boolean;
}

/** Registry status of a timelock (`timelock::get_status`). */
export type TimelockStatus = "pending" | "revealed" | "expired";

/** Why a timelock expired (`timelock::get_expiry_reason`). */
export type TimelockExpiryReason =
  "epoch-ended" | "reveal-window-elapsed" | "key-check-failed";

/**
 * Query `timelock::get_status` and, for an expired timelock,
 * `timelock::get_expiry_reason`.
 *
 * An expired window can never open its bids. Call `refund_expired_window`.
 */
export async function getTimelockStatus(
  timelockId: bigint,
): Promise<{ status: TimelockStatus; reason?: TimelockExpiryReason }> {
  const statusResult = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::timelock::get_status`,
      functionArguments: [timelockId],
    },
  });
  const code = Number(statusResult[0]);
  if (code === 0) return { status: "pending" };
  if (code === 1) return { status: "revealed" };
  const reasonResult = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::timelock::get_expiry_reason`,
      functionArguments: [timelockId],
    },
  });
  const reasons: TimelockExpiryReason[] = [
    "epoch-ended",
    "reveal-window-elapsed",
    "key-check-failed",
  ];
  return { status: "expired", reason: reasons[Number(reasonResult[0]) - 1] };
}

// SCOUT(#228) REMOVE: submit_cleartext_and_clear is deleted.
// SCOUT(#217) EDIT: cleartexts are whole-USD prices.
/**
 * Build payload for `auction::submit_cleartext_and_clear`.
 *
 * Called after the timelock status is `Revealed` and bids were decrypted off
 * chain with the revealed key. Index-aligned to the window's bids.
 * `cleartexts[i]` and `salts[i]` open bid `i`. An empty salt skips bid `i`.
 * The contract checks every opening against the commitment made at submission,
 * so a relayer cannot change a price.
 *
 * @see atomica/docs/decisions/auction-v2-bid-wrapper.md
 */
export function getSubmitCleartextPayload(
  windowId: bigint,
  pairBcs: Uint8Array,
  cleartexts: bigint[],
  salts: Uint8Array[],
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::auction::submit_cleartext_and_clear`,
    functionArguments: [windowId, pairBcs, cleartexts, salts],
  };
}

// SCOUT(#228) REMOVE: AuctionRevealer calls this today.
// SCOUT(#236) EDIT: the single open action sends this one transaction until the commit and reveal removal (228) replaces it with openBids.
export async function submitCleartextAndClear(
  ethAddress: string,
  windowId: bigint,
  pairBcs: Uint8Array,
  cleartexts: bigint[],
  salts: Uint8Array[],
) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getSubmitCleartextPayload(windowId, pairBcs, cleartexts, salts),
  );
}

// SCOUT(#228) REMOVE: open_bid is deleted.
// SCOUT(#217) EDIT: price is a whole-USD price.
/** Build payload for `auction::open_bid` (one bid, any caller). */
export function getOpenBidPayload(
  windowId: bigint,
  pairBcs: Uint8Array,
  bidIndex: bigint,
  price: bigint,
  salt: Uint8Array,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::auction::open_bid`,
    functionArguments: [windowId, pairBcs, bidIndex, price, salt],
  };
}

// SCOUT(#228) REMOVE: no component calls it.
// SCOUT(#236) EDIT: still has no caller after the single open action; delete it here or leave it to the commit and reveal removal (228).
export async function openBid(
  ethAddress: string,
  windowId: bigint,
  pairBcs: Uint8Array,
  bidIndex: bigint,
  price: bigint,
  salt: Uint8Array,
) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getOpenBidPayload(windowId, pairBcs, bidIndex, price, salt),
  );
}

// SCOUT(#228) REMOVE: finalize_reveal is deleted.
/**
 * Build payload for `auction::finalize_reveal`: close openings once every bid
 * is open or the opening window ended. Unopened bids become invalid.
 */
export function getFinalizeRevealPayload(
  windowId: bigint,
  pairBcs: Uint8Array,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::auction::finalize_reveal`,
    functionArguments: [windowId, pairBcs],
  };
}

// SCOUT(#228) REMOVE: no component calls it.
// SCOUT(#236) EDIT: still has no caller after the single open action; delete it here or leave it to the commit and reveal removal (228).
export async function finalizeReveal(
  ethAddress: string,
  windowId: bigint,
  pairBcs: Uint8Array,
) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getFinalizeRevealPayload(windowId, pairBcs),
  );
}

// SCOUT(#228) ADD: payload for auction::open_bids(window_id, pair_bcs, max_bids).
export function getOpenBidsPayload(
  _windowId: bigint,
  _pairBcs: Uint8Array,
  _maxBids: bigint,
): InputGenerateTransactionPayloadData {
  throw new Error("NOT_IMPLEMENTED: SCOUT(#228) getOpenBidsPayload");
}

// SCOUT(#228) ADD: sends open_bids; any account may call it once the timelock is revealed.
export async function openBids(
  _ethAddress: string,
  _windowId: bigint,
  _pairBcs: Uint8Array,
  _maxBids: bigint,
): Promise<{ hash: string }> {
  throw new Error("NOT_IMPLEMENTED: SCOUT(#228) openBids");
}

/**
 * Build payload for `auction::refund_expired_window`: release every receipt of
 * a window whose timelock expired (any reason).
 */
export function getRefundExpiredWindowPayload(
  windowId: bigint,
  pairBcs: Uint8Array,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::auction::refund_expired_window`,
    functionArguments: [windowId, pairBcs],
  };
}

export async function refundExpiredWindow(
  ethAddress: string,
  windowId: bigint,
  pairBcs: Uint8Array,
) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getRefundExpiredWindowPayload(windowId, pairBcs),
  );
}

// ── Permissionless unwind (issue 195) ─────────────────────────────────────────
//
// Owner axioms: any user can unwind a finished or stuck auction, and every
// lock goes home unless the auction executed flawlessly. These builders need
// no special signer. See docs/specifications/auction-timing.md (stuck
// deadline) and docs/decisions/trustless-v0-1-unwinding.md.

/** Asset of a lock receipt: `lock_receipt::FakeETH` or `lock_receipt::FakeUSD`. */
export type ReceiptAsset = "FakeETH" | "FakeUSD";

/** `lock_receipt` status codes (`STATUS_*` in lock_receipt.move). */
export const RECEIPT_STATUS = {
  Active: 0,
  Claimed: 1,
  Revoked: 2,
  Filled: 3,
} as const;

function receiptTypeArgs(asset: ReceiptAsset): string[] {
  return [
    `${CONTRACT_ADDR}::lock_receipt::Ethereum`,
    `${CONTRACT_ADDR}::lock_receipt::${asset}`,
  ];
}

/**
 * Build payload for `auction::unwind(window_id, pair_bcs)`. Anyone may send it
 * at or after the window's stuck deadline. An unsettled window gets its
 * all-refund `AuctionOutcome`. A finalized window returns the receipts it
 * still holds.
 */
export function getUnwindPayload(
  windowId: bigint,
  pairBcs: Uint8Array,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::auction::unwind`,
    functionArguments: [windowId, pairBcs],
  };
}

export async function submitUnwind(
  ethAddress: string,
  windowId: bigint,
  pairBcs: Uint8Array,
) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getUnwindPayload(windowId, pairBcs),
  );
}

/**
 * Build payload for `lock_receipt::cancel_unauctioned<Ethereum, Asset>(lock_id)`:
 * revoke a receipt no window claimed, once it is older than the cancel delay.
 * Its lock is in no outcome tree, so it goes home by `LockBox.reclaim`.
 */
export function getCancelUnauctionedPayload(
  asset: ReceiptAsset,
  lockId: Uint8Array,
): InputGenerateTransactionPayloadData {
  return {
    function: `${CONTRACT_ADDR}::lock_receipt::cancel_unauctioned`,
    typeArguments: receiptTypeArgs(asset),
    functionArguments: [lockId],
  };
}

export async function submitCancelUnauctioned(
  ethAddress: string,
  asset: ReceiptAsset,
  lockId: Uint8Array,
) {
  return await submitNativeTransaction(
    aptos,
    ethAddress,
    getCancelUnauctionedPayload(asset, lockId),
  );
}

/** `auction::get_stuck_deadline_us`: from it on anyone may unwind the window. */
export async function getStuckDeadlineUs(
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<bigint> {
  const [deadline] = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::auction::get_stuck_deadline_us`,
      functionArguments: [windowId, pairBcs],
    },
  });
  return BigInt(String(deadline));
}

/** `auction::get_window_lock_ids`: seller (FakeETH) and collateral (FakeUSD) lock ids. */
export async function getWindowLockIds(
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<{ sellers: string[]; collateral: string[] }> {
  const [sellers, collateral] = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::auction::get_window_lock_ids`,
      functionArguments: [windowId, pairBcs],
    },
  });
  return {
    sellers: (sellers as unknown[]).map(String),
    collateral: (collateral as unknown[]).map(String),
  };
}

/** `lock_receipt::get_receipt` status of one receipt (`RECEIPT_STATUS`). */
export async function getReceiptStatus(
  asset: ReceiptAsset,
  lockId: string,
): Promise<number> {
  const result = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::lock_receipt::get_receipt`,
      typeArguments: receiptTypeArgs(asset),
      functionArguments: [ethers.getBytes(lockId)],
    },
  });
  return Number(result[3]);
}

/** The terminal outcome Aptos recorded for one lock (`lock_receipt::get_lock_outcome`). */
export interface LockOutcome {
  /** `RECEIPT_STATUS.Revoked` (all to the depositor) or `RECEIPT_STATUS.Filled` */
  kind: number;
  windowId: bigint;
  /** 20-byte Ethereum recipients, checksummed */
  recipients: string[];
  amounts: bigint[];
}

/**
 * `lock_receipt::get_lock_outcome<Ethereum, Asset>`: the payouts of a lock's
 * leaf in its window's outcome tree. Aborts (E_NO_OUTCOME) while it has none.
 */
export async function getLockOutcome(
  asset: ReceiptAsset,
  lockId: string,
): Promise<LockOutcome> {
  const [kind, windowId, recipients, amounts] = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::lock_receipt::get_lock_outcome`,
      typeArguments: receiptTypeArgs(asset),
      functionArguments: [ethers.getBytes(lockId)],
    },
  });
  return {
    kind: Number(kind),
    windowId: BigInt(String(windowId)),
    recipients: (recipients as unknown[]).map((r) =>
      ethers.getAddress(String(r)),
    ),
    amounts: (amounts as unknown[]).map((a) => BigInt(String(a))),
  };
}

/** Whether `auction::unwind` would succeed now, and why not. */
export interface UnwindEligibility {
  eligible: boolean;
  /** Chain time of the stuck deadline, microseconds */
  stuckDeadlineUs: bigint;
  /** Chain time the check used, microseconds */
  nowUs: bigint;
  /** The window settled or refunded: its AuctionOutcome is already out */
  final: boolean;
  /** Receipts the window still holds (status CLAIMED) */
  heldLocks: number;
  reason: "eligible" | "before-stuck-deadline" | "nothing-to-return";
}

/**
 * Read whether a window can be unwound: its stuck deadline has passed, and it
 * is either unfinished (unwind emits the all-refund outcome) or finished with
 * receipts still held (unwind returns them). Mirrors the checks of
 * `auction::unwind` (E_NOT_STUCK, E_WINDOW_FINAL). Uses the Aptos ledger
 * clock.
 */
export async function getUnwindEligibility(
  windowId: bigint,
  pairBcs: Uint8Array,
): Promise<UnwindEligibility> {
  const [stuckDeadlineUs, ledger, settled, status] = await Promise.all([
    getStuckDeadlineUs(windowId, pairBcs),
    aptos.getLedgerInfo(),
    isSettled(windowId, pairBcs),
    aptos.view({
      payload: {
        function: `${CONTRACT_ADDR}::auction::get_window_status`,
        functionArguments: [windowId, pairBcs],
      },
    }),
  ]);
  const nowUs = BigInt(String(ledger.ledger_timestamp));
  const final = settled || status[2] === true;
  let heldLocks = 0;
  if (final) {
    const ids = await getWindowLockIds(windowId, pairBcs);
    const statuses = await Promise.all([
      ...ids.sellers.map((id) => getReceiptStatus("FakeETH", id)),
      ...ids.collateral.map((id) => getReceiptStatus("FakeUSD", id)),
    ]);
    heldLocks = statuses.filter((s) => s === RECEIPT_STATUS.Claimed).length;
  }
  const reason =
    nowUs < stuckDeadlineUs
      ? "before-stuck-deadline"
      : final && heldLocks === 0
        ? "nothing-to-return"
        : "eligible";
  return {
    eligible: reason === "eligible",
    stuckDeadlineUs,
    nowUs,
    final,
    heldLocks,
    reason,
  };
}

// ── SIWE domain guard (issue 195) ─────────────────────────────────────────────

/** `eth_proof::siwe_domain`: the SIWE domain whose accounts own lock receipts. */
export async function getSiweDomain(): Promise<string> {
  const [domain] = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::eth_proof::siwe_domain`,
      functionArguments: [],
    },
  });
  return ethers.toUtf8String(String(domain));
}

/** Thrown when this page's host is not the pinned SIWE domain. */
export class SiweDomainMismatchError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(
      `This page runs on ${actual}, but lock receipts belong to accounts of ${expected}. Open the app on ${expected} before you lock tokens.`,
    );
    this.name = "SiweDomainMismatchError";
  }
}

/**
 * Throw {@link SiweDomainMismatchError} unless `host` equals the pinned SIWE
 * domain. Call it before every lock: a receipt belongs to the depositor's
 * Ethereum-derivable account of the pinned domain, so tokens locked from
 * another host could never be claimed on Aptos.
 */
export async function assertSiweDomain(
  host: string = window.location.host,
): Promise<void> {
  const expected = await getSiweDomain();
  if (expected !== host) throw new SiweDomainMismatchError(expected, host);
}

// ── LockBox and token pin (issue 234) ─────────────────────────────────────────

/**
 * `eth_proof::get_config`: the LockBox, FakeETH and FakeUSD addresses that
 * Aptos accepts lock proofs for. Rejects when the view aborts
 * (`E_CONFIG_NOT_SET`) or the node cannot be reached.
 */
export async function getPinnedEthereumConfig(): Promise<PinnedEthereumConfig> {
  const [lockBox, fakeETH, fakeUSD] = await aptos.view({
    payload: {
      function: `${CONTRACT_ADDR}::eth_proof::get_config`,
      functionArguments: [],
    },
  });
  return {
    lockBox: String(lockBox),
    fakeETH: String(fakeETH),
    fakeUSD: String(fakeUSD),
  };
}

// The SDK approve and lock functions (ethereum/lockbox.ts) check the pin
// through this reader. Registering it here keeps the Aptos client out of the
// @atomica/sdk/ethereum entry.
setPinnedEthereumConfigReader(getPinnedEthereumConfig);
