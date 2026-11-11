# Chapter 8: Review of the Open Issues

**Scope:** the open issues on `bomba-atomica/atomica` when the review ended: the plan (178), the Aptos unwind (194) and the SDK and UI unwind (195). The LockBox issue (203) closed during the review, when its pull request (212) merged at 20:09 UTC on 2026-11-11. `bomba-atomica/atomica-aptos` had no open pull request.

---

## The plan (178)

**Current order:** the Aptos unwind (194), then the SDK and UI unwind (195).

### P-1 The plan covers fund recovery and nothing about auction integrity

Both open issues are about getting funds home. No issue covers the four Critical findings: uncovered winning bids (A-1), the overflow quantity (A-2), selective reveal (A-3) and cross-window collateral (E-1). No issue covers the reserve price, the zero-price clear, bid-book filling, the timelock choice or the window formula (A-4 to A-8). No issue covers the two fork findings that let one actor stop reveals (F-1, F-2).

The unwind issue (194) will turn on outcome emission. That is the moment E-1 and A-1 start to move real balances on Ethereum. So the integrity fixes are not a later phase. They gate that issue.

### P-2 The light client age limit is sequenced last, behind an immutable deploy

The stale-client limit, the genesis pin and the sign-in domain check were added to the SDK issue (195) as "owner-approved additions". That issue is last. It also says "the light client and LockBox redeploy together". So the plan already knows the merged LockBox will be replaced. Three more reasons to redeploy came out of this review (E-2, E-5, A-8). Batch all of them into one contract change before the unwind issue, so that LockBox is redeployed once.

### P-3 The SDK issue (195) is six issues in one

It contains: SDK payload builders, an outcome carrier with epoch advance and retry rules, two UI buttons, the retirement of four Solidity contracts and their tests, a light client contract change with a new constructor argument, a deploy script change, and a sign-in domain check. These touch three languages and five packages. A failure in one blocks the rest, and a reviewer cannot hold it in one pass. The LockBox change (212) was 58 files and 4 176 added lines, and a Critical gap still passed review (E-1).

**Recommended split**

1. Light client age limit, genesis pin, LockBox leaf rule and computed deadline (contracts only).
2. Retire the legacy contracts, the orchestrator and the relayer bridge (deletions only).
3. Outcome carrier in the SDK.
4. UI actions and the domain check.

---

## The Aptos unwind (194)

### U-1 It does not require the receipt binding check

The issue's timing rule compares `stuck deadline + carrier margin` with `eth_lock_deadline(window_id)`. It never requires that a claimed receipt's `(window_id, pair_hash)` equals the window's. Without that, E-1 is live as soon as `settle` emits an outcome. Add an acceptance criterion: a Move test bids with a receipt bound to another window and expects an abort.

### U-2 It does not say what happens when a winner cannot pay

"Fills follow the allocation in `bridge.ts:556-600` ... with the quote from `quoteForFill`." That allocation throws when the quote exceeds the collateral. In Move that is an abort inside `settle`, which makes the window stuck by design (A-1). The issue must state the rule. The simplest rule is in Chapter 3: such a bid is invalid at opening.

### U-3 It copies a price unit that the clients disagree on

`quoteForFill` treats the price as whole dollars. The sell flow and the tests use micro-dollars (C-2). The Move version will fix one meaning forever in the outcome tree. Decide the unit in this issue and state it in the module documentation.

### U-4 It builds three exits where one or two will do

See Chapter 2, S-3. `cancel_unauctioned` moves no funds. `unwind` on a settled window is only needed if `settle` leaves locks without a leaf. If `settle` gives every claimed lock a complete leaf, the issue shrinks to: emit one outcome from `settle`, and one all-refund outcome from the expired path. The owner should confirm this cut, because it touches the wording of axiom 3.

### U-5 It stores the same outcome three times

A per-lock record, an event with the same fields, and a tree leaf. See Chapter 2, S-4.

### U-6 The outcome builder has unbounded input

Sellers per window have no cap (A-10). The builder will sort and hash every lock in one transaction. Add a cap on seller locks to this issue, or the first large window cannot settle.

### U-7 Rounding dust is specified. Unpayable leaves are not

"Rounding dust goes to the lock's depositor" is the right rule. LockBox still freezes a lock whose leaf does not sum exactly (E-2). The Move test "each per-lock record's payouts sum to the receipt amount" guards the builder. It does not protect an immutable contract from a later upgrade of the builder. Fix the LockBox rule as well.

### U-8 Its tests stop at Aptos

Every acceptance criterion is a Move unit test. None runs a real outcome through the light client into LockBox (T-1). This issue is the first point where that test can exist. Add it here.

### U-9 What the issue gets right

- One `AuctionOutcome` per auction, whichever path finalizes first.
- Payees are the receipts' Ethereum owners, never the derived Aptos account.
- The explicit order "stuck deadline plus margin before the Ethereum deadline".
- The owner clarification that separates the settle deadline from the stuck deadline.

---

## The SDK and UI unwind (195)

### K-1 It keeps the dead reveal path out of scope

The client has payload builders for opening and finalizing bids that no component calls, and the "claim" button mints from a faucet (C-1). The issue adds unwind and reclaim buttons. It does not make the happy path work. After it merges, a user can get funds home from the UI and still cannot complete a trade from the UI.

### K-2 The carrier has no stated incentive

`recordOutcome` plus any missing `advanceEpoch` calls cost real gas, and the first caller pays for everyone. The PRD lists "validator incentives for submitting away-chain headers" as an open question (`prd.md:269`). The same question applies here. Winners and sellers each gain from the record, so somebody will usually pay. State that assumption, and measure the gas in the acceptance criteria.

### K-3 The stale-client design is right and belongs earlier

A client that dies after `maxEpochAge` turns E-3 from "funds can be stolen" into "funds go home by reclaim". That matches axiom 1. It should not wait for UI work (P-2).

### K-4 Missing from the client scope

- The bidder's FakeUSD registration path (C-3).
- The derived-address fix (C-4).
- The LockBox address check next to the domain check (C-5).
- One price unit (C-2).
- Local construction of the bid's identity and associated data (C-6).

### K-5 What the issue gets right

- The carrier treats a pruned proof as "try the next node", then falls back to reclaim.
- The old LockBox is drained by refund before the relayer key is retired.
- Production validators observe Ethereum at `finalized`.
- Its acceptance criteria are concrete and include negative `grep` checks.

---

## The closed LockBox issue (203) and its merge (212)

The merge delivered what the issue asked for, and its tests are real: unit, invariant, and a light client integration test on a golden vector. Four things it did not catch are now on `main`:

- The receipt binding is stored and never checked (E-1).
- A leaf that does not sum freezes its lock (E-2).
- The deadline is a caller argument (E-5).
- The window close formula it documents is not the canonical schedule (A-8).

The issue's own checklist was fully ticked. Each of the four sits between two modules or two chains, where a per-module checklist does not look.
