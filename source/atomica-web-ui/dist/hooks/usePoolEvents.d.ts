/**
 * usePoolEvents — Subscribe to real-time pool events from both chains.
 *
 * Intended to trigger a refresh callback whenever:
 *   - TokensLocked fires on Ethereum (user locked FakeETH in LockBox)
 *   - LockReceiptCreated fires on Aptos (user submitted a proof)
 *
 * STUB: Both subscriptions are pending infrastructure work.
 *   - Ethereum: blocked on a stable event-subscription setup (ethers.js
 *     WebSocket provider or polling filter). Use useAuctionPoolTotals for
 *     periodic polling in the meantime.
 *   - Aptos: blocked on lock_receipt.move emitting a queryable event handle
 *     (I-D4). Query the Aptos event API once the module is deployed.
 *
 * When implemented, call `onEvent()` whenever either chain emits a relevant
 * event so callers can re-fetch totals immediately.
 */
export declare function usePoolEvents(_onEvent: () => void): void;
//# sourceMappingURL=usePoolEvents.d.ts.map