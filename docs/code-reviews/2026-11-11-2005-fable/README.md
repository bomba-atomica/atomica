# Adversarial Code Review, 2026-11-11

**Reviewer:** Claude Fable 5.2
**Started:** 2026-11-11 20:05 UTC
**Product repo:** `bomba-atomica/atomica`, `main` at `4ca0acd`. The review began at `cbd03f4`. The proof-gated LockBox (pull request 212) merged during the review, and the findings were re-checked against the merged code.
**Fork repo:** `bomba-atomica/atomica-aptos`, `dev-atomica` at `52beee31a6`.
**Open issues reviewed:** the plan (178), the Aptos unwind (194), the SDK and UI unwind (195). The LockBox issue (203) closed during the review.

---

## The three questions

### 1. Do we achieve the strategic product goals with this code?

**Not yet.** Locked funds are now well protected: no key on Ethereum can move them, and every lock has a permissionless way home. The auction is not yet fair, cannot yet be kept running against a hostile participant, and cannot yet complete a trade. See [Chapter 1](01-product-goals.md).

### 2. Is the protocol as simple as it could be?

**No.** The fund path is close to minimal. The auction path carries a second reveal protocol on top of the timelock, lets callers choose times the protocol should fix, and plans more exits than it needs. Six changes remove whole mechanisms and close findings at the same time. See [Chapter 2](02-protocol-simplicity.md).

### 3. Is the code as secure as it could be?

**No.** The review found 4 Critical, 19 High, 18 Medium and 11 Low findings. The light client, the lock proofs and the LockBox core are careful work. The weak part is the auction contract and the seams between modules and chains. See Chapters 3 to 7.

---

## The findings that matter most

| ID | Severity | Finding | Chapter |
| --- | --- | --- | --- |
| E-1 | Critical | A bidder can use collateral bound to another window, take the seller's asset and reclaim the collateral. Live once outcomes are emitted. | [4](04-ethereum-contracts.md) |
| A-1 | Critical | Bid collateral is never compared with price times quantity. A dust bid wins and blocks the auction. | [3](03-auction-contracts.md) |
| A-2 | Critical | One bid with a huge quantity overflows the clearing sum and freezes the window. | [3](03-auction-contracts.md) |
| A-3 | Critical | A bidder can read every other bid after the reveal and then decide whether to take part. | [3](03-auction-contracts.md) |
| A-9 | High | Nothing emits the outcome LockBox needs, so no trade can complete on `main`. | [3](03-auction-contracts.md) |
| A-5 | High | A zero bid sets a zero price for everyone when demand is below supply. | [3](03-auction-contracts.md) |
| A-7 | High | The first seller chooses when the auction closes. Later sellers' choices are silently dropped. | [3](03-auction-contracts.md) |
| A-8 | High | Window ids change at 12:00 and 19:45 UTC, not at 16:15. | [3](03-auction-contracts.md) |
| E-3 | High | The light client never expires, so a retired validator set can forge an outcome if nobody advanced it. | [4](04-ethereum-contracts.md) |
| E-4 | High | The package upgrade key can drain every lock. The PRD says no admin key can. | [4](04-ethereum-contracts.md) |
| F-1 | High | Free timelock registrations can crowd out an auction's reveal. | [5](05-timelock-fork.md) |
| F-2 | High | One validator can stop every reveal in an epoch, because the parameters hash is never pinned. | [5](05-timelock-fork.md) |
| C-2 | High | The price unit differs by one million between the sell screen, the bid screen and the payout math. | [6](06-clients.md) |
| T-1 | High | No test runs lock, auction and release across both chains. | [7](07-proofs-tests-ci.md) |

**One pattern explains most of them.** Each module checks its own inputs well. The gaps are between modules: receipt and auction, bid and collateral, ciphertext and commitment, window id and clock, Aptos outcome and Ethereum payout. Per-issue checklists were fully ticked and did not look there.

**One cost stands out.** A single dust lock is enough to cancel any auction, by four independent paths (A-1, A-2, A-7, F-1).

---

## What to do first

1. Add the receipt binding check and the collateral check before the Aptos unwind (194) turns on outcome emission.
2. Batch every change that needs a LockBox or light client redeploy into one contract change, and do it before any deployment holds value.
3. Pin the DKG parameters hash and close the public timelock registry in the fork.
4. Add one live test of the whole round trip.

The full ordered list is in [Chapter 9](09-action-list.md).

---

## Chapters

| # | Chapter | Contents |
| --- | --- | --- |
| 1 | [Product goals](01-product-goals.md) | A scorecard of each PRD goal and owner axiom against the code |
| 2 | [Protocol simplicity](02-protocol-simplicity.md) | Six simplifications and what each removes |
| 3 | [Aptos auction contracts](03-auction-contracts.md) | Findings A-1 to A-13 |
| 4 | [Ethereum contracts](04-ethereum-contracts.md) | Findings E-1 to E-10 |
| 5 | [Timelock in the Aptos fork](05-timelock-fork.md) | Findings F-1 to F-10 and the real trust assumption |
| 6 | [SDK, web components and demo](06-clients.md) | Findings C-1 to C-9 |
| 7 | [Proof tooling, tests and CI](07-proofs-tests-ci.md) | Findings T-1 to T-10 and a per-workflow gap table |
| 8 | [Open issues](08-open-issues.md) | Review of the plan and the two open issues |
| 9 | [Action list](09-action-list.md) | Ordered fixes, deletions, owner decisions and doc updates |

---

## Method and limits

- **Read, not run.** No build, test, swarm or testnet was run. The host rules forbid heavy local runs, and no CI run was started. Every finding is from reading source. A finding marked as confirmed means the code path was traced, not that an exploit was executed.
- **Who read what.** I read every Move and Solidity contract in Chapters 3 and 4 in full. Chapters 5, 6 and 7 come from three delegated reviewers. I re-read the source lines behind their Critical and High findings and corrected or dropped what did not hold. Their Medium and Low findings carry their line numbers without a second read.
- **A moving target.** `main` moved from `cbd03f4` to `4ca0acd` during the review. Chapters 3 and 4 cite `4ca0acd`. Chapters 6 and 7 mark which line numbers are from before the merge.
- **Not reviewed.** Upstream aptos-core code outside the Atomica delta. The vendored `lib/` folder. The cryptographic soundness of the chunky DKG and the IBE scheme beyond how the code uses them. Gas costs, which need a run. The economics documents under `docs/game-theory`.
- **Not done.** No issue was created and the plan was not edited.
