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
// SCOUT(#222) EDIT: releaseByOutcome will revert on an unpayable leaf, so this button needs the reclaimUnpayable fallback, which issue 222 puts out of scope and no other issue owns.
// SCOUT(#217) EDIT: any price shown beside a lock goes through the SDK formatPrice.

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
