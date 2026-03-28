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

export function usePoolEvents(_onEvent: () => void): void {
  // TODO (Ethereum): subscribe to TokensLocked events via ethers.js provider
  //   const provider = new ethers.JsonRpcProvider(config.ethereum.rpcUrl);
  //   const contract = new ethers.Contract(lockBoxAddress, LOCKBOX_ABI, provider);
  //   contract.on("TokensLocked", onEvent);
  //   return () => { contract.off("TokensLocked", onEvent); };
  // TODO (Aptos, I-D4): poll or subscribe to LockReceiptCreated events
  //   aptos.getEventsByEventHandle({ ... }) periodically and call onEvent on new events
}
