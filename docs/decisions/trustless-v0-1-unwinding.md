# Decision: Trustless v0.1 Unwinding

**Date:** 2026-11-10
**Status:** ACCEPTED
**Decision Makers:** Product owner (lucky-tensor)
**Source:** Owner axioms given on 2026-11-10 and recorded in the issue set that implements them (issues 194 to 203, this ADR is issue 198). They override every older doc that disagrees.

---

## Decision

<!-- SCOUT(#242) DOC: decision sentence (owner decision 30): "No relayer, admin key or operator account can move, hold or freeze user funds" contradicts Trust Assumptions below, where the package upgrade-key holder can emit any AuctionOutcome. -->

v0.1 Beta is trustless. It trusts only the 2/3 Aptos validator threshold. No relayer, admin key or operator account can move, hold or freeze user funds.

The owner set three axioms:

1. **All funds unwind to their origin unless the auction executes flawlessly.** A lock pays out to counterparties only on a proven, complete auction outcome. Every other path returns the full amount to the depositor. On Ethereum a leaf means: these payouts, and the remainder of the lock to its depositor. A leaf that LockBox cannot pay (payouts that sum above the lock amount or overflow, or a zero recipient) returns the whole lock to its depositor through `reclaimUnpayable`, with no deadline wait (issue 222). A lock that cannot be paid as recorded goes home.
2. **No relayer is trusted.** A relayer may carry data. It never decides anything. Every byte it carries is checked on chain against the validator threshold.
3. **Any user can send a transaction to a finished or stuck auction to unwind it.** Unwinding needs no special account and no operator action.

The axioms force four mechanisms:

<!-- SCOUT(#242) DOC: unwind row: not on main; open pull request 213 (194) and the SDK and UI unwind (195) implement it. -->

| Mechanism | What it replaces | Implementing issues |
| --- | --- | --- |
| **Validator-attested Ethereum headers.** Aptos validators certify Ethereum block headers with a 2/3+ voting-power quorum. Anyone may carry a certified header. No entry function writes headers. | The admin-only `eth_proof::submit_header` relayer. | 196, 197 |
| **Verified Aptos outcome proof releases Ethereum locks.** Ethereum checks a validator-signed Aptos LedgerInfo with real BLS12-381 (EIP-2537) and an event inclusion proof. Anyone may submit it. | The `settlementAuthority` EOA and the `BLSVerifierTestnet` trusted-EOA verifier. Real BLS verification moves from v1 into v0.1. | 201, 202, 203 |
| **Per-lock deadline with permissionless reclaim.** Every Ethereum lock carries a deadline, and all locks of one auction share it: LockBox computes it from the window id, `lockDeadline(windowId)`, equal to `auction::eth_lock_deadline(window_id)`. No caller supplies one, and `lock` accepts only the current or the next window, so a wrong or far-future deadline cannot strand a lock. After the deadline, anyone may return an open lock to its depositor, unless the auction's recorded outcome covers that lock. A reclaim before any outcome is recorded voids that auction's outcome on Ethereum, so no outcome can release a partly reclaimed auction. A lock the recorded outcome covers with an unpayable leaf goes home at once by `reclaimUnpayable`, while the other locks still release. | "Abandoned locks are frozen." | 203, 221, 222 |
| **One permissionless unwind entry per auction on Aptos.** Any account may call the unwind entry on a finished or stuck window. A window is stuck from its stuck deadline, the reveal expiry plus the unwind grace, with no opening window: a window whose bids nobody opens on chain (`open_bids`, issue 228) by then unwinds. It gives every receipt of the window a terminal state and emits an outcome Ethereum can verify. A never-auctioned receipt can be cancelled by anyone after a delay. | Relayer-driven refunds and the open recovery question on issue 170. | 194, 195 |

This ADR names the mechanisms. The implementing issues specify the exact proof formats.

---

## Context

Before this decision the v0.1 design trusted one relayer key in three places:

- Only the `@atomica` admin could submit Ethereum state roots to Aptos. One key decided which Ethereum locks existed.
- Only the `settlementAuthority` EOA could release Ethereum locks. `BLSVerifierTestnet` accepted that EOA's call in place of a BLS signature check. Real BLS verification was deferred to v1, and a v1 ZK proof was meant to remove the relayer.
- A lock that never reached an auction had no Aptos outcome. Nothing could release it, so it was frozen.

The PRD already set the v0.1 trust model as the 2/3 validator threshold. The relayer design broke that model. A lost, offline or dishonest relayer key could freeze or steal every lock.

---

## Consequences

**Positive**

<!-- SCOUT(#242) DOC: "Funds never depend on one key" contradicts the upgrade-key assumption below (owner decision 30); "matches the PRD ... plus the one named assumption" is false while the PRD names no upgrade-key holder. -->

- Funds never depend on one key. A stuck auction always has a way home.
- The v0.1 trust model matches the PRD: the 2/3 validator threshold, plus the one named assumption below.
- ZK in v1.0 becomes a second, independent check on auction clearing. It no longer has to remove a trusted relayer.

**Negative**

- Real BLS verification on Ethereum now ships in v0.1. It needs EIP-2537 precompiles on every target Ethereum network, including the docker testnet (Electra enabled).
- `LockBox` has no upgrade path. The proof-gated LockBox ships at a new address. The computed lock deadline (221) needs one more redeploy, batched with the leaf payment rule (222).
- The Aptos fork gains validator header attestation and outcome-proof endpoints. That widens the fork's delta from upstream.

**Neutral**

- A relayer process may still exist as a convenience carrier. Users can do everything it does themselves.

---

## Trust Assumptions

<!-- SCOUT(#242) DOC: add the bid secrecy assumption once the owner answers decision 31: the fork keeps bids secret only against at most one half of stake, which this section does not name. -->

- **The 2/3 validator threshold.** A quorum of the current Aptos validator set can finalize any outcome.
- **The `@atomica` package upgrade key (owner decision, 2026-11-11).** The `@atomica` Move package stays upgradeable at v0.1. v0.1 does not set `upgrade_policy` to immutable. The upgrade key holder can publish code that emits any `AuctionOutcome` event, and the validator quorum signs it like any other transaction. The Ethereum light client proves only that the event is final, so Ethereum lock safety at v0.1 also trusts that key.

---

## Supersedes

This ADR supersedes the following text. Where older text disagrees with the three axioms, this ADR wins.

- [v0 Architecture](../architecture/v0-architecture.md) §3.1: the admin-only `submit_header` trusted relayer, "Abandoned locks are frozen", and the `settlementAuthority` relayer EOA.
- [v0 Architecture](../architecture/v0-architecture.md) §3.2 to §3.4: the `BLSVerifierTestnet` trusted-EOA interface, the deferral of real BLS verification to v1, and the ZK seam as the relayer replacement.
- [Roadmap](../roadmap.md): the v0.1 "BLS relayer" settlement row.
- [PRD](../specifications/prd.md): Risk #3 and the Protocol Evolution trust table, where they imply any trust beyond the validator threshold.
- [Aptos 1.49.6 Upgrade Review](../code-reviews/aptos-1-49-6-upgrade-review.md): any statement that accepts a trusted operator or relayer, such as the Demo trust model note in finding 11.
- The open owner decision on issue 170 about recovering abandoned locks.
- `fake_eth::mint_from_lock` and `fake_usd::mint_from_lock`: they minted Aptos FA from a lock receipt with no `AuctionOutcome`. With deadline reclaim a depositor could mint FA and then reclaim the Ethereum lock. Both are retired and abort with `E_RETIRED` (issue 203).

---

## Related Decisions

- [Aptos Validator Timelock](aptos-validator-timelock.md)
- [Unified Away-Chain Architecture](unified-away-chain-architecture.md)
