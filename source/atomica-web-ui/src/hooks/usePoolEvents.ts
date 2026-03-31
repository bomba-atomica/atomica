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

import { useEffect, useRef } from "react";
import { ethers } from "ethers";
import { getChainConfig } from "../lib/chain-config";

// Minimal ABI — only the event we need to subscribe to.
const LOCKBOX_EVENT_ABI = [
  "event TokensLocked(address indexed user, address indexed token, uint256 amount, uint256 unlockTime)",
] as const;

/** Zero address used as the default when no contract is deployed. */
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

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
export function usePoolEvents(onEvent: () => void): void {
  // Keep a stable ref to the latest callback so the effect cleanup/re-subscribe
  // cycle doesn't churn on every render.
  const callbackRef = useRef(onEvent);
  callbackRef.current = onEvent;

  useEffect(() => {
    const config = getChainConfig();
    const lockBoxAddress = config.ethereum.lockBox;

    // If the lockBox is not configured, skip subscription entirely.
    if (!lockBoxAddress || lockBoxAddress === ZERO_ADDRESS) {
      return;
    }

    let provider: ethers.JsonRpcProvider;
    try {
      provider = new ethers.JsonRpcProvider(config.ethereum.rpcUrl);
    } catch (err) {
      console.warn("[usePoolEvents] Failed to create Ethereum provider:", err);
      return;
    }

    const contract = new ethers.Contract(
      lockBoxAddress,
      LOCKBOX_EVENT_ABI,
      provider,
    );

    // Listener wraps the stable ref so we don't need to re-subscribe when the
    // callback identity changes.
    const listener = () => {
      callbackRef.current();
    };

    // Subscribe. ethers v6 `on` uses polling on JsonRpcProvider (which is fine
    // for HTTP endpoints — it polls `eth_getFilterChanges`).
    contract.on("TokensLocked", listener).catch((err: unknown) => {
      console.warn(
        "[usePoolEvents] Failed to subscribe to TokensLocked events:",
        err,
      );
    });

    // Cleanup: remove the listener when the component unmounts.
    return () => {
      contract.off("TokensLocked", listener).catch((err: unknown) => {
        console.warn(
          "[usePoolEvents] Failed to remove TokensLocked listener:",
          err,
        );
      });
    };
  }, []); // Empty deps — subscribe once on mount, clean up on unmount.

  // TODO (Aptos, Phase 2): poll or subscribe to LockReceiptCreated events
  //   aptos.getEventsByEventHandle({ ... }) periodically and call onEvent on new events
}
