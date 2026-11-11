/**
 * Outcome tree mirror (issue 203) against the shared fixture
 * tests/fixtures/outcome_tree_vectors.json. The same file is checked by
 * LockBox's OutcomeTree.sol (forge OutcomeTreeVectorsTest) and by
 * atomica::outcome_tree (outcome_tree_tests.move), so all three agree.
 */

import { describe, it, expect } from "vitest";
import vectors from "./fixtures/outcome_tree_vectors.json";
import {
  buildOutcomeTree,
  leafHash,
  nonMembershipProof,
  outcomeProof,
  payoutsHash,
  verifyOutcomeProof,
  type OutcomeEntry,
} from "../src/settlement/outcome-tree";

function entries(c: (typeof vectors.cases)[number]): OutcomeEntry[] {
  return c.entries.map((e) => ({
    lockId: e.lock_id,
    payouts: e.payouts.map((p) => ({
      recipient: p.recipient,
      amount: BigInt(p.amount),
    })),
  }));
}

describe("outcome tree fixture", () => {
  it("covers 1, 2, 3 and 5 leaves", () => {
    expect(vectors.cases.map((c) => c.leaves.length)).toEqual([1, 2, 3, 5]);
  });

  for (const c of vectors.cases) {
    it(`${c.name}: root, leaves and proofs match`, () => {
      const tree = buildOutcomeTree(entries(c));
      expect(tree.root).toBe(c.root);
      expect(tree.leaves.map((l) => l.lockId)).toEqual(
        c.leaves.map((l) => l.lock_id),
      );
      tree.leaves.forEach((leaf, i) => {
        expect(leaf.payoutsHash).toBe(c.leaves[i].payouts_hash);
        expect(leaf.leaf).toBe(c.leaves[i].leaf);
        expect(leafHash(leaf.lockId, leaf.payoutsHash)).toBe(c.leaves[i].leaf);
        expect(outcomeProof(tree, i)).toEqual(c.leaves[i].proof);
        expect(
          verifyOutcomeProof(
            leaf.leaf,
            i,
            c.leaves.length,
            c.leaves[i].proof,
            c.root,
          ),
        ).toBe(true);
      });
    });
  }
});

describe("outcome tree checks", () => {
  const five = vectors.cases[3];
  const tree = buildOutcomeTree(entries(five));

  it("rejects a wrong index, a tampered sibling and an extra sibling", () => {
    const leaf = tree.leaves[2].leaf;
    const proof = outcomeProof(tree, 2);
    expect(verifyOutcomeProof(leaf, 3, 5, proof, tree.root)).toBe(false);
    expect(verifyOutcomeProof(leaf, 5, 5, proof, tree.root)).toBe(false);
    expect(
      verifyOutcomeProof(
        leaf,
        2,
        5,
        ["0x" + "00".repeat(32), ...proof.slice(1)],
        tree.root,
      ),
    ).toBe(false);
    expect(
      verifyOutcomeProof(leaf, 2, 5, [...proof, tree.root], tree.root),
    ).toBe(false);
  });

  it("is independent of input order and rejects duplicates", () => {
    const shuffled = [...entries(five)].reverse();
    expect(buildOutcomeTree(shuffled).root).toBe(five.root);
    expect(() =>
      buildOutcomeTree([...entries(five), entries(five)[0]]),
    ).toThrow(/duplicate/);
    expect(() => buildOutcomeTree([])).toThrow();
  });

  it("payoutsHash packs (address, uint256) pairs", () => {
    const e = entries(five)[1];
    expect(e.payouts.length).toBe(2);
    const leaf = tree.leaves.find((l) => l.lockId === e.lockId)!;
    expect(payoutsHash(e.payouts)).toBe(leaf.payoutsHash);
  });

  it("nonMembershipProof gives neighbours for absent ids and throws for present ones", () => {
    const ids = tree.leaves.map((l) => BigInt(l.lockId));
    const hex = (v: bigint) => "0x" + v.toString(16).padStart(64, "0");
    const below = nonMembershipProof(tree, hex(ids[0] - 1n));
    expect(below.map((n) => n.index)).toEqual([0]);
    const between = nonMembershipProof(tree, hex(ids[2] + 1n));
    expect(between.map((n) => n.index)).toEqual([2, 3]);
    const above = nonMembershipProof(tree, hex(ids[4] + 1n));
    expect(above.map((n) => n.index)).toEqual([4]);
    for (const n of [...below, ...between, ...above]) {
      expect(
        verifyOutcomeProof(
          leafHash(n.lockId, n.payoutsHash),
          n.index,
          5,
          n.proof,
          tree.root,
        ),
      ).toBe(true);
    }
    expect(() => nonMembershipProof(tree, tree.leaves[1].lockId)).toThrow(
      /in the outcome tree/,
    );
  });
});
