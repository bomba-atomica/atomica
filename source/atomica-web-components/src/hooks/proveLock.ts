/**
 * Proof step of a LockBox lock, shared by the seller flow (FakeETH) and the
 * bidder screen (FakeUSD).
 *
 * Aptos checks a lock proof against the state root the validators certified,
 * so this waits for a certified Ethereum block that covers the lock block and
 * proves `commitments[lockId]` at that block. The caller registers the proof
 * with `getRegisterLockPayload(proof, asset)`, whose asset must name `token`.
 *
 * @see docs/specifications/cross-chain-locking.md
 */

import { ethers } from "ethers";
import { generateLockedBalanceProof } from "@atomica/sdk/ethereum/proofs";
import type { LockedBalanceProof } from "@atomica/sdk/ethereum/proofs";
import type { LockBinding } from "@atomica/sdk/ethereum";
import { getChainConfig } from "@atomica/sdk/chain-config";
import { waitForCertifiedBlock } from "@atomica/sdk/aptos";

/** The fields of one LockBox lock that its proof commits to. */
export interface ProvableLock extends LockBinding {
  depositor: string;
  /** ERC-20 address of the locked token (FakeETH or FakeUSD) */
  token: string;
  /** LockBox nonce of the lock */
  nonce: bigint;
  amount: bigint;
}

/**
 * Wait for a certified block at or after `lockBlock`, then build the
 * LockBox storage proof of `lock` at that block.
 *
 * `onCertified` runs once the certified block is known, before the proof
 * is built, so a caller can show the stage.
 */
export async function proveLock(
  lock: ProvableLock,
  lockBlock: number,
  onCertified?: (proofBlock: number) => void,
): Promise<LockedBalanceProof> {
  const config = getChainConfig();
  const provider = new ethers.JsonRpcProvider(config.ethereum.rpcUrl);

  const proofBlock = await waitForCertifiedBlock(lockBlock);
  onCertified?.(proofBlock);
  return generateLockedBalanceProof(
    provider,
    config.ethereum.lockBox,
    lock.depositor,
    lock.token,
    lock.nonce,
    {
      amount: lock.amount,
      windowId: lock.windowId,
      pairHash: lock.pairHash,
      deadline: lock.deadline,
    },
    proofBlock,
  );
}
