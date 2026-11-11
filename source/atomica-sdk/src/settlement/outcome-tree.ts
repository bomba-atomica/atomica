/**
 * Outcome tree: the keccak Merkle tree an Aptos `AuctionOutcome` commits to.
 *
 * One leaf per lock of the auction, sorted by lock id. Mirrors, byte for byte,
 * `source/evm-contracts/src/escrow/OutcomeTree.sol` (the LockBox verifier) and
 * `atomica::outcome_tree` (the Move builder). The shared fixture
 * tests/fixtures/outcome_tree_vectors.json pins all three.
 *
 *   payoutsHash = keccak256(recipient_0 (20 bytes) || amount_0 (uint256) || ...)
 *   leaf        = keccak256(0x00 || lockId || payoutsHash)
 *   node        = keccak256(0x01 || left || right)
 *
 * Each level pairs nodes (2i, 2i + 1). A last node without a partner moves
 * up unchanged. A proof lists the siblings from the leaf up, so the verifier
 * needs the leaf index and the leaf count.
 */

import { ethers } from "ethers";

/** One payout of a lock: `amount` of the lock's token to `recipient`. */
export interface OutcomePayout {
  /** 20-byte Ethereum address (the receipt's `eth_owner`, never its Aptos `user`) */
  recipient: string;
  amount: bigint;
}

/** One lock's disposition: its payouts sum to the lock amount. */
export interface OutcomeEntry {
  /** bytes32 lock id (LockBox.getLockId) */
  lockId: string;
  payouts: OutcomePayout[];
}

/** One hashed leaf, in tree order. */
export interface OutcomeLeaf {
  lockId: string;
  payoutsHash: string;
  leaf: string;
}

export interface OutcomeTree {
  /** Leaves in ascending lock id order */
  leaves: OutcomeLeaf[];
  root: string;
}

/** LockBox `OutcomeTree.Neighbour`: a leaf next to an absent lock id, with its proof. */
export interface OutcomeNeighbour {
  lockId: string;
  payoutsHash: string;
  index: number;
  proof: string[];
}

export function payoutsHash(payouts: OutcomePayout[]): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      payouts.flatMap(() => ["address", "uint256"]),
      payouts.flatMap((p) => [ethers.getAddress(p.recipient), p.amount]),
    ),
  );
}

export function leafHash(lockId: string, payouts: string): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["bytes1", "bytes32", "bytes32"],
      ["0x00", lockId, payouts],
    ),
  );
}

export function nodeHash(left: string, right: string): string {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["bytes1", "bytes32", "bytes32"],
      ["0x01", left, right],
    ),
  );
}

function up(level: string[]): string[] {
  const next: string[] = [];
  for (let i = 0; i < level.length; i += 2) {
    next.push(
      i + 1 < level.length ? nodeHash(level[i], level[i + 1]) : level[i],
    );
  }
  return next;
}

/**
 * Build the tree of `entries`. Sorts them by lock id and throws on an empty
 * list or a duplicate lock id.
 */
export function buildOutcomeTree(entries: OutcomeEntry[]): OutcomeTree {
  if (entries.length === 0)
    throw new Error("outcome tree needs at least one lock");
  const leaves = entries
    .map((e) => {
      const lockId = ethers.hexlify(ethers.getBytes(e.lockId));
      const ph = payoutsHash(e.payouts);
      return { lockId, payoutsHash: ph, leaf: leafHash(lockId, ph) };
    })
    .sort((a, b) => (BigInt(a.lockId) < BigInt(b.lockId) ? -1 : 1));
  for (let i = 1; i < leaves.length; i++) {
    if (leaves[i - 1].lockId === leaves[i].lockId) {
      throw new Error(`duplicate lock id ${leaves[i].lockId}`);
    }
  }
  let level = leaves.map((l) => l.leaf);
  while (level.length > 1) level = up(level);
  return { leaves, root: level[0] };
}

/** Sibling path of the leaf at `index` (tree order). */
export function outcomeProof(tree: OutcomeTree, index: number): string[] {
  if (index < 0 || index >= tree.leaves.length)
    throw new Error(`leaf ${index} out of range`);
  const proof: string[] = [];
  let level = tree.leaves.map((l) => l.leaf);
  let i = index;
  while (level.length > 1) {
    const sibling = i ^ 1;
    if (sibling < level.length) proof.push(level[sibling]);
    level = up(level);
    i = Math.floor(i / 2);
  }
  return proof;
}

/** Same check as `OutcomeTree.verify` in LockBox. */
export function verifyOutcomeProof(
  leaf: string,
  index: number,
  count: number,
  proof: string[],
  root: string,
): boolean {
  if (index < 0 || index >= count) return false;
  let node = leaf;
  let used = 0;
  let i = index;
  for (let n = count; n > 1; n = Math.floor((n + 1) / 2)) {
    if ((i ^ 1) < n) {
      if (used === proof.length) return false;
      const sibling = proof[used++];
      node = i % 2 === 0 ? nodeHash(node, sibling) : nodeHash(sibling, node);
    }
    i = Math.floor(i / 2);
  }
  return used === proof.length && node.toLowerCase() === root.toLowerCase();
}

/**
 * Neighbours that prove `lockId` is not in `tree`, for `LockBox.reclaim`.
 * Throws when the lock id is in the tree.
 */
export function nonMembershipProof(
  tree: OutcomeTree,
  lockId: string,
): OutcomeNeighbour[] {
  const id = BigInt(lockId);
  const at = (index: number): OutcomeNeighbour => ({
    lockId: tree.leaves[index].lockId,
    payoutsHash: tree.leaves[index].payoutsHash,
    index,
    proof: outcomeProof(tree, index),
  });
  const right = tree.leaves.findIndex((l) => BigInt(l.lockId) >= id);
  if (right !== -1 && BigInt(tree.leaves[right].lockId) === id) {
    throw new Error(`lock ${lockId} is in the outcome tree`);
  }
  if (right === -1) return [at(tree.leaves.length - 1)];
  if (right === 0) return [at(0)];
  return [at(right - 1), at(right)];
}
