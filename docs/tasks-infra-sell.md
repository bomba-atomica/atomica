# Infra Sell — Task List

**Worktree:** `infra/sell`
**Plan ref:** `source/atomica-web/docs/plans/sell-component-implementation.md`
**Last updated:** 2026-03-05

---

## Phase 1: Demo

Goal: All Move contracts compile and deploy. Full sell flow clickable. Adversarial resistance deferred.

### I-D1: Rewrite auction.move — Fungible Asset standard ✅

**File:** `source/atomica-move-contracts/sources/auction.move` (new file; `.broken` left untouched)

- [x] Create `auction.move` from scratch (do not edit `.broken`)
- [x] Remove all `aptos_framework::coin` / `Coin<T>` usage
- [x] Remove `use atomica::FAKEETH::FAKEETH` / `FAKEUSD::FAKEUSD` (modules don't exist)
- [x] Import `aptos_framework::object`, `aptos_framework::primary_fungible_store`
- [x] Import `atomica::fake_eth` and `atomica::fake_usd` for `get_metadata()`
- [x] Escrow via object-based primary stores + `ExtendRef` for settlement withdrawals
- [x] `create_auction(seller, amount, min_price, duration, mpk_bytes)` — withdraw FA from seller, store in Auction resource
- [x] `submit_bid(bidder, seller_addr, collateral_amount, bid_price)` — plaintext bid price, withdraw FakeUSD collateral
- [x] `settle(caller, seller_addr)` — after end_time, highest bidder wins all, refund losers
- [x] Keep `mpk` field in Auction struct (forward compat) but don't validate it
- [x] Single-seller model (`move_to(seller, Auction{...})`) — acceptable for Demo
- [x] View functions: `get_auction`, `get_bid_count`, `is_settled`, `auction_exists`
- [x] Error codes: `E_AUCTION_NOT_FOUND`, `E_AUCTION_ENDED`, `E_AUCTION_NOT_ENDED`, `E_BID_TOO_LOW`, `E_ALREADY_SETTLED`, `E_INSUFFICIENT_COLLATERAL`
- [x] `aptos move compile` — clean (41 tests pass)

### I-D2: Remove timelock dependency ✅

- [x] `auction.move` has NO reference to `atomica::timelock_encryption`
- [x] `auction.move` has NO reference to `aptos_framework::timelock`
- [x] `timelock_encryption.move.broken` not imported by any active module
- [x] Bids stored as plaintext `u64` price — no EncryptedMessage type

### I-D3: Fix signer authorization in lock_receipt ✅

**File:** `source/atomica-move-contracts/sources/lock_receipt.move`

- [x] Auth check unchanged — already accepts `signer == @atomica` as valid
- [x] Added explanatory comment: "Demo: admin signs on behalf of user. MVP must implement proper user-signer auth (I-M4)."
- [x] All 41 Move tests still pass

### I-D4: Update mint_from_lock docstrings ✅

**Files:** `source/atomica-move-contracts/sources/fake_eth.move`, `fake_usd.move`

- [x] Updated `fake_eth::mint_from_lock` docstring: "Used in Demo/MVP phases. Production may replace with receipt-direct-escrow (I-P4)."
- [x] Updated `fake_usd::mint_from_lock` docstring: same note
- [x] No functional code changes

### I-D5: Deploy all contracts + e2e tests

**Files:** New test files under `source/atomica-web/tests/meta/cross-chain/`

#### I-D5a: Verify deployment pipeline ✅

- [x] `auction.move` included in Aptos deployment (all modules deployed via `deployContracts`)
- [x] `lock_receipt::initialize<Ethereum, FakeETH>` called at deploy time (in `dual-chain-fixture.ts`)
- [x] `lock_receipt::initialize<Ethereum, FakeUSD>` called at deploy time
- [x] `fake_eth::initialize` called at deploy time
- [x] `fake_usd::initialize` called at deploy time
- [x] `auction` module deployed (no global init needed — per-seller)
- [x] `aptos move compile` passes clean

#### I-D5b: e2e-07 — Mint on Atomica ✅

**File:** `source/atomica-web/tests/meta/cross-chain/e2e-07-mint-on-atomica.test.ts`

- [x] Test file created using `DualChainFixture` + `setupDualChainFixture()`
- [x] Setup: mint FakeETH → lock in LockBox → generate proof → register lock (as deployer/admin)
- [x] Call `fake_eth::mint_from_lock(deployer, lock_id)` via Aptos transaction
- [x] Assert: `fake_eth::balance(deployer_address)` increased by expected amount
- [x] Assert: balance is proportional to locked wei (10^18 wei / 10^10 = 10^8 units, so 10 ETH → 1_000_000_000)
- [x] Assert: receipt status is `STATUS_CLAIMED` (1) after mint

#### I-D5c: e2e-08 — Create auction ✅

**File:** `source/atomica-web/tests/meta/cross-chain/e2e-08-create-auction.test.ts`

- [x] Test file created
- [x] Setup: runs e2e-07 setup flow to get FakeETH on Aptos
- [x] Call `auction::create_auction(seller, amount, min_price, duration, mpk_bytes)`
- [x] Assert: `auction::get_auction(seller_addr)` returns correct (seller, amount, min_price, 0 bids, not settled)
- [x] Assert: `auction::auction_exists(seller_addr)` == true
- [x] Assert: seller's FakeETH balance decreased by `amount`

#### I-D5d: e2e-09 — Bid and settle ✅

**File:** `source/atomica-web/tests/meta/cross-chain/e2e-09-bid-and-settle.test.ts`

- [x] Test file created
- [x] Setup: full e2e-08 setup + fresh bidder account funded with FakeUSD
- [x] Bidder calls `auction::submit_bid(seller_addr, collateral, bid_price)`
- [x] Wait 4s for 2s auction duration to expire
- [x] Call `auction::settle(seller_addr)`
- [x] Assert: winner received FakeETH
- [x] Assert: seller received FakeUSD at clearing price
- [x] Assert: bidder refunded excess collateral
- [x] Assert: `auction::is_settled(seller_addr)` == true

#### I-D5e: TypeScript type check ✅

- [x] `bun run build` — no new TypeScript errors from our files (pre-existing package errors only)

---

## Next Steps

- [ ] **Run `bun run test:meta`** end-to-end on live Docker testnet (requires Docker + ~20 min)
- [ ] Coordinate with UX agent on integration contract: confirm `auction::create_auction` signature matches payloads
- [ ] Review `EthEscrow`/`UsdEscrow` object addresses are deterministic (verify in e2e-09)

---

## Phase 2: MVP (deferred)

Tracked here for visibility; implementation begins after Demo DoD is met.

### I-M1: Validator-signed Ethereum state roots

- [ ] New module: `source/atomica-move-contracts/sources/ethereum_state.move`
- [ ] BLS threshold signature validation of Ethereum block headers
- [ ] 2/3+ validator quorum stored on-chain

### I-M2: State root validation in eth_proof.move

- [ ] `verify_and_extract` checks proof.state_root against latest validator-signed root
- [ ] Reject proofs with unattested state roots

### I-M3: Batch auction pool

- [ ] `AuctionPool` resource at `@atomica` (not per-seller)
- [ ] Multiple sellers per auction window
- [ ] Window alignment to daily UTC times (07:45, 16:15)

### I-M4: Proper signer authorization

- [ ] Replace admin-only workaround with user-signer-compatible auth
- [ ] Either SIWE derivation match or signed attestation from Ethereum key

### I-M5: 64-block confirmation requirement

- [ ] `register_ethereum_lock` rejects proofs from blocks with < 64 confirmations

---

## Phase 3: Production (deferred)

### I-P1: State proof oracle service

- [ ] Background service watching LockBox events
- [ ] Auto proof submission after finality

### I-P2: N-layer onion timelock encryption

- [ ] IBE integration in `auction.move`

### I-P3: Encrypted reserve price

- [ ] `encrypted_reserve` field in Auction struct

### I-P4: Receipt-direct-escrow (optional)

- [ ] Auction accepts `LockReceipt` instead of minted FA

---

## Demo Definition of Done

- [x] `aptos move compile` — clean
- [x] `aptos move test` — 41/41 tests pass
- [x] `auction.move` uses Fungible Assets (not legacy Coin)
- [x] `lock_receipt` auth allows `@atomica` admin signer (with MVP note)
- [x] `mint_from_lock` docstrings updated in fake_eth.move + fake_usd.move
- [x] All contracts deploy via fixture (auction module included)
- [x] e2e-07, e2e-08, e2e-09 test files written (await live testnet run)
- [ ] `bun run test:meta` — e2e-01 through e2e-09 all pass on live Docker testnet
