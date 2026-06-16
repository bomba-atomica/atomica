# Atomica v0.1 Beta — Implementation Plan

## Goal

Ship the remaining v0.1 Beta work: implement the auction engine stubs in Move,
wire the off-chain BLS relayer that bridges Aptos settlement events to Ethereum,
and connect the existing scaffold UI components to real on-chain data. Finish
with a codebase cleanup pass that removes dead packages and pre-pivot contracts.

See [`docs/roadmap.md`](roadmap.md) for capability-level status and
[`docs/specifications/prd.md`](specifications/prd.md) for product requirements.
See [`docs/architecture/v0-architecture.md`](architecture/v0-architecture.md)
for the exact Move signatures, clearing algorithm, and settlement flow this
phase implements.

## Non-goals

- Real BLS multi-sig verification (EIP-2537 / Pectra); v0.1 testnet uses the
  trusted-relayer path already implemented in `BLSVerifierTestnet.sol`.
- ZK proof verification (v1.0 scope).
- Bitcoin / BitVM support (v2.0 scope).
- Production validator DKG for IBE key release; v0.1 uses the Aptos framework
  `ibe_config` stub.

---

## Phase 1 — Auction Engine (Move)

Goal: implement the four `E_NOT_IMPLEMENTED` entry functions in `auction.move`
so that the complete auction lifecycle runs end-to-end on the Aptos testnet.

- [ ] dev-scout — map coupling and risk across the four scaffold entry functions before implementation starts
- [ ] Implement `create_auction` — register a global-registry auction for `(window_id, pair)`, enforce window-ID alignment with `current_window_id()`, store seller `LockReceipt` reference and `min_price`
- [ ] Implement sealed-bid reveal path — `submit_cleartext_and_clear`: verify each cleartext against stored `(u_bytes, ciphertext)` via `timelock_config::get_decryption_key`, store revealed prices index-aligned to bids
- [ ] Implement `clear_uniform_price` — sort revealed bids descending, accumulate quantity to supply, compute marginal clearing price, mark winning/losing bids, apply partial fill to the marginal bidder
- [ ] Implement Move-side `settle` — distribute FakeUSD proceeds to seller, release losing collateral receipts, apply `compute_rebates` fee/rebate, emit `AuctionSettled` event

---

## Phase 2 — Settlement Bridge

Goal: wire the off-chain relayer that reads `AuctionSettled` events from Aptos
and calls `BLSVerifierTestnet.authorizeSettlement` on Ethereum, then connect
the scaffold UI components to real on-chain data.

- [ ] dev-scout — map event schema, relayer entry points in `bridge.ts`, and UI wiring seams before implementation
- [ ] Implement BLS relayer service — implement `queryAuctionSettledEvents`, `submitSettlement`, and `releaseBidderCollateral` in `atomica-sdk/src/settlement/bridge.ts`; add a runnable relayer script to `atomica-demo`
- [ ] Wire settlement UI — connect `SettlementStatus` and `WithdrawWinnings` components to the live relayer; remove "bridge scaffold" notices; wire `withdrawWinnings` call through to `Settlement.sol`
- [ ] Wire fee-rebate UI — replace stub data in `useFeeRebate` with real on-chain rebate values from settled auctions; wire `FeeRebateDisplay` to live data

---

## Phase 3 — Codebase Cleanup

Goal: remove packages and contracts that are not part of the live flow before
any further feature work lands.

- [ ] Remove dead shell packages — delete `source/atomica-web/` and `source/atomica-web-demo/`; migrate any remaining integration-test configuration into `atomica-demo`
- [ ] Archive pre-pivot Solidity — remove or archive `AuctionRegistry.sol` and `Governance.sol` from `evm-contracts/src/`
- [ ] Wire `AppSettings` into demo app — add `AppSettings` to `atomica-demo/src/App.tsx` shell
