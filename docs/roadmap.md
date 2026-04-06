# Atomica Roadmap

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

Forward links to `docs/architecture/` files are permitted to be unresolved at merge time (those files are authored in issue #83).

---

## v0.1 Beta — Trustless single-chain auction with BLS-only settlement

Goal: working sealed-bid batch auction on Aptos + cross-chain deposit from Ethereum, settled back to Ethereum via BLS threshold signatures.

| Capability | Owning module(s) under `source/` | Status |
|---|---|---|
| **Ethereum ERC-20 lock / LockBox** | `evm-contracts/src/escrow/LockBox.sol` | `live` |
| **Fake-token issuance (FakeETH / FakeUSD)** | `evm-contracts/src/tokens/`, `atomica-move-contracts/sources/fake_eth.move`, `fake_usd.move` | `live` |
| **Cross-chain state-proof verification (Ethereum → Aptos)** | `atomica-move-contracts/sources/eth_proof.move`, `mpt.move`, `rlp.move` | `live` |
| **Lock-receipt registry** | `atomica-move-contracts/sources/lock_receipt.move` | `live` |
| **Bridged-asset minting on Aptos (`mint_from_lock`)** | `atomica-move-contracts/sources/fake_eth.move`, `fake_usd.move` | `live` |
| **SIWE / account abstraction (Ethereum wallet → Aptos)** | `atomica-web-ui/src/lib/aptos/siwe.ts` | `live` |
| **IBE timelock — client-side (Boneh-Franklin)** | `atomica-web-ui/src/lib/ibe.ts` | `live` |
| **IBE timelock — on-chain Move scaffolding** | `atomica-move-contracts/sources/timelock.move`, `timelock_config.move` | `scaffold` |
| **Uniform-price batch auction (`auction.move`)** | `atomica-move-contracts/sources/auction.move` | `scaffold` — current `settle()` picks single highest bid; uniform-price clearing unimplemented |
| **Sealed bids end-to-end (encrypted on-chain, plaintext-reveal path)** | `atomica-move-contracts/sources/auction.move`, `atomica-web-ui/src/lib/ibe.ts` | `scaffold` — bids stored plaintext; no `submit_cleartext_and_clear` reveal path |
| **Twice-daily global auction windows (07:45 / 16:15 UTC)** | `atomica-move-contracts/sources/auction.move` | `missing` — auctions are per-seller with caller-supplied duration |
| **Multi-asset / multi-pair clearing** | `atomica-move-contracts/sources/auction.move` | `missing` — single pair hard-coded |
| **Bidder collateral on Aptos** | `atomica-move-contracts/sources/auction.move` | `missing` — Demo explicitly skips collateral |
| **Cross-chain settlement back to Ethereum (BLS relayer)** | `evm-contracts/src/Settlement.sol`, `BLSVerifier.sol` | `scaffold` — contracts exist but not wired; no relayer, no `BLSVerifierTestnet.sol` |
| **Distance-to-clearing fee rebates (on-chain)** | `atomica-move-contracts/sources/auction.move` | `missing` — no uniform-price anchor to compute rebates against |
| **Fee-rebate UI display** | `atomica-web-ui/src/components/FeeRebateDisplay.tsx` | `scaffold` — component present but driven by stubbed input |
| **Sell flow wizard (8-step UI)** | `atomica-web-ui/src/components/SellFlow/` | `live` |
| **Bid submission UI** | `atomica-web-ui/src/components/AuctionBidder.tsx` | `live` |
| **Auction creation UI** | `atomica-web-ui/src/components/AuctionCreator.tsx` | `live` |
| **Bid history UI** | `atomica-web-ui/src/components/BidHistory.tsx` | `live` |
| **Settle / Claim UI** | `atomica-web-ui/src/components/SettleButton.tsx`, `ClaimButton.tsx` | `live` — Demo-phase payout; lifetime bounded by real cross-chain settlement |
| **Network / contract status UI** | `atomica-web-ui/src/components/NetworkStatus.tsx`, `ContractStatus.tsx` | `live` |
| **Dual-chain testnet orchestrator** | `docker-testnet/`, `atomica-web/scripts/dual-testnet-orchestrator.ts` | `live` |
| **Browser integration test suite** | `atomica-web/tests/`, `atomica-web-ui/tests/` | `live` |
| **Move unit + integration tests** | `atomica-move-contracts/sources/*_tests.move` | `live` |
| **Ethereum state-proof SDK** | `state-proofs/`, `atomica-crosschain-testing/` | `live` |
| **ZK auction verification (`atomica-zkp`)** | `atomica-zkp/src/` | `missing` — `lib.rs` is 2 lines |

See [`docs/architecture/v0-architecture.md`](architecture/v0-architecture.md) (authored in #83) for the component interaction diagram.

---

## v1.0 — ZK double-verification

Goal: same validator honesty assumption as v0.1; add an independent ZK circuit that re-verifies auction clearing so validators cannot manipulate outcomes without detection.

| Capability | Owning module(s) under `source/` | Status |
|---|---|---|
| **ZK auction-clearing circuit** | `atomica-zkp/src/` | `missing` |
| **On-chain ZK verifier (Ethereum)** | `evm-contracts/src/` (new) | `missing` |
| **Dual-gate settlement (BLS + ZK must agree)** | `evm-contracts/src/Settlement.sol` | `missing` |
| **On-chain bid-validity verification via ZK** | `atomica-zkp/src/` | `missing` |
| **MoveVM-independent ZK execution** | `atomica-zkp/` (isolated Rust) | `missing` |

See [`docs/architecture/zk-verification.md`](architecture/zk-verification.md) (authored in #83).

---

## v2.0 — Cross-chain auctions with BitVM ratchet

Goal: Bitcoin support via BitVM + STARK proofs; multi-step ratchet for atomic cross-chain releases; extension to additional chains (Solana, etc.).

| Capability | Owning module(s) under `source/` | Status |
|---|---|---|
| **Bitcoin integration (BitVM)** | TBD | `missing` |
| **STARK proof generation** | `atomica-zkp/src/` (planned) | `missing` |
| **Multi-step atomic ratchet** | TBD | `missing` |
| **Multi-chain extension (Solana, etc.)** | TBD | `missing` |
| **Cross-chain trust via ratchet (no bridge liveness assumption)** | TBD | `missing` |

---

## Extraneous / archived items to resolve before v0.1 Beta

These items exist in the codebase but are not part of the live flow.
Resolving them before adding more features reduces confusion.

| Item | Location | Recommended action |
|---|---|---|
| `auction.move.broken` (old FA-based auction) | `atomica-move-contracts/sources/` | Delete or fold into rewrite |
| `atomica-web/` (gutted shell) | `source/atomica-web/` | Reconcile with `atomica-web-ui`; delete dead package |
| `atomica-web-demo/` (near-empty shell) | `source/atomica-web-demo/` | Fold into `atomica-web-ui` or delete |
| Pre-pivot Solidity surface (`AuctionManager`, `AuctionRegistry`, `Governance`, `DepositBox`) | `evm-contracts/src/` | Re-anchor to current architecture or archive |
| Vestigial Aptos-side fake-token mint payloads | `atomica-web-ui/src/lib/aptos/payloads.ts` | Delete |
| `fake_eth_tests.move.skip`, `fake_usd_tests.move.skip` | `atomica-move-contracts/sources/` | Fix or delete |
