# Auction Engine Scout Findings

> Dev-scout pass for issue #106 — v0 Beta Auction Engine implementation seams.
>
> See the full scout report comment at:
> https://github.com/bomba-atomica/atomica/issues/106
>
> @see docs/architecture/v0-architecture.md §2 — Auction Mechanism (v0.1 Beta)

## Summary

The four entry functions in `auction.move` that remain scaffold stubs are:
- `create_auction` (implement in #107)
- `submit_cleartext_and_clear` (implement in #108)
- `clear_uniform_price` (implement in #109)
- `settle` (implement in #110)

`submit_bid` is **already implemented** and is not a scaffold abort.

## File Coupling by Entry Function

### `create_auction`

| File | Role |
|------|------|
| `source/atomica-move-contracts/sources/auction.move` | Body implementation, `AuctionRegistry` init, `WindowState` insert |
| `source/atomica-move-contracts/sources/lock_receipt.move` | `claim<Ethereum, FakeETH>()` to consume seller receipt |
| `source/atomica-sdk/src/aptos/payloads.ts` | `getCreateAuctionPayload`, `submitCreateAuction` (already updated) |
| `source/atomica-web-components/src/components/AuctionCreator.tsx` | `submitCreateAuction` call site (already updated) |

### `submit_cleartext_and_clear`

| File | Role |
|------|------|
| `source/atomica-move-contracts/sources/auction.move` | Body implementation: DK fetch, ciphertext verification, price storage |
| `source/atomica-move-contracts/sources/timelock.move` | `get_decryption_key(timelock_id)` — must be called here |
| `source/atomica-move-contracts/sources/timelock_config.move` | **Missing** `get_mpk()` and `is_revealed(timelock_id)` — must add |
| `source/atomica-sdk/src/aptos/payloads.ts` | `getSubmitCleartextPayload`, `isRevealed` (already wired, but on-chain target is wrong — see risk) |
| `source/atomica-web-components/src/components/AuctionRevealer.tsx` | Polls `isRevealed`, calls `submitCleartextAndClear` |

### `clear_uniform_price`

| File | Role |
|------|------|
| `source/atomica-move-contracts/sources/auction.move` | Body implementation: sort, accumulate, marginal price, partial fill |

No other module is directly required.

### `settle`

| File | Role |
|------|------|
| `source/atomica-move-contracts/sources/auction.move` | Body implementation: mark settled, emit `AuctionSettled` |
| `source/atomica-sdk/src/settlement/bridge.ts` | `queryAuctionSettledEvents` reads `AuctionSettled` events (scaffold — implements in #112) |
| `source/atomica-web-components/src/components/SettlementStatus.tsx` | Polls `queryAuctionSettledEvents` |
| `source/atomica-sdk/src/aptos/payloads.ts` | `getSettlePayload`, `submitSettle` (already updated) |

## Hot Files (≥2 entry functions or ≥2 packages)

| File | Heat | Risk |
|------|------|------|
| `auction.move` | ALL 4 entry functions | Highest coupling point. Any `WindowState` field addition ripples to ALL test helpers and view functions. |
| `lock_receipt.move` | `create_auction` (FakeETH) + `submit_bid` (FakeUSD, already live) | Both use `claim()`. Registry for FakeETH must be initialised before `create_auction` works. |
| `payloads.ts` | All 4 call sites | Already updated. `getMpk()` and `isRevealed()` call non-existent on-chain functions — see § Critical Risk. |
| `bridge.ts` | `settle` (AuctionSettled consumer) + `#112` (BLS relayer) | Event shape must match between Move `AuctionSettled` struct and `AuctionSettledEvent` TypeScript interface. |
| `AuctionBidder.tsx` | `submit_bid` (already live) | Imports `approveFakeUsd, lockFakeUsd`; sensitive to FakeUSD lockbox interface changes. |

## Critical Risk: Missing `get_mpk` and `is_revealed` in `timelock_config.move`

`source/atomica-sdk/src/aptos/payloads.ts` calls:

```typescript
// getMpk() calls: timelock_config::get_mpk — DOES NOT EXIST
// isRevealed() calls: timelock_config::is_revealed — DOES NOT EXIST
```

The functions that exist in `timelock.move`:
- `timelock::is_ibe_ready()` — IBE MPK set by DKG
- `timelock::is_timelock_expired(timelock_id)` — window deadline passed
- `timelock::get_decryption_key(timelock_id)` — DK once revealed

**Fix (in issue #108):** Add to `timelock_config.move`:
```move
#[view]
public fun get_mpk(): vector<u8> { /* delegate to ibe_config */ }

#[view]
public fun is_revealed(timelock_id: u64): bool { /* delegate to ibe_config */ }
```

Until these are added, `AuctionCreator.tsx` and `AuctionBidder.tsx` will throw on every load at "Fetching MPK from chain".

## Recommended Implementation Sequencing

```
#107 create_auction
  → #108 submit_cleartext_and_clear  (+ fix timelock_config missing views)
    → #109 clear_uniform_price
      → #110 settle
```

Rationale: auction lifecycle data dependency chain.
- Window must exist before cleartexts can be submitted.
- Revealed prices must be stored before clearing can run.
- Clearing price must be computed before settlement can emit `AuctionSettled`.

## Canonical Test Fixture for `clear_uniform_price`

From `auction_tests.move` constants:

```
SUPPLY_FIXTURE = 10u256         (10 ETH)
CLEARING_PRICE_FIXTURE = 2010

Bids (sorted descending):
  Alice:  price 2100, qty 4  → cumulative 4
  Bob:    price 2050, qty 3  → cumulative 7
  Carol:  price 2010, qty 5  → cumulative 12 > 10  → partial fill 3
  Dave:   price 1980, qty 2  → does not win, collateral refundable

Clearing price = 2010
Winners: Alice (4), Bob (3), Carol (3 partial fill)
```

The `#109` implementor must produce `clearing_price == 2010` for this fixture.

## Test Results

`aptos move test` at the time of this scout: **70 passed, 0 failed**. No source or test files were modified during this scout pass.
