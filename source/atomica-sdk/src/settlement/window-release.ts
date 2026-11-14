/**
 * Carry an auction's outcome to Ethereum and pay out every lock of it, from
 * any wallet. Used after `auction::unwind` (every lock goes home) and after a
 * finished auction.
 *
 * Reads Aptos through the SDK's configured client (`aptos/config.ts`) and
 * Ethereum through the caller's provider. The caller signs only ordinary
 * transactions: LockBox verifies the outcome proof itself.
 *
 * @see ./outcome-carrier.ts
 */

import { ethers } from "ethers";
import { aptos, CONTRACT_ADDR } from "../aptos/config.js";
import {
  getLockOutcome,
  getWindowLockIds,
  type ReceiptAsset,
} from "../aptos/payloads.js";
import { getChainConfig } from "../chain-config.js";
import { LOCK_STATUS, LOCKBOX_ABI } from "../ethereum/abis.js";
import { pairHashOf } from "../ethereum/lock-binding.js";
import {
  getLockById,
  getLockStatus,
  getRecordedOutcome,
  sendLockBoxCall,
  type LockFields,
} from "../ethereum/lockbox.js";
import {
  carryOutcome,
  ethersCarrierChain,
  findOutcomeEvent,
  planWindowReleases,
  type CarryResult,
  type OutcomeEventLocation,
  type WindowLockOutcome,
} from "./outcome-carrier.js";

/** The Aptos node URLs the carrier asks for proofs: the SDK's configured node. */
export function defaultAptosNodes(): string[] {
  const url = aptos.config.fullnode;
  if (!url) throw new Error("the SDK Aptos client has no fullnode URL");
  return [url];
}

/** Result of {@link carryAndReleaseWindow}. */
export interface WindowReleaseResult {
  /** Outcome carrying; absent when LockBox already had the outcome */
  carry?: CarryResult;
  /** Hashes of the `releaseByOutcome` transactions sent */
  released: string[];
  /** Hashes of the `reclaimUnpayable` transactions sent (unpayable leaves) */
  reclaimed: string[];
}

const RECLAIM_UNPAYABLE_SELECTOR = new ethers.Interface(
  LOCKBOX_ABI,
).getFunction("reclaimUnpayable")!.selector;

/**
 * Record the window's `AuctionOutcome` on LockBox when it is not yet there,
 * then close each lock of the window that is still open: `releaseByOutcome`,
 * or `reclaimUnpayable` when its leaf is unpayable (`planWindowReleases`). Pass `outcomeAt` when the caller knows the event (for example from
 * its own `unwind` transaction); otherwise the carrier scans for it.
 *
 * Stops after carrying when the outcome is unprovable or the light client is
 * stale: those locks go home by reclaim after their deadline.
 */
export async function carryAndReleaseWindow(input: {
  signer: ethers.Signer;
  provider: ethers.Provider;
  windowId: bigint;
  pairBcs: Uint8Array;
  outcomeAt?: OutcomeEventLocation;
  nodes?: string[];
}): Promise<WindowReleaseResult> {
  const lockBoxAddress = getChainConfig().ethereum.lockBox;
  const nodes = input.nodes ?? defaultAptosNodes();

  const ids = await getWindowLockIds(input.windowId, input.pairBcs);
  const all: Array<{ id: string; asset: ReceiptAsset }> = [
    ...ids.sellers.map((id) => ({ id, asset: "FakeETH" as const })),
    ...ids.collateral.map((id) => ({ id, asset: "FakeUSD" as const })),
  ];
  if (all.length === 0) return { released: [], reclaimed: [] };

  const locks: LockFields[] = [];
  for (const { id } of all) {
    const lock = await getLockById(input.provider, id);
    if (!lock) throw new Error(`lock ${id} has no Locked event on LockBox`);
    locks.push(lock);
  }

  let result: WindowReleaseResult = { released: [], reclaimed: [] };
  let outcome = await getRecordedOutcome(input.provider, locks[0]);
  if (!outcome.recorded) {
    const at =
      input.outcomeAt ??
      (await findOutcomeEvent(
        nodes[0],
        CONTRACT_ADDR,
        input.windowId,
        pairHashOf(input.pairBcs),
      ));
    if (!at) {
      throw new Error(
        `no AuctionOutcome found for window ${input.windowId}; finish or unwind the window first`,
      );
    }
    const carry = await carryOutcome(
      await ethersCarrierChain(input.signer, lockBoxAddress),
      nodes,
      at.version,
      at.eventIndex,
    );
    result = { carry, released: [], reclaimed: [] };
    if (carry.status !== "recorded" && carry.status !== "already-recorded") {
      return result;
    }
    outcome = await getRecordedOutcome(input.provider, locks[0]);
  }

  const outcomes: WindowLockOutcome[] = [];
  for (const { id, asset } of all) {
    const o = await getLockOutcome(asset, id);
    outcomes.push({ lockId: id, recipients: o.recipients, amounts: o.amounts });
  }
  const openLocks: LockFields[] = [];
  for (const lock of locks) {
    if (
      (await getLockStatus(input.provider, lock.lockId)) === LOCK_STATUS.Open
    ) {
      openLocks.push(lock);
    }
  }
  const calls = planWindowReleases({
    lockBoxAddress,
    outcomes,
    openLocks,
    recordedRoot: outcome.root,
  });
  for (const call of calls) {
    const hash = (await sendLockBoxCall(input.signer, call)).hash;
    if (call.data.startsWith(RECLAIM_UNPAYABLE_SELECTOR)) {
      result.reclaimed.push(hash);
    } else {
      result.released.push(hash);
    }
  }
  return result;
}
