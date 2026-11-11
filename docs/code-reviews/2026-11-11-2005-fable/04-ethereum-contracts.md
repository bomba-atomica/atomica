# Chapter 4: Ethereum Contracts

**Scope:** `source/evm-contracts/src` at `main` commit `4ca0acd`.
**Method:** Full read of `aptos/AptosLightClient.sol`, `aptos/AptosTypes.sol`, `aptos/AptosHash.sol`, `aptos/Bcs.sol`, `aptos/Bls12381.sol`, `escrow/LockBox.sol`, `escrow/OutcomeTree.sol` and the deploy scripts. No forge run was done for this chapter.

The proof-gated LockBox (issue 203, pull request 212) merged while this review ran. It removed the relayer key from Ethereum. This chapter reviews the merged contract.

---

## Summary

| ID | Severity | Finding | Tracked |
| --- | --- | --- | --- |
| E-1 | Critical | A lock bound to one window can be used in another | Not in the issue text. Checked in the open unwind pull request (213) |
| E-2 | High | A bad leaf freezes a lock forever | No |
| E-3 | High | The light client has no age limit | SDK issue (195), sequenced last |
| E-4 | High | The package upgrade key can drain the LockBox | Accepted in the decision record |
| E-5 | Medium | The caller supplies a deadline the contract could compute | No |
| E-6 | Medium | The deploy script takes the trust root from the node it does not trust | SDK issue (195) |
| E-7 | Low | Reclaim beside a recorded outcome needs Aptos data | No |
| E-8 | Low | The gas ceilings do not cover the worst case | No |
| E-9 | Low | One reverting recipient blocks a whole lock | No |
| E-10 | Low | Retired contracts still ship and deploy | SDK issue (195) |

---

## E-1 Critical: a lock bound to one window can be used in another

**Evidence**

- LockBox pays a lock only from the outcome of the lock's own auction key: `auctionKey(l.windowId, l.pairHash, l.deadline)` (`escrow/LockBox.sol:167`, used in `releaseByOutcome` at `:240-264` and `reclaim` at `:277-292`).
- The Aptos receipt stores `window_id` and `pair_hash`, and `lock_receipt.move:420` adds the view `get_receipt_binding`.
- On `main` no product code reads that view. Only a test does. `create_auction` and `submit_bid` call `lock_receipt::claim` with the owner and lock id only (`auction.move:468`, `:591`).
- Registration does not compare the lock's window with the clock. It accepts any window id whose deadline matches (`lock_receipt.move:196`).
- The text of the unwind issue (194) does not ask for the check. Its timing rule compares deadlines, not the receipt's binding.
- The open pull request for that issue (213) does add it. Both entries claim through a new `lock_receipt::claim_for_window`, which aborts with `E_WRONG_BINDING`, and a test bids with collateral bound to another window. I read that part of the pull request only. It is not merged.

**Failure scenario**

This is the path on `main` once anything emits an outcome. Any binding other than the window's own works: another window id, or another pair hash.

1. Mallory locks FakeUSD on Ethereum bound to window `w + 1`.
2. Mallory registers the lock. The deadline matches `eth_lock_deadline(w + 1)`, so Aptos accepts it.
3. Mallory bids in window `w` with that receipt and wins.
4. Aptos emits the outcome of window `w`. Its tree pays the seller's FakeETH to Mallory.
5. The seller's lock is bound to window `w`. LockBox releases it to Mallory.
6. Mallory's collateral lock is bound to window `w + 1`. LockBox looks for it under that key (`LockBox.sol:246`, `:281`). The outcome of window `w` is stored under another key and cannot touch it.
7. After the deadline of `w + 1`, Mallory reclaims the full collateral. With no outcome under that key the reclaim needs no proof. With one, the lock is not in that tree, so a non-membership proof passes.

Mallory receives the FakeETH and keeps the FakeUSD. The seller receives nothing.

The attack needs the outcome emitter from the unwind issue (194). It is not exploitable on `main` today, because nothing emits an outcome (Chapter 3, A-9). It becomes exploitable the day an emitter merges without the check. The severity is for that case. The pull request (213) as read carries the check, so the risk is a later change that drops it.

A seller can run the mirror image: sell with a FakeETH lock bound elsewhere, collect the winner's FakeUSD, and reclaim the FakeETH.

**Smallest fix**

In `create_auction` and `submit_bid`, abort unless the receipt's `(window_id, pair_hash)` equals the window's `(window_id, keccak256(pair_bcs))`. Add a Move test that bids with a receipt bound to another window and expects the abort. The pull request (213) does both for the bid. Add the check to the unwind issue's acceptance criteria, and add the same test for a seller lock, so that neither can be dropped unseen.

---

## E-2 High: a bad leaf freezes a lock forever

**Evidence**

- `releaseByOutcome` reverts unless the leaf's payouts sum to the lock amount (`LockBox.sol:255`), and on a zero recipient (`:252`).
- `reclaim` reverts for any lock that is in the tree (`:286`).
- LockBox is immutable. The Move code that builds the tree is not on `main`. It is in the open pull request (213), which this review did not read in full, and it stays upgradeable after it merges.

**Failure scenario**

A rounding bug in the Move outcome builder produces a leaf whose payouts sum to one unit less than the lock amount. That lock can never be released and never be reclaimed.

**Precondition**

This needs a defect in the builder, now or after a later upgrade. No such defect was found, because the builder was not reviewed. The finding is High because the result is permanent and it breaks axiom 1 exactly where the axiom applies: an auction that did not execute flawlessly must send funds home, and here it freezes them.

**Smallest fix**

Make every leaf payable. Define the leaf as "these payouts, and the remainder to the depositor". Then a short sum is fine. Let `reclaim` accept an in-tree lock when the caller shows that its leaf is unpayable (sum above the amount, or a zero recipient). The rule becomes: a lock that cannot be paid as recorded goes home. This needs a LockBox redeploy, so batch it with E-3 and E-5.

---

## E-3 High: the light client has no age limit

**Evidence**

- "There is no owner, pause, proxy or expiry" (`aptos/AptosLightClient.sol:19-20`).
- `verifyEvent` accepts a proof signed by the latest epoch the contract knows (`:81-82`), not the latest epoch that exists.
- Advancing the epoch needs somebody to call `advanceEpoch` (`:63-71`).

**Failure scenario**

Nobody advances the client for longer than the stake lockup. The validators of the last known epoch have withdrawn their stake. Two thirds of them sign a fake `AuctionOutcome`. The client accepts it. They drain every open lock and lose nothing.

**Preconditions**

Both must hold: no `advanceEpoch` call for longer than the stake lockup, and two thirds of the old set acting together. The contract comment names the same risk (`AptosLightClient.sol:22-25`).

The safety of every lock therefore rests on somebody calling `advanceEpoch` in time. Anyone can do it, so this is not a trusted key. It is still a liveness duty that nothing guarantees, on a path the decision record wanted free of such duties.

**Sequencing problem**

The fix (a `maxEpochAge` after which the client is dead) is specified in the SDK issue (195), the last item in the plan. LockBox takes the client address in its constructor and cannot change it. So the plan redeploys both contracts at the end.

**Smallest fix**

Split the age limit out of the SDK issue (195) and do it next. No deployment should hold value before it lands.

---

## E-4 High: the package upgrade key can drain the LockBox

**Evidence**

- The decision record accepts it: "The upgrade key holder can publish code that emits any `AuctionOutcome` event ... Ethereum lock safety at v0.1 also trusts that key" (`docs/decisions/trustless-v0-1-unwinding.md:68`).
- The same record opens with: "No relayer, admin key or operator account can move, hold or freeze user funds" (`:12`).
- The PRD repeats the stronger sentence (`docs/specifications/prd.md:333`).

**Failure scenario**

The holder of the `@atomica` key publishes a module version that emits an outcome paying every open lock to one address. The validators sign the block like any other. The light client proves the event. LockBox pays.

This is the single-key risk that the LockBox rewrite removed from Ethereum, now sitting on Aptos. The owner accepted it on 2026-11-11. The canonical documents still contradict each other, and one sentence should change.

**Options, smallest first**

1. State the exception in the PRD trust model and at the top of the decision record, so the documents agree.
2. Put package upgrades behind a delay longer than the Ethereum reclaim delay. Users can then exit before new code can emit an outcome for their lock.
3. Set the package to immutable before any real asset is supported.

---

## E-5 Medium: the caller supplies a deadline the contract could compute

**Evidence**

- `lock` takes `deadline` from the caller and only checks that it is in the future (`LockBox.sol:197-203`).
- Aptos accepts exactly one deadline per window: `eth_lock_deadline(window_id)`, a pure function (`eth_proof.move:231-241`, enforced at `lock_receipt.move:196`).

**Failure scenario**

A wallet or script passes a wrong deadline. Aptos refuses the lock with `E_WRONG_DEADLINE`. The tokens sit in LockBox until the wrong deadline passes. A deadline of `type(uint64).max` locks them forever. A far-future `windowId` has the same effect.

**Smallest fix**

Compute the deadline in `lock` from `windowId` with the same formula. Drop the parameter, drop it from the auction key, and drop `E_WRONG_DEADLINE`. The key loses nothing, because the deadline is then a function of the window id. That is one less argument on both chains, and the user error is gone. Reject a `windowId` that is already closed or more than one window ahead. Fix the window formula first (Chapter 3, A-8), and settle the reclaim delay first (Chapter 2, S-2), because this change freezes both into an immutable contract.

---

## E-6 Medium: the deploy script takes the trust root from the node it does not trust

`script/DeployAptosLightClient.s.sol:27-34` reads the genesis LedgerInfo and the waypoint from the same node, then checks them against each other. A dishonest or wrong-network node serves a consistent fake genesis and the script deploys a client for a fake chain. The comment says "anyone can compare the deployed waypoint with the chain's own" (`:14`). Nobody has to. The SDK issue (195) adds a required `EXPECTED_GENESIS_WAYPOINT`. That change is a few lines and belongs with E-3.

---

## E-7 Low: reclaim beside a recorded outcome needs Aptos data

**Evidence**

- Once an auction has a root, `reclaim` needs a non-membership proof built from neighbouring leaves (`LockBox.sol:277-292`, `OutcomeTree.sol:81-99`).
- A proof needs the whole leaf list, not only the two neighbours, because each neighbour needs its sibling path.
- LockBox stores the root and the leaf count only. The leaves live on Aptos.

**Failure scenario**

Alice locks for a window and never registers on Aptos. The window settles and its outcome is recorded. After the deadline Alice needs the leaf list of that auction. If she cannot get it, her lock cannot go home.

**How likely**

An earlier draft rated this Medium and said the data could vanish with old events. That overstated it. The unwind issue (194) keeps a stored record per lock, and its pull request (213) adds the view `lock_receipt::get_lock_outcome`. Chain state is served by every live node and is not pruned like events. Alice loses access only if the Aptos chain is gone, if a later upgrade deletes the records, or if the records are replaced by events alone. The first draft of Chapter 2 (S-4) proposed exactly that last step, and it has been corrected.

The dependency is still real: a lock that never touched Aptos needs Aptos data to leave Ethereum.

**Smallest fix**

Keep the per-lock records in Aptos state for good, and say so in the unwind issue. A stronger fix is to let a carrier post the leaf list to LockBox as calldata, checked against the root, so Ethereum alone holds what a reclaim needs.

---

## E-8 Low: the gas ceilings do not cover the worst case

`test/unit/aptos/AptosLightClient.t.sol:243-252` asserts a ceiling for `verifyEvent` with 4 validators and a 2^20 leaf accumulator. Lines 254-270 assert one for `advanceEpoch` with 100 validators. No test combines a large validator set with a deep accumulator in `verifyEvent`. An Aptos chain passes 2^20 transactions within days. Add one case with 100 signers and depth 40.

---

## E-9 Low: one reverting recipient blocks a whole lock

`releaseByOutcome` pushes every payout in one transaction (`LockBox.sol:261-263`). The test tokens never revert. A real token with a blocklist would let one blocked recipient stop the payouts of everyone who shares that lock. Record this as a known limit before any real asset is supported. A pull pattern per recipient removes it.

---

## E-10 Low: retired contracts still ship and deploy

`src/Settlement.sol`, `src/DepositBox.sol`, `src/BLSVerifier.sol`, `src/settlement/BLSVerifierTestnet.sol` and `src/archived/*` are all superseded by the decision record. `src/script/Deploy.s.sol` still deploys part of that set, and the "EVM e2e" job runs it (Chapter 7, T-5). `BLSVerifierTestnet` accepts one trusted caller in place of a signature check. The SDK issue (195) retires them. Until then a reader, an auditor or a deploy script can pick the wrong contract.

---

## What is solid

**Light client**

- The trust root is recomputed from the genesis LedgerInfo in the constructor (`AptosLightClient.sol:46-60`).
- Epochs advance one at a time, each signed by the previous set (`:63-71`, `:161-168`).
- The quorum formula matches Aptos: `total * 2 / 3 + 1` (`:135`).
- The bitmask length and its trailing bits are checked (`:125-134`).
- BCS parsing is strict: canonical lengths, no trailing bytes, known variants only (`Bcs.sol:64-81`, `:126-128`, `AptosTypes.sol:72-97`).
- Leaf and node hashes use different seeds, and an index must fit the proof depth, so one proof cannot prove two positions (`AptosHash.sol:52-57`).
- A failed transaction's events are rejected (`AptosTypes.sol:134`).
- The uncompressed keys and signature are checked against the compressed bytes the validators signed (`Bls12381.sol:86-92`, `:112-149`, `:214-236`).
- The event type tag includes the module address, so another module cannot emit a look-alike outcome.
- The forge suite has real negative cases: stale epoch, below quorum, tampered siblings, wrong type tag.

**LockBox**

- No owner, no authority, no upgrade path.
- A lock leaves the open status once. State changes come before transfers.
- One outcome per auction key. A reclaim before any outcome voids the outcome for the whole auction, so Ethereum never settles half an auction (`LockBox.sol:284`).
- Leaves and inner nodes are domain separated, and the leaf count is part of the recorded outcome, so the odd-node promotion is not ambiguous.
- Funds exist only on Ethereum. Aptos holds accounting only. A disagreement between the chains cannot create a second copy of a token.
- The invariant test asserts that the token balance equals the sum of open locks (`test/invariant/LockBox.invariant.t.sol:219-221`).
