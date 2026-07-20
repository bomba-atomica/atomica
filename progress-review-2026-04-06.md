# Atomica Progress Review — 2026-04-06

Branch reviewed: `main` @ d290633 (synced with origin).
Sources: `docs/specifications/prd.md`, `docs/plans/implementation-plan.md`, code under `source/`.

## 1. Product, in one paragraph

Per the PRD, Atomica is a cross-chain, sealed-bid, uniform-price **batch auction** running twice daily. Native assets are locked on their home chain (no bridges/wrapped tokens), bids are sealed via **N-layer timelock IBE**, the auction clears via **uniform price**, settlement is verified by **BLS validators (v0.1)** and later **ZK proofs (v1)**, and fees follow a **deal-breaker → deal-maker** distance-to-clearing rebate, with zero operator fees on BTC/ETH. v0.1 Beta scope = working trustless cross-chain auction with BLS-only settlement, ETH ↔ Aptos as the first chain pair.

## 2. What exists today

### Move contracts (`source/atomica-move-contracts/sources/`)
- `lock_receipt.move` (476 LOC) — typed `LockReceipt<Chain, Token>` registry, claim/double-spend protection, receipt counts. Solid.
- `eth_proof.move`, `mpt.move`, `rlp.move` — Ethereum state-proof verification primitives with tests.
- `fake_eth.move`, `fake_usd.move` — bridged-asset mints via `mint_from_lock()`.
- `auction.move` (249 LOC) — **Demo-phase rewrite**, lives at the seller's address, single auction per address, plaintext bids, no Aptos-side bidder collateral, MPK stored but unused, `settle()` picks highest bid (NOT uniform-price), emits `AuctionSettled` event.
- `timelock.move` (72 LOC) + `timelock_config.move` (181 LOC) — Phase 0 IBE/DKG scaffolding from #37.
- `registry.move` (46 LOC) — minimal.
- `auction.move.broken` — original FA-based auction still parked in tree.

### EVM contracts (`source/evm-contracts/src/`)
- `tokens/FakeETH.sol`, `tokens/FakeUSD.sol`, `escrow/LockBox.sol` — deployed and exercised by E2E.
- `Settlement.sol` (236), `BLSVerifier.sol` (257), `DepositBox.sol` (521), `AuctionManager.sol` (169), `AuctionRegistry.sol` (282), `Governance.sol` (349) — present, but **not wired into the live web flow**. Settlement still references the older "DepositTypes / DepositBox" architecture.
- No `BLSVerifierTestnet.sol` (Phase 4b deliverable from the plan).

### Web app
There are now **three** webapp packages:
- `source/atomica-web/` — slimmed down: only `lib/ethereum/*`, `lib/network-*`, `views/{MainView,SettingsView}`, three contexts. **No components, no Aptos lib, no auction UI.** Appears to be a stripped shell.
- `source/atomica-web-ui/` — the real component library: `SellFlow` (8 steps Connect→Lock→Confirm→Proof→Submit→Mint→Auction→Monitor), `AuctionCreator`, `AuctionBidder`, `SettleButton`, `ClaimButton`, `BidHistory`, `FeeRebateDisplay`, `Faucet`, `PoolStatus`, `AuctionCountdown`, `NetworkStatus`, `ContractStatus`, `TestnetSelector`, hooks for `useSellFlow`, `useBidHistory`, `useFeeRebate`, `useAuctionPoolTotals`, `usePoolEvents`, `useDualChainBalances`-equivalents.
- `source/atomica-web-demo/` — appears to be a near-empty shell (`App.tsx`, `main.tsx`, debug helpers only).

### Cryptography & proofs
- `source/atomica-zkp/` — Cargo project with tests (`equivalence.rs`, `solidity_verifier.rs`) and benchmark scaffold but `src/lib.rs` is **2 lines** (empty). Not a real ZK circuit yet.
- `source/state-proofs/` — TypeScript-only directory.
- IBE: `usePoolEvents`, `AuctionBidder`, `AuctionCreator` reference IBE; #69 ("replace placeholder XOR encryption with real Boneh-Franklin IBE") landed, so client-side IBE is no longer a stub.

### Tests
- `source/atomica-web/tests/{integration,meta,ui-component,fixtures}` and `source/atomica-web-ui/tests/*` — the recent commit wave (#50–#76) added a deterministic `window.ethereum` fixture, dual-chain browser fixture, data-testid contract, browser integration suites for faucet/wallet, ERC-20 approve/lock/proof, auction create/bid/settle, claim/reclaim/fees/bid history, and a full happy-path E2E driving the real hooks/UI.
- Move side: `auction_tests.move`, `lock_receipt_tests.move`, `mpt_tests.move`, `rlp_tests.move`, `eth_proof_tests.move`, `integration_tests.move`. `fake_*_tests.move.skip` are parked.

## 3. PRD features still missing or stubbed

| PRD capability | State | Gap |
|---|---|---|
| **Uniform-price clearing** | ❌ | `auction.move::settle` picks the *single highest* bid. The plan's "sort desc, accumulate to supply, pay marginal price" is unimplemented. This is a core PRD claim. |
| **Sealed bids (IBE timelock)** | 🟡 | Client-side BF-IBE landed (#69) and Move-side `timelock`/`timelock_config` scaffolding exists, but `auction.move` still stores **plaintext** `bid_price`. No `submit_cleartext_and_clear` reveal path on-chain. MPK stored but unverified. |
| **N-layer onion (validators + sellers)** | ❌ | Only single-layer IBE scaffolding. Seller-DKG layer absent. |
| **Twice-daily fixed auction windows (07:45 / 16:15 UTC)** | ❌ | Auctions are per-seller with caller-supplied `duration`. No global batch window, no "all pairs clear simultaneously". |
| **Multi-asset / multi-pair clearing** | ❌ | Auction is hard-typed to `Ethereum, FakeETH` and one seller per address. |
| **Distance-to-clearing fee rebates** | 🟡 | `FeeRebateDisplay` + `useFeeRebate` exist on the UI, but with no uniform-price or rebate curve on-chain there is nothing real to rebate against. |
| **Cross-chain settlement back to Ethereum** | ❌ | `auction.move::settle` only emits an event; `Settlement.sol` exists but is **not wired**, no relayer, no `BLSVerifierTestnet.sol`, no `WithdrawWinnings`. Plan Phase 4b is unstarted. |
| **Bidder collateral** | ❌ | Demo explicitly skips Aptos-side bidder collateral. PRD requires assets actually committed. |
| **BLS validator set + threshold signing on settlement merkle root** | ❌ | `BLSVerifier.sol` exists in evm-contracts but isn't reachable from the live flow; no validator binary. |
| **ZK auction verification (v1)** | ❌ | `atomica-zkp/src/lib.rs` is empty. |
| **Account abstraction / SIWE → Aptos** | ✅ | Implemented in `lib/aptos/siwe.ts`. |
| **App config / settings UI (Phase 1.5)** | 🟡 | `SettingsView`, `TestnetSelector`, `ContractStatus`, network-config context all exist; the broader "centralized app state with reducer/store + persistence/versioning" is partial. |
| **`it.todo()` cleanup in integration tests** | 🟡 | Some still around. |
| **Dead code removal** | ❌ | `auction.move.broken` still in source tree. Vestigial Aptos-side fake-token mint payloads still around per plan notes. |

## 4. Engineering work that emerged but is not in the PRD/plan

Things built that the spec did not call out:

- **Three parallel webapp packages** (`atomica-web`, `atomica-web-ui`, `atomica-web-demo`) where the plan describes one. `atomica-web` has been gutted of components; `atomica-web-ui` is the real implementation; `atomica-web-demo` looks like an unfinished new shell. This is undocumented architectural drift.
- **`SellFlow` 8-step wizard** — much more elaborate than the plan's "wire `CrossChainDeposit` + `AuctionCreator`" item. Adds an opinionated step-machine, `StepIndicator`, resume tests, error tests. Useful, but a UX surface area the PRD never asked for.
- **`useSellFlow`, `usePoolEvents`, `useAuctionPoolTotals`, `useFeeRebate`, `useBidHistory`** — non-trivial hook layer that grew organically. Partially shadows the "centralized app state" Phase 1.5 work without finishing it.
- **`BidHistory` component + on-chain event indexing** (#74, #71) — good idea, not in PRD/plan.
- **`FeeRebateDisplay`** wired to "real settlement data" (#72) — speculative: there is no real distance-to-clearing computation on-chain to drive it.
- **Deterministic `window.ethereum` browser test fixture, dual-chain browser fixture, data-testid selector contract** (#50–#52) — substantial test-infra investment beyond the plan's "Phase 5 E2E test".
- **`docker-testnet/`** package (referenced by recent fix commit) — testnet harness work not in PRD.
- **Move-side `registry.move`, `integration_tests.move`** — auxiliary modules introduced during implementation.
- **`DepositBox.sol` (521 LOC), `AuctionManager.sol`, `AuctionRegistry.sol`, `Governance.sol`** — large EVM surface that is not referenced by the live flow. Most of this looks like an earlier architecture that was superseded by the "lock receipt + Aptos auction" model but never deleted.
- **Browser-extension compatibility spike for MetaMask 12.x** (#48/#49) — research output, no PRD anchor.
- **`ClaimButton`** (#73) — Demo-phase payout. Useful, but its lifetime is bounded by the eventual real cross-chain settlement.

## 5. Code that is extraneous to the product

Candidates for deletion or explicit deprecation:

1. **`source/atomica-move-contracts/sources/auction.move.broken`** — old FA-based auction. Either resurrect it as the uniform-price implementation or delete.
2. **`source/atomica-web/src/`** — appears to be a stripped shell with no UI. If `atomica-web-ui` is the canonical app, delete `atomica-web` (or vice versa). Maintaining both is the source of most CLAUDE.md/plan/source skew.
3. **`source/atomica-web-demo/`** — currently just `App.tsx` + debug helpers. Either fold into one of the others or remove.
4. **`source/evm-contracts/src/{AuctionManager,AuctionRegistry,Governance,DepositBox}.sol`** — large pre-pivot Solidity surface that the current Aptos-centric flow does not touch. Either re-anchor them to the new architecture or archive.
5. **`source/evm-contracts/src/MinimalTest.sol`** — name suggests scratch.
6. **`source/atomica-zkp/`** — keep the directory if v1 ZK is on the roadmap, but the empty `lib.rs` plus benchmark/test scaffolding gives a misleading impression of progress. Either fill it or move to `docs/archived/`.
7. **`source/landing-page/`** — vanilla JS/HTML/CSS landing page. Fine to keep, but it lives outside the build graph and nothing links to it.
8. **Vestigial Aptos-side `getMintFakeEthPayload()` / `getMintFakeUsdPayload()`** in `lib/aptos/payloads.ts` — kept "for compatibility" but the architectural decision is that fake tokens are minted on Ethereum. Delete.
9. **`fake_eth_tests.move.skip`, `fake_usd_tests.move.skip`** — either fix or delete.
10. **`docs/implementation-status.md`** — explicitly marks itself as a stale February snapshot. Move to `docs/archived/`.

## 6. Suggested re-priorities

In rough order of leverage for v0.1 Beta:

1. **Pick one webapp.** Delete the other two (or merge). The current three-package state is the largest single source of confusion.
2. **Rewrite `auction.move::settle` as a real uniform-price clearing** with sorted bids, marginal-price computation, and partial fills. Without this, the protocol does not implement what the PRD claims.
3. **Wire IBE end-to-end:** plaintext `bid_price` field in `Bid` should become `(u_bytes, ciphertext)`, with a `submit_cleartext_and_clear` reveal path that consults `timelock_config`. The Move scaffolding from #37 and the BF-IBE client from #69 can finally meet.
4. **Global auction windows.** Replace per-seller `Auction has key` with a global auction registry keyed by `(auction_window_id, pair)` so that "all pairs clear simultaneously at 07:45 / 16:15 UTC" is even expressible. Single seller per address is a Demo-phase wart that will block multi-pair work.
5. **Cross-chain settlement back to Ethereum (Plan Phase 4b)**: BLS-trusted-relayer `BLSVerifierTestnet.sol`, `lib/settlement/bridge.ts`, `WithdrawWinnings`. Until this exists, the protocol is one-sided.
6. **Bidder collateral via FakeUSD `LockReceipt`.** Without it, the auction is not economically meaningful.
7. **Distance-to-clearing rebate math** on-chain so `FeeRebateDisplay` is connected to real numbers, not stubbed input.
8. **Delete or archive** the items in §5 to make the roadmap legible to the next agent.
9. **Refresh `docs/plans/implementation-plan.md`** — Phase 1 is done, Phase 2 is partly done in a Demo-shaped way, Phase 3 is partly done, Phase 4 is unstarted. The current plan doc was last updated 2026-03-02 and predates 13+ merged PRs.
10. **Finish Phase 1.5 centralized app state** or formally drop it; the current half-done version is what spawned the parallel webapp packages.

## 7. Bottom line

- **Solid foundation:** lock-receipt → state-proof → bridged mint pipeline is real and tested end-to-end. SIWE/Aptos account abstraction works. Test infrastructure is unusually mature for this stage.
- **Demo-shaped middle:** the auction itself is a single-seller, plaintext, highest-bid placeholder that does not yet implement uniform-price, sealed bids, batch windows, or multi-pair — i.e. none of the PRD's headline claims about the auction mechanism.
- **Empty right edge:** cross-chain settlement back to Ethereum, BLS validator path, and ZK verification are essentially unstarted.
- **Drift:** three webapp packages, an empty ZK crate, and a large pre-pivot Solidity surface that the live flow ignores — all of which should be reconciled before more features are added.
