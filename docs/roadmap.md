# Atomica Roadmap

<!-- SCOUT(#242) DOC: the April 2026 drift inventory file named here is not in the repo. -->

Canonical capability roadmap for v0.1 Beta, v1.0, and v2.0.
Derived from [`docs/specifications/prd.md`](specifications/prd.md) and the
April 2026 drift inventory (`progress-review-2026-04-06.md` on main).

**Status values**

| Value | Meaning |
|-------|---------|
| `live` | Implemented, tested, and wired into the active flow |
| `scaffold` | Skeleton or stub present but not functionally complete |
| `archived` | Code or doc present but superseded; kept for reference only |
| `missing` | No implementation yet |

<!-- SCOUT(#242) DOC: "authored in issue #83": v0-architecture.md exists; zk-verification.md (linked under v1.0) still does not. -->

Forward links to `docs/architecture/` files are permitted to be unresolved at merge time (those files are authored in issue #83).

---

## v0.1 Beta — Trustless single-chain auction with verified BLS settlement

<!-- SCOUT(#242) DOC: goal sentence: "trusts only the 2/3 validator threshold" omits the package upgrade-key (owner decision 30) and the one-half secrecy bound (owner decision 31); "any user can unwind" is true on Ethereum only until the Aptos unwind (194) merges. -->

Goal: working sealed-bid batch auction on Aptos + cross-chain deposit from Ethereum, settled back to Ethereum by a verified BLS outcome proof. v0.1 trusts only the 2/3 validator threshold. No relayer is trusted, and any user can unwind a finished or stuck auction. See the [trustless v0.1 unwinding ADR](decisions/trustless-v0-1-unwinding.md).

<!-- SCOUT(#242) DOC: every atomica-web-ui/ and atomica-web/ path in this table is stale: the packages are atomica-sdk, atomica-web-components and atomica-demo (SIWE, IBE client, sealed bids, UI rows, orchestrator, browser tests). -->
<!-- SCOUT(#242) DOC: state-proof row: the reason text is stale: validator-attested headers are merged (issues 196, 197) and no admin writes roots. -->
<!-- SCOUT(#242) DOC: "IBE timelock on-chain Move scaffolding" row: scaffold is stale: the registry is 0x1::ibe_config in the fork, timelock.move is a thin wrapper and timelock_config.move holds values nothing reads. -->
<!-- SCOUT(#242) DOC: auction row: the status text is stale: clear_internal clears at a uniform price with partial fill; the open gaps are bid validity (216), caps (218) and the unused reserve (241). -->
<!-- SCOUT(#242) DOC: windows row: the status text is stale: windows are global per (window_id, pair) with ids from the clock; the gaps are the formula (220) and the seller-picked timelock deadline (243). -->
<!-- SCOUT(#242) DOC: collateral row: the status text is stale: submit_bid claims a FakeUSD receipt and drops its amount. -->
<!-- SCOUT(#242) DOC: settlement row: stale: the Aptos light client (202) and proof-gated LockBox (203) are merged and BLSVerifier.sol is retired; missing are the Aptos outcome (194), the carrier (195) and a live round trip (219). -->
<!-- SCOUT(#242) DOC: unwind row: LockBox reclaim is live (203); the Aptos unwind is open pull request 213 (194); the SDK and UI half (195) is open. -->

| Capability | Owning module(s) under `source/` | Status |
|---|---|---|
| **Ethereum ERC-20 lock / LockBox** | `evm-contracts/src/escrow/LockBox.sol` | `live` — proof-gated: a lock leaves by `releaseByOutcome` on a proven Aptos `AuctionOutcome` or by permissionless `reclaim` after its deadline; no settlement authority (issue 203). `lock` takes no deadline: LockBox computes `lockDeadline(windowId)` from a window clock frozen at deploy, accepts only the current or next window, and keys auctions by `(windowId, pairHash)` (issue 221). A leaf pays its payouts and the remainder to the depositor, and a lock whose recorded leaf is unpayable goes home at once by `reclaimUnpayable` (issue 222) |
| **Fake-token issuance (FakeETH / FakeUSD)** | `evm-contracts/src/tokens/`, `atomica-move-contracts/sources/fake_eth.move`, `fake_usd.move` | `live` |
| **Cross-chain state-proof verification (Ethereum → Aptos)** | `atomica-move-contracts/sources/eth_proof.move`, `mpt.move`, `rlp.move` | `live` — proofs check against admin-submitted roots; validator-attested headers that anyone carries are `missing` (issues 196, 197) |
| **Lock-receipt registry** | `atomica-move-contracts/sources/lock_receipt.move` | `live` |
| **Bridged-asset minting on Aptos (`mint_from_lock`)** | `atomica-move-contracts/sources/fake_eth.move`, `fake_usd.move` | `retired` — aborts with `E_RETIRED`; locks pay out only by a proven `AuctionOutcome` or go home by deadline reclaim (issue 203) |
| **SIWE / account abstraction (Ethereum wallet → Aptos)** | `atomica-web-ui/src/lib/aptos/siwe.ts` | `live` |
| **IBE timelock — client-side (Boneh-Franklin)** | `atomica-web-ui/src/lib/ibe.ts` | `live` |
| **IBE timelock — on-chain Move scaffolding** | `atomica-move-contracts/sources/timelock.move`, `timelock_config.move` | `scaffold` |
| **Uniform-price batch auction (`auction.move`)** | `atomica-move-contracts/sources/auction.move` | `scaffold` — current `settle()` picks single highest bid; uniform-price clearing unimplemented |
| **Sealed bids end-to-end (encrypted on-chain, decrypted on-chain)** | `atomica-move-contracts/sources/auction.move`, `atomica-web-ui/src/lib/ibe.ts` | `live` — bids are stored as IBE ciphertext of the 8-byte price, with no commitment or salt; after the reveal any account opens them with `open_bids`, which decrypts on chain with the fork native `ibe::decrypt_bid` in batches of 12, and then clears the window with `finalize_window` (issue 228) |
| **Twice-daily global auction windows (07:45 / 16:15 UTC)** | `atomica-move-contracts/sources/auction.move`, `atomica-move-contracts/sources/eth_proof.move` | `live` — window ids come from the chain clock and change exactly at 07:45 and 16:15 UTC (`eth_proof::window_id_at`); the first `create_auction` of a window id registers its one timelock with the window close as deadline, and only the package may register (issue 243). Only a test chain (chain id 4) may store a shorter schedule (`eth_proof::set_window_schedule`) |
| **Multi-asset / multi-pair clearing** | `atomica-move-contracts/sources/auction.move` | `missing` — pair allowlist seeded with one launch pair (`ethereum` FakeETH / `ethereum` FakeUSD); only the package account adds pairs |
| **Bidder collateral on Aptos** | `atomica-move-contracts/sources/auction.move` | `live` — `submit_bid` claims a FakeUSD receipt bound to the window and stores its amount; a bid whose collateral does not cover `quote_for_fill(quantity, price)`, or whose price is zero, is invalid at opening, never fills, and gets its whole collateral back (issue 216) |
| **Cross-chain settlement back to Ethereum (verified BLS outcome proof)** | `evm-contracts/src/escrow/LockBox.sol`, `BLSVerifier.sol` | `live` — `AptosLightClient` verifies the validator BLS signatures of an Aptos `AuctionOutcome`, and LockBox records it and releases each lock (issues 201, 202, 203, 194, 195). The CI test `source/docker-testnet/aptos-testnet/test/auction-round-trip.test.ts` runs lock, auction, `recordOutcome` and `releaseByOutcome` across both live chains (issue 219) |
| **Permissionless unwind (finished or stuck auction, lock deadline reclaim)** | `atomica-move-contracts/sources/auction.move`, `lock_receipt.move`, `evm-contracts/src/escrow/LockBox.sol` | `missing` — issues 194, 195, 203 |
| **Distance-to-clearing fee rebates** | — | `missing` — not designed (PRD open question); the zero-returning scaffolding in Move, the SDK and the UI was deleted (issue 238) |
| **Sell flow wizard (8-step UI)** | `atomica-web-ui/src/components/SellFlow/` | `live` |
| **Bid submission UI** | `atomica-web-components/src/components/AuctionBidder.tsx` | `live` |
| **Auction creation UI** | `atomica-web-ui/src/components/AuctionCreator.tsx` | `live` — takes the window id, pair and lock id and sends one `create_auction` transaction; no minimum price field, since launch has no reserve price (issue 241), and no timelock registration step (issue 243) |
| **Bid history UI** | `atomica-web-ui/src/components/BidHistory.tsx` | `live` |
| **Open / settle / release UI** | `atomica-web-components/src/components/AuctionRevealer.tsx`, `SettleButton.tsx`, `ReleaseButton.tsx` | `live` — the faucet `ClaimButton` is removed. A user finishes a trade in three actions: Open bids, Settle, then Release, which carries the outcome to LockBox and pays each lock on Ethereum (`reclaimUnpayable` for an unpayable leaf). `AuctionRevealer`, `SellFlow` and `ReleaseButton` are exported, and the demo mounts all three steps (issue 236) |
| **Network / contract status UI** | `atomica-web-ui/src/components/NetworkStatus.tsx`, `ContractStatus.tsx` | `live` |
| **Dual-chain testnet orchestrator** | `docker-testnet/aptos-testnet/`, `atomica-demo/scripts/orchestrator.ts` | `live` |
| **Browser integration test suite** | `atomica-web/tests/`, `atomica-web-ui/tests/` | `live` |
| **Move unit + integration tests** | `atomica-move-contracts/sources/*_tests.move` | `live` |
| **Ethereum state-proof SDK** | `state-proofs/` | `live` — proof fetching, MPT verification and IBE; the off-chain beacon light client was removed (issue 237) |
| **ZK auction verification** | new ZK crate (planned) | `missing` — no code |

See [`docs/architecture/v0-architecture.md`](architecture/v0-architecture.md) (authored in #83) for the component interaction diagram.

---

## v1.0 — ZK double-verification

Goal: same validator honesty assumption as v0.1; add an independent ZK circuit that re-verifies auction clearing so validators cannot manipulate outcomes without detection. ZK double verification is the only v1.0 addition: v0.1 already has no trusted relayer to replace.

<!-- SCOUT(#242) DOC: "Dual-gate settlement" row names Settlement.sol, a retired contract; the gate belongs on LockBox. -->

| Capability | Owning module(s) under `source/` | Status |
|---|---|---|
| **ZK auction-clearing circuit** | new ZK crate (planned) | `missing` |
| **On-chain ZK verifier (Ethereum)** | `evm-contracts/src/` (new) | `missing` |
| **Dual-gate settlement (BLS + ZK must agree)** | `evm-contracts/src/Settlement.sol` | `missing` |
| **On-chain bid-validity verification via ZK** | new ZK crate (planned) | `missing` |
| **MoveVM-independent ZK execution** | new ZK crate (planned, isolated Rust) | `missing` |

See [`docs/architecture/zk-verification.md`](architecture/zk-verification.md) (authored in #83).

---

## v2.0 — Cross-chain auctions with BitVM ratchet

Goal: Bitcoin support via BitVM + STARK proofs; multi-step ratchet for atomic cross-chain releases; extension to additional chains (Solana, etc.).

| Capability | Owning module(s) under `source/` | Status |
|---|---|---|
| **Bitcoin integration (BitVM)** | TBD | `missing` |
| **STARK proof generation** | new ZK crate (planned) | `missing` |
| **Multi-step atomic ratchet** | TBD | `missing` |
| **Multi-chain extension (Solana, etc.)** | TBD | `missing` |
| **Cross-chain trust via ratchet (no bridge liveness assumption)** | TBD | `missing` |

---

## Extraneous / archived items to resolve before v0.1 Beta

These items exist in the codebase but are not part of the live flow.
Resolving them before adding more features reduces confusion.

<!-- SCOUT(#242) DOC: this table is stale: auction.move.broken, atomica-web/, atomica-web-demo/, the atomica-web-ui payloads and the .skip test files no longer exist; the pre-pivot Solidity row is owned by the SDK and UI unwind (195). -->

| Item | Location | Recommended action |
|---|---|---|
| `auction.move.broken` (old FA-based auction) | `atomica-move-contracts/sources/` | Delete or fold into rewrite |
| `atomica-web/` (gutted shell) | `source/atomica-web/` | Reconcile with `atomica-web-ui`; delete dead package |
| `atomica-web-demo/` (near-empty shell) | `source/atomica-web-demo/` | Fold into `atomica-web-ui` or delete |
| Pre-pivot Solidity surface (`AuctionManager`, `AuctionRegistry`, `Governance`, `DepositBox`) | `evm-contracts/src/` | Re-anchor to current architecture or archive |
| Vestigial Aptos-side fake-token mint payloads | `atomica-web-ui/src/lib/aptos/payloads.ts` | Delete |
| `fake_eth_tests.move.skip`, `fake_usd_tests.move.skip` | `atomica-move-contracts/sources/` | Fix or delete |
