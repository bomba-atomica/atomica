// SCOUT(#236) ADD: ReleaseButton, the third step of the UI happy path (open, settle, release); this stub renders nothing.
//
// Not exported from src/index.ts and not mounted in any screen yet.
//
// Intended behaviour:
//   1. Read LockBox.outcomes(auctionKey). When no outcome is recorded, carry
//      the window's AuctionOutcome to Ethereum with the SDK outcome carrier.
//   2. Call LockBox.releaseByOutcome once per lock of the window that is
//      still open.
//   3. Show each lock's status. Disable the button when every lock is
//      released.
// Anyone may press it, so no prop names a seller or a bidder.
//
// Left to the SDK unwind issue (195): the outcome carrier
// (source/atomica-sdk/src/settlement/outcome-carrier.ts), the recordOutcome
// and releaseByOutcome bindings, UnwindButton and ReclaimLockButton. After an
// unwind the same release loop pays every lock back, so both buttons should
// share the hook stub in ../hooks/useWindowRelease.ts.
//
// SCOUT(#236) EDIT: releaseByOutcome reverts on an unpayable leaf; for that lock call LockBox.reclaimUnpayable (the leaf rule issue (222)), chosen by planWindowReleases.

/** Props of the planned ReleaseButton. */
export interface ReleaseButtonProps {
  /** Auction window id. */
  windowId: bigint;
  /** Pair bytes of the window key. */
  pairBcs: Uint8Array;
}

export function ReleaseButton(_props: ReleaseButtonProps): null {
  return null;
}
