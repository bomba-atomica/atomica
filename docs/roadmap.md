# Atomica Roadmap

Canonical capability roadmap for v0.1 Beta, v1.0, and v2.0.
Derived from [`docs/specifications/prd.md`](specifications/prd.md).

Last audited against code: 2026-05-18.

**Status values**

| Value | Meaning |
|-------|---------|
| `live` | Implemented, tested, and wired into the active flow |
| `scaffold` | Typed stub present — compiles and tests pass but runtime behaviour is not implemented |
| `archived` | Code or doc present but superseded; kept for reference only |
| `missing` | No implementation yet |
| ~~`done`~~ | Cleanup task completed |

---

## v0.1 Beta — Trustless single-chain auction with BLS-only settlement

Goal: working sealed-bid batch auction on Aptos + cross-chain deposit from Ethereum, settled back to Ethereum via BLS threshold signatures.

### Infrastructure & cross-chain primitives

| Capability | Owning module(s) under `source/` | Status |
|---|---|---|
| **Ethereum ERC-20 lock / LockBox** | `evm-contracts/src/escrow/LockBox.sol` | `live` |
| **Fake-token issuance (FakeETH / FakeUSD)** | `evm-contracts/src/tokens/`, `atomica-move-contracts/sources/fake_eth.move`, `fake_usd.move` | `live` |
| **Cross-chain state-proof verification (Ethereum → Aptos)** | `atomica-move-contracts/sources/eth_proof.move`, `mpt.move`, `rlp.move` | `live` |
| **Lock-receipt registry** | `atomica-move-contracts/sources/lock_receipt.move` | `live` |
| **Bridged-asset minting on Aptos (`mint_from_lock`)** | `atomica-move-contracts/sources/fake_eth.move`, `fake_usd.move` | `live` |
| **SIWE / account abstraction (Ethereum wallet → Aptos)** | `atomica-web-components/src/context/WalletContext.tsx` | `live` |
| **Ethereum state-proof SDK** | `state-proofs/`, `atomica-crosschain-testing/` | `live` |
| **Dual-chain testnet orchestrator** | `docker-testnet/aptos-testnet/`, `atomica-sdk/` | `live` |

### IBE timelock (sealed bids)

| Capability | Owning module(s) under `source/` | Status |
|---|---|---|
| **IBE timelock — client-side encryption (Boneh-Franklin)** | `atomica-web-components/src/lib/ibe.ts` | `live` |
| **IBE identity derivation SDK (`computeIdentity`)** | `atomica-sdk/src/ibe/identity.ts` | `live` |
| **IBE timelock — on-chain Move decryption key release** | `atomica-move-contracts/sources/timelock.move`, `timelock_config.move` | `scaffold` — stubs backed by `aptos_framework::ibe_config`; real DKG key release not wired |
| **Sealed-bid reveal path (`submit_cleartext_and_clear`)** | `atomica-move-contracts/sources/auction.move` | `scaffold` — function body aborts `E_NOT_IMPLEMENTED`; IBE ciphertext verification + cleartext storage not implemented |

### Auction engine (Move)

| Capability | Owning module(s) under `source/` | Status |
|---|---|---|
| **Global auction registry (`AuctionRegistry`) and window data model** | `atomica-move-contracts/sources/auction.move` | `live` — structs, storage layout, and read helpers fully implemented |
| **Twice-daily window schedule (`current_window_id`, 07:45 / 16:15 UTC)** | `atomica-move-contracts/sources/auction.move` | `live` — `current_window_id()` computes correct window from on-chain clock |
| **Sealed-bid submission with collateral claim (`submit_bid`)** | `atomica-move-contracts/sources/auction.move` | `live` — claims `LockReceipt<Ethereum, FakeUSD>` as collateral and stores `SealedBid`; fully implemented |
| **Auction creation (`create_auction`)** | `atomica-move-contracts/sources/auction.move` | `scaffold` — function body aborts `E_NOT_IMPLEMENTED` |
| **Uniform-price clearing (`clear_uniform_price`)** | `atomica-move-contracts/sources/auction.move` | `scaffold` — function body aborts `E_NOT_IMPLEMENTED`; sort + marginal-price algorithm not implemented |
| **Move-side settlement and fee distribution (`settle`)** | `atomica-move-contracts/sources/auction.move` | `scaffold` — function body aborts `E_NOT_IMPLEMENTED`; winner payout + fee/rebate distribution not implemented |
| **Multi-asset / multi-pair clearing** | `atomica-move-contracts/sources/auction.move` | `scaffold` — data model supports arbitrary `pair_bcs`; blocked on `create_auction` and `clear_uniform_price` implementations |
| **Distance-to-clearing fee rebates (on-chain)** | `atomica-move-contracts/sources/auction.move` | `scaffold` — `compute_rebates()` helper and `Rebate` struct exist; blocked on `clear_uniform_price` providing uniform price anchor |

### Ethereum-side settlement

| Capability | Owning module(s) under `source/` | Status |
|---|---|---|
| **`Settlement.sol` — BLS-verified payout contract** | `evm-contracts/src/Settlement.sol` | `live` — `settle()` implemented; verifies BLS signature via `BLSVerifier`, executes transfers via `DepositBox` |
| **`BLSVerifierTestnet.sol` — trusted-relayer verifier (testnet)** | `evm-contracts/src/settlement/BLSVerifierTestnet.sol` | `live` — trusted-relayer mode for testnet; production BLS multisig verifier is a separate work item |
| **BLS relayer service** | `atomica-sdk/src/settlement/bridge.ts` | `scaffold` — `queryAuctionSettledEvents`, `submitSettlement`, `releaseBidderCollateral` all throw `NOT_IMPLEMENTED`; no off-chain relayer process exists |
| **Cross-chain settlement SDK wiring** | `atomica-sdk/src/settlement/bridge.ts` | `scaffold` — typed interfaces defined; all function bodies throw `NOT_IMPLEMENTED` |

### UI components

| Capability | Owning module(s) under `source/` | Status |
|---|---|---|
| **Sell flow wizard (8-step UI)** | `atomica-web-components/src/components/SellFlow/` | `live` |
| **Bid submission UI (`AuctionBidder`)** | `atomica-web-components/src/components/AuctionBidder.tsx` | `live` |
| **Auction creation UI (`AuctionCreator`)** | `atomica-web-components/src/components/AuctionCreator.tsx` | `live` |
| **Bid history UI (`BidHistory`)** | `atomica-web-components/src/components/BidHistory.tsx` | `live` |
| **Settle / Claim UI (`SettleButton`, `ClaimButton`)** | `atomica-web-components/src/components/SettleButton.tsx`, `ClaimButton.tsx` | `live` — Demo-phase payout; bounded by real cross-chain settlement going live |
| **Network / contract status UI** | `atomica-web-components/src/components/NetworkStatus.tsx`, `ContractStatus.tsx` | `live` |
| **Centralized app state (`AppStateProvider`, `AppConfig`)** | `atomica-web-components/src/state/app-state.tsx`, `app-config.ts` | `live` |
| **App settings UI (`AppSettings`)** | `atomica-web-components/src/components/AppSettings.tsx` | `live` — exported but not yet wired into the demo app shell |
| **Bid reveal UI (`AuctionRevealer`)** | `atomica-web-components/src/components/AuctionRevealer.tsx` | `scaffold` — manual cleartext entry only; no off-chain IBE decryption path |
| **Settlement status UI (`SettlementStatus`)** | `atomica-web-components/src/components/SettlementStatus.tsx` | `scaffold` — renders "bridge scaffold" notice until BLS relayer is live |
| **Withdraw winnings UI (`WithdrawWinnings`)** | `atomica-web-components/src/components/WithdrawWinnings.tsx` | `scaffold` — renders disabled with scaffold notice until `submitSettlement` is implemented |
| **Fee-rebate UI display (`FeeRebateDisplay`, `useFeeRebate`)** | `atomica-web-components/src/components/FeeRebateDisplay.tsx`, `hooks/useFeeRebate.ts` | `scaffold` — hook wired; driven by stub data until on-chain `settle` provides real rebate values |

### Test coverage

| Capability | Owning module(s) under `source/` | Status |
|---|---|---|
| **Move unit + integration tests** | `atomica-move-contracts/sources/*_tests.move` | `live` |
| **Browser integration test suite** | `atomica-web-components/tests/integration/` | `live` |
| **Component unit tests** | `atomica-web-components/tests/` | `live` |
| **SDK unit tests** | `atomica-sdk/tests/` | `live` |

---

## v0.1 Beta — Pre-launch cleanup

Items in the codebase that are not part of the live flow. Resolve before shipping v0.1 Beta.

| Item | Location | Status |
|---|---|---|
| ~~`auction.move.broken` (old FA-based auction)~~ | `atomica-move-contracts/sources/` | ~~done~~ — deleted |
| ~~`fake_eth_tests.move.skip`, `fake_usd_tests.move.skip`~~ | `atomica-move-contracts/sources/` | ~~done~~ — deleted |
| ~~`AuctionManager.sol` (pre-pivot)~~ | `evm-contracts/src/` | ~~done~~ — deleted |
| ~~Vestigial Aptos-side fake-token mint payloads~~ | `atomica-sdk/src/aptos/payloads.ts` | ~~done~~ — cleaned in PR #105 |
| `atomica-web/` (gutted shell) | `source/atomica-web/` | pending — reconcile with `atomica-web-components` or delete |
| `atomica-web-demo/` (near-empty shell) | `source/atomica-web-demo/` | pending — fold into `atomica-demo` or delete |
| Pre-pivot Solidity (`AuctionRegistry.sol`, `Governance.sol`) | `evm-contracts/src/` | pending — re-anchor to current architecture or archive |
| `AppSettings` not wired into demo app shell | `atomica-demo/src/App.tsx` | pending — add `AppSettings` to the demo UI |

---

## v1.0 — ZK double-verification

Goal: same validator honesty assumption as v0.1; add an independent ZK circuit that re-verifies auction clearing so validators cannot manipulate outcomes without detection.

| Capability | Owning module(s) under `source/` | Status |
|---|---|---|
| **ZK auction-clearing circuit** | `atomica-zkp/src/` | `missing` — `lib.rs` is 2 lines |
| **On-chain ZK verifier (Ethereum)** | `evm-contracts/src/` (new) | `missing` |
| **Dual-gate settlement (BLS + ZK must both agree)** | `evm-contracts/src/Settlement.sol` | `missing` |
| **On-chain bid-validity verification via ZK** | `atomica-zkp/src/` | `missing` |
| **MoveVM-independent ZK execution** | `atomica-zkp/` (isolated Rust) | `missing` |

---

## v2.0 — Cross-chain auctions with BitVM ratchet

**Blocked:** v2.0 is out of scope until the Ethereum ↔ Aptos settlement path (v0.1 Beta) is stable and well-tested in production.

Goal: Bitcoin support via BitVM + STARK proofs; multi-step ratchet for atomic cross-chain releases; extension to additional chains (Solana, etc.).

| Capability | Owning module(s) under `source/` | Status |
|---|---|---|
| **Bitcoin integration (BitVM)** | TBD | `missing` |
| **STARK proof generation** | `atomica-zkp/src/` (planned) | `missing` |
| **Multi-step atomic ratchet** | TBD | `missing` |
| **Multi-chain extension (Solana, etc.)** | TBD | `missing` |
| **Cross-chain trust via ratchet (no bridge liveness assumption)** | TBD | `missing` |
