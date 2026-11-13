// SCOUT(#236) ADD: useWindowRelease, the state and the action behind ReleaseButton; this stub throws and no component imports it.
//
// What the hook needs, and where each piece comes from today:
//
//   Lock ids of the window
//     auction::get_window_lock_ids returns (seller ids, collateral ids). The
//     Move view exists. The SDK has no reader: call it getWindowLockIds.
//   Payouts of each lock
//     lock_receipt::get_lock_outcome. The view exists only in pull request
//     213. Its SDK reader belongs to the SDK unwind issue (195): call it
//     getLockOutcome.
//   Full Lock struct (depositor, token, nonce, amount, windowId, pairHash,
//   deadline)
//     LockBox stores only a commitment and Aptos stores no nonce, so read the
//     Locked event by its indexed lock id. The SDK has no such reader (its
//     getLocks filters by depositor and token): call it getLockById.
//   Leaf index and proof
//     buildOutcomeTree and outcomeProof from
//     @atomica/sdk/settlement/outcome-tree. Both exist.
//   Recorded outcome
//     LockBox.outcomes(auctionKey). The ABI line exists, the SDK has no
//     helper: call it getRecordedOutcome. auctionKey and lockBinding exist.
//   Carry the outcome
//     carryOutcome from the SDK unwind issue (195): event proof fetch,
//     advanceEpoch and recordOutcome. None of it exists, and abis.ts has no
//     recordOutcome line.
//   Release one lock
//     A releaseByOutcome binding from the SDK unwind issue (195). Only the
//     ABI line exists.
//   Lock status
//     getLockStatus and LOCK_STATUS from @atomica/sdk/ethereum. Both exist.
//
// The carrier needs the version and event index of the settle transaction.
// Nothing on chain stores them, so a wallet that did not send settle has to
// scan for the AuctionOutcome event.
//
// SCOUT(#222) EDIT: a leaf may pay less than the lock amount (the remainder goes to the depositor), and an unpayable leaf needs reclaimUnpayable instead of releaseByOutcome.
// The auction key is (windowId, pairHash) since the LockBox redeploy of the
// computed lock deadline issue (221); auctionKey from the SDK builds it.

/** Ethereum state of one lock of a window. */
export type WindowLockStatus = "open" | "released" | "reclaimed" | "unknown";

/** One lock of a window, with what its outcome leaf pays. */
export interface WindowLockRelease {
  /** bytes32 lock id (LockBox.getLockId). */
  lockId: string;
  /** Which token the lock holds. */
  asset: "FakeETH" | "FakeUSD";
  /** LockBox.statuses(lockId). */
  status: WindowLockStatus;
  /** Payouts of the lock's outcome leaf. */
  payouts: Array<{ recipient: string; amount: bigint }>;
}

/** What ReleaseButton renders and calls. */
export interface WindowReleaseState {
  /** True once LockBox holds the window's outcome root. */
  outcomeRecorded: boolean;
  /** Every lock of the window: seller locks, then bid collateral locks. */
  locks: WindowLockRelease[];
  /** True when no lock of the window is still open. */
  allReleased: boolean;
  loading: boolean;
  error?: string;
  /** Record the outcome if needed, then release every open lock. */
  release: () => Promise<void>;
}

export function useWindowRelease(
  _windowId: bigint | null,
  _pairBcs: Uint8Array | null,
  _account: string | null,
): WindowReleaseState {
  throw new Error("NOT_IMPLEMENTED: SCOUT(#236) useWindowRelease");
}
