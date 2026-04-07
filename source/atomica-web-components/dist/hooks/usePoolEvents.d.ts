/**
 * usePoolEvents — Subscribe to real-time pool events from both chains.
 *
 * Phase 1 (current): Subscribes to `TokensLocked` events on the Ethereum
 * LockBox contract via ethers.js. Calls the provided `onEvent` callback
 * whenever a new lock is detected, enabling immediate UI refresh.
 *
 * Phase 2 (future — Aptos events):
 *   - Poll Aptos event stream for `LockRegistered` events from lock_receipt module
 *   - Or use Aptos indexer when available
 *
 * When Ethereum RPC is not configured (zero address lockBox), the hook
 * gracefully falls back to a no-op.
 */
/**
 * Subscribe to `TokensLocked` events on the Ethereum LockBox contract.
 *
 * Calls `onEvent()` each time a new `TokensLocked` event is received.
 * Cleans up the event listener when the component unmounts or `onEvent`
 * changes.
 *
 * Falls back to a no-op if:
 *   - The LockBox address is the zero address (not configured)
 *   - The Ethereum RPC URL is unreachable
 */
export declare function usePoolEvents(onEvent: () => void): void;
//# sourceMappingURL=usePoolEvents.d.ts.map