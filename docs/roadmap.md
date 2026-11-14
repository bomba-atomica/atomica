# Atomica Roadmap

Canonical capability roadmap for v0.1 Beta, v1.0, and v2.0.
Derived from [`docs/specifications/prd.md`](specifications/prd.md) and the
code on `main`. Each status says what `main` does, and names the issue that
tracks any gap.

**Status values**

| Value | Meaning |
|-------|---------|
| `live` | Implemented, tested, and wired into the active flow |
| `scaffold` | Skeleton or stub present but not functionally complete |
| `archived` | Code or doc present but superseded; kept for reference only |
| `missing` | No implementation yet |

[`docs/architecture/v0-architecture.md`](architecture/v0-architecture.md) describes the v0.1 code. The v1.0 design doc `docs/architecture/zk-verification.md` is not written yet.

---

## v0.1 Beta — Trustless single-chain auction with verified BLS settlement

<!-- SCOUT(#242) DOC: goal sentence: "trusts only the 2/3 validator threshold" omits the package upgrade-key (owner decision 30) and the one-half secrecy bound (owner decision 31). -->

Goal: working sealed-bid batch auction on Aptos + cross-chain deposit from Ethereum, settled back to Ethereum by a verified BLS outcome proof. v0.1 trusts only the 2/3 validator threshold. No relayer is trusted, and any user can unwind a finished or stuck auction. See the [trustless v0.1 unwinding ADR](decisions/trustless-v0-1-unwinding.md).


| Capability | Owning module(s) under `source/` | Status |
|---|---|---|
| **Ethereum ERC-20 lock / LockBox** | `evm-contracts/src/escrow/LockBox.sol` | `live` — proof-gated: a lock leaves by `releaseByOutcome` on a proven Aptos `AuctionOutcome` or by permissionless `reclaim` after its deadline; no settlement authority (issue 203). `lock` takes no deadline: LockBox computes `lockDeadline(windowId)` from a window clock frozen at deploy, accepts only the current or next window, and keys auctions by `(windowId, pairHash)` (issue 221). A leaf pays its payouts and the remainder to the depositor, and a lock whose recorded leaf is unpayable goes home at once by `reclaimUnpayable` (issue 222) |
| **Fake-token issuance (FakeETH / FakeUSD)** | `evm-contracts/src/tokens/`, `atomica-move-contracts/sources/fake_eth.move`, `fake_usd.move` | `live` |
| **Cross-chain state-proof verification (Ethereum → Aptos)** | `atomica-move-contracts/sources/eth_proof.move`, `mpt.move`, `rlp.move` | `live` — proofs check against state roots of Ethereum headers that the validators certify with a 2/3+ quorum as validator transactions (`0x1::ethereum_headers`); no entry function writes headers, and any account carries a lock proof (issues 196, 197) |
| **Lock-receipt registry** | `atomica-move-contracts/sources/lock_receipt.move` | `live` |
| **Bridged-asset minting on Aptos (`mint_from_lock`)** | `atomica-move-contracts/sources/fake_eth.move`, `fake_usd.move` | `retired` — aborts with `E_RETIRED`; locks pay out only by a proven `AuctionOutcome` or go home by deadline reclaim (issue 203) |
| **SIWE / account abstraction (Ethereum wallet → Aptos)** | `atomica-sdk/src/siwe.ts` | `live` |
| **IBE timelock — client-side (Boneh-Franklin)** | `state-proofs/typescript/src/ibe/`, `atomica-sdk/src/ibe/`, `atomica-sdk/src/aptos/sealed-bid.ts` | `live` — V2 bid ciphertexts of the fork spec |
| **IBE timelock — on-chain Move wrapper** | `atomica-move-contracts/sources/timelock.move`, `timelock_config.move` | `live` — the timelock registry is `0x1::ibe_config` in the fork, and only the auction package registers a timelock, one per window (issues 225, 243); `timelock.move` is a thin view facade over it; `timelock_config.move` holds the unwind grace, carrier margin and receipt cancel delay that `auction` and `lock_receipt` read, plus threshold and duration values nothing reads |
| **Uniform-price batch auction (`auction.move`)** | `atomica-move-contracts/sources/auction.move` | `live` — `finalize_window` clears at one uniform price with a partial fill for the marginal bid and skips invalid bids (issue 216); at most 100 seller locks of at least 0.01 FakeETH and 100 bids of at least 10 FakeUSD collateral per window (issue 218); prices are whole USD per whole base token (issue 217); no reserve price (issue 241); `settle` honours the fills and emits the window's `AuctionOutcome` |
| **Sealed bids end-to-end (encrypted on-chain, decrypted on-chain)** | `atomica-move-contracts/sources/auction.move`, `atomica-sdk/src/aptos/sealed-bid.ts` | `live` — only the price is sealed, and the quantity is clear; bids are stored as IBE ciphertext of the 8-byte price, with no commitment or salt; after the reveal any account opens them with `open_bids`, which decrypts on chain with the fork native `ibe::decrypt_bid` in batches of 12, and then clears the window with `finalize_window` (issue 228) |
| **Twice-daily global auction windows (07:45 / 16:15 UTC)** | `atomica-move-contracts/sources/auction.move`, `atomica-move-contracts/sources/eth_proof.move` | `live` — window ids come from the chain clock and change exactly at 07:45 and 16:15 UTC (`eth_proof::window_id_at`); the first `create_auction` of a window id registers its one timelock with the window close as deadline, and only the package may register (issue 243). Only a test chain (chain id 4) may store a shorter schedule (`eth_proof::set_window_schedule`) |
| **Multi-asset / multi-pair clearing** | `atomica-move-contracts/sources/auction.move` | `missing` — pair allowlist seeded with one launch pair (`ethereum` FakeETH / `ethereum` FakeUSD); only the package account adds pairs |
| **Bidder collateral on Aptos** | `atomica-move-contracts/sources/auction.move` | `live` — `submit_bid` claims a FakeUSD receipt bound to the window and stores its amount; a bid whose collateral does not cover `quote_for_fill(quantity, price)`, or whose price is zero, is invalid at opening, never fills, and gets its whole collateral back (issue 216); each bid's collateral is at least 10 FakeUSD (issue 218) |
| **Cross-chain settlement back to Ethereum (verified BLS outcome proof)** | `evm-contracts/src/escrow/LockBox.sol`, `evm-contracts/src/aptos/AptosLightClient.sol`, `atomica-sdk/src/settlement/` | `live` — `AptosLightClient` verifies the validator BLS signatures of an Aptos `AuctionOutcome`, and LockBox records it and releases each lock (issues 201, 202, 203, 194, 195). The CI test `source/docker-testnet/aptos-testnet/test/auction-round-trip.test.ts` runs lock, auction, `recordOutcome` and `releaseByOutcome` across both live chains (issue 219). `BLSVerifier.sol` is retired, and any wallet carries the outcome with the SDK outcome carrier (issue 195) |
| **Permissionless unwind (finished or stuck auction, lock deadline reclaim)** | `atomica-move-contracts/sources/auction.move`, `lock_receipt.move`, `evm-contracts/src/escrow/LockBox.sol` | `live` — from the window's stuck deadline any account calls `auction::unwind`, which returns every lock the window still holds and emits an all-refund `AuctionOutcome` if the window never settled (issue 194); after the lock deadline anyone may `reclaim` a lock on Ethereum (issues 203, 221), and a lock whose recorded leaf is unpayable goes home at once by `reclaimUnpayable` (issue 222); the UI Unwind and Reclaim actions send these calls (issue 195) |
| **Distance-to-clearing fee rebates** | — | `missing` — not designed (PRD open question); the zero-returning scaffolding in Move, the SDK and the UI was deleted (issue 238) |
| **Sell flow wizard (8-step UI)** | `atomica-web-components/src/components/SellFlow/` | `live` |
| **Bid submission UI** | `atomica-web-components/src/components/AuctionBidder.tsx` | `live` |
| **Auction creation UI** | `atomica-web-components/src/components/AuctionCreator.tsx` | `live` — takes the window id, pair and lock id and sends one `create_auction` transaction; no minimum price field, since launch has no reserve price (issue 241), and no timelock registration step (issue 243). The demo no longer mounts it: `SellFlow` is the seller path, and `AuctionCreator` stays exported (issue 236) |
| **Bid history UI** | `atomica-web-components/src/components/BidHistory.tsx` | `live` |
| **Open / settle / release UI** | `atomica-web-components/src/components/AuctionRevealer.tsx`, `SettleButton.tsx`, `ReleaseButton.tsx` | `live` — the faucet `ClaimButton` is removed. A user finishes a trade in three actions: Open bids, Settle, then Release, which carries the outcome to LockBox and pays each lock on Ethereum (`reclaimUnpayable` for an unpayable leaf). `AuctionRevealer`, `SellFlow` and `ReleaseButton` are exported, and the demo mounts all three steps (issue 236) |
| **Network / contract status UI** | `atomica-web-components/src/components/NetworkStatus.tsx`, `ContractStatus.tsx` | `live` |
| **Dual-chain testnet orchestrator** | `docker-testnet/aptos-testnet/`, `atomica-demo/scripts/orchestrator.ts` | `live` |
| **Browser integration test suite** | `atomica-web-components/tests/integration/`, `atomica-demo/tests/` | `live` |
| **Move unit + integration tests** | `atomica-move-contracts/sources/*_tests.move` | `live` |
| **Ethereum state-proof SDK** | `state-proofs/` | `live` — proof fetching, MPT verification and IBE; the off-chain beacon light client was removed (issue 237) |
| **ZK auction verification** | new ZK crate (planned) | `missing` — no code |

See [`docs/architecture/v0-architecture.md`](architecture/v0-architecture.md) for the component interaction diagram.

---

## v1.0 — ZK double-verification

Goal: same validator honesty assumption as v0.1; add an independent ZK circuit that re-verifies auction clearing so validators cannot manipulate outcomes without detection. ZK double verification is the only v1.0 addition: v0.1 already has no trusted relayer to replace.

| Capability | Owning module(s) under `source/` | Status |
|---|---|---|
| **ZK auction-clearing circuit** | new ZK crate (planned) | `missing` |
| **On-chain ZK verifier (Ethereum)** | `evm-contracts/src/` (new) | `missing` |
| **Dual-gate settlement (BLS + ZK must agree)** | `evm-contracts/src/escrow/LockBox.sol` (the gate goes on its release entry point) | `missing` |
| **On-chain bid-validity verification via ZK** | new ZK crate (planned) | `missing` |
| **MoveVM-independent ZK execution** | new ZK crate (planned, isolated Rust) | `missing` |

The v1.0 design doc, `docs/architecture/zk-verification.md`, is not written yet.

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

Every item this table listed is gone from the codebase: `auction.move.broken`,
the old web package shells, the pre-pivot Solidity
contracts (deleted by issue 195), the `atomica-web-ui` fake-token mint
payloads and the `.skip` Move test files. No extraneous item is open.
