# Chapter 1: Does the Code Achieve the Product Goals?

**Short answer: not yet.** The code now protects locked funds well. It does not yet run a fair auction, and it cannot complete a trade.

The goals below come from the PRD (`docs/specifications/prd.md`), the architecture (`docs/architecture/v0-architecture.md`) and the decision record (`docs/decisions/trustless-v0-1-unwinding.md`). Each row cites the finding that supports the verdict. Finding ids point to Chapters 3 to 7.

---

## Scorecard

| Goal | Source | Verdict | Why |
| --- | --- | --- | --- |
| No relayer or admin key can move funds on Ethereum | Decision record, axiom 2 | **Met** | The merged LockBox has no owner and no authority (Chapter 4, "What is solid"). |
| All funds unwind to their origin unless the auction is flawless | Axiom 1 | **Mostly met** | Every lock can be reclaimed after its deadline. Two holes remain: a bad leaf freezes a lock (E-2), and a wrong deadline strands one (E-5). A reclaim beside a recorded outcome also needs data from Aptos (E-7, Low). |
| Any user can unwind a finished or stuck auction | Axiom 3 | **Met on Ethereum, partly on Aptos, not in the UI** | `reclaim` is permissionless. Aptos has `settle` and `refund_expired_window` but no general unwind (issue 194). The UI has a reclaim for sellers only (C-1). |
| Trust only the 2/3 validator threshold | PRD line 333 | **Not met** | The package upgrade key can drain every lock (E-4). Bid secrecy is guaranteed only against a coalition of at most one half of stake (Chapter 5). A stale light client trusts a retired validator set (E-3). |
| Cross-chain atomic trade completes | PRD lines 9, 13 | **Not met** | Nothing on Aptos emits the outcome LockBox needs (A-9). No client carries it (C-1). Every lock on `main` ends in reclaim. |
| The trade is atomic: both legs or neither | PRD line 253 | **At risk** | A bidder can use collateral bound to another window, take the seller's asset and keep the collateral (E-1). `main` has no check against it. It is not live there, because nothing emits an outcome. The open unwind pull request (213) adds the check. |
| Sealed bids decrypt automatically, with no interactive reveal | PRD line 15 | **Not met** | Bids are opened by a commit-and-reveal step. A bidder can decide after the reveal whether a bid counts (A-3, F-6). |
| Uniform-price clearing gives a fair price | PRD lines 131-139 | **Not met** | Collateral is not checked (A-1). The reserve is ignored (A-4). A zero bid sets a zero price when demand is short (A-5). One actor can fill the bid book (A-6). |
| An auction cannot be cancelled cheaply | PRD open questions 6 and 7 | **Not met** | Four cheap paths cancel an auction. One dust lock is enough for A-1 and A-7. Two are enough for A-2. Registration gas is enough for F-1. |
| Two auctions a day at 07:45 and 16:15 UTC | `auction-timing.md` | **Not met** | Window ids change at 00:00, 07:55, 12:00 and 19:55 (A-8). The close time is whatever the first seller picks (A-7). |
| All pairs clear at once | PRD line 59 | **Not built** | One pair of test tokens is hardcoded (A-12). |
| Assets are locked only for the auction period, settlement in 1 to 3 hours | PRD lines 12, 63 | **Not met** | The only exit today is reclaim, 72 hours after the window closes. |
| Users sign with their Ethereum wallet | PRD line 143 | **Mostly met** | The mechanism works and is tested with golden vectors. The bidder screen derives the wrong address (C-4), and the client does not check its host against the pinned domain (C-5). |
| Deal breakers pay deal makers | PRD lines 196-215 | **Not built** | The rebate coefficient is zero and the function returns zeros (A-13). |
| Two-layer onion with a seller key | PRD lines 116-125 | **Not built** | Only the validator layer exists. This is the right call for now (Chapter 2). |
| ZK double verification | PRD line 18, v1.0 | **Not built** | The crate is a two-line scaffold (T-9). The roadmap says so. |

---

## What changed for the better

Three recent merges did real work:

- **Validator-attested headers (211).** Ethereum state roots on Aptos no longer come from an admin. No entry function writes them.
- **The Aptos light client (210).** Ethereum checks a real BLS quorum and real inclusion proofs. The parser is strict and the negative tests are real.
- **The proof-gated LockBox (212).** Ethereum has no key that can move a lock. Every lock has a deadline and a permissionless way home.

Together they make a strong statement: **funds live only on Ethereum, and only a proven outcome or a deadline moves them.** That base is sound.

---

## The gap that matters

The plan (issue 178) has two open issues. Both are about getting funds home: the Aptos unwind (194) and the client carrier (195). Neither is about whether the auction itself is fair or can be stopped.

The findings say the auction is the weak part:

- **Any participant can cancel an auction cheaply.** Four separate paths exist: an uncovered winning bid (A-1, one dust lock), an overflow quantity (A-2, two dust locks), a short timelock on a new window (A-7, one dust lock and the first call), and timelock spam (F-1, registration gas, count not measured).
- **Any bidder can see every other bid before deciding which of their own pre-committed bids count** (A-3).
- **Any bidder can push the price to zero in a thin auction** (A-5), and can make the auction thin (A-6).
- **A bidder can take the seller's asset without paying**, once outcomes are emitted and unless the binding check lands with them (E-1). The open unwind pull request (213) carries that check.

A product whose value is "a fair, sealed, uniform-price auction" does not meet its goal while these hold, even if no funds are ever lost. The first launch target is "20-100 individual arbitrageurs" (`prd.md:279`). That audience finds and uses exactly these moves.

---

## Document drift that hides the real state

- The PRD says "Last Updated: 2025-01-17" and "Risk #2 in progress". It links `docs/PLAN-EVOLUTION.md`, which does not exist (the file is `docs/archived/plan-evolution.md`).
- `docs/roadmap.md` still says the auction "picks single highest bid; uniform-price clearing unimplemented", that bidder collateral "explicitly skips collateral", and that windows are "per-seller with caller-supplied duration". The first is no longer true. The second and third are still true in effect (A-1, A-7), for different reasons.
- `docs/architecture/v0-architecture.md` §2.5 to §2.6 describes a reveal where the contract checks cleartexts against the ciphertext. The code checks them against a commitment (A-3).
- `docs/architecture/v0-architecture.md:73` says 28 500 s is 07:45 UTC. It is 07:55. The code and the timing spec carry the same constant (A-8).
- The decision record's first sentence and its trust assumptions section disagree about the upgrade key (E-4).
- The PRD's 67 percent secrecy claim does not match the fork's one half (Chapter 5).

A reader who trusts the canonical documents will believe the product is further along and more trustless than the code is.
