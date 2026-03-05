# Infra Sell — Task List

**Worktree:** `infra/sell`
**Plan ref:** `docs/plans/sell-component-implementation.md`
**Last updated:** 2026-03-05

---

## Architectural Clarification (applied retroactively)

FakeETH and FakeUSD are **ERC20 tokens that exist only on Ethereum**.
On Aptos, a lock is represented by a `LockReceipt<Ethereum, FakeETH>` in the ReceiptRegistry.
`fake_eth::mint` and `fake_eth::mint_from_lock` are both deprecated — no FA for these tokens on Aptos.

The correct Demo flow is:
```
Lock FakeETH on Ethereum
  → register_ethereum_lock<FakeETH>  → LockReceipt<Ethereum, FakeETH>
  → auction::create_auction(lock_id) → claims receipt, opens auction
  → submit_bid(seller_addr, price)   → Demo: no Aptos-side collateral
  → settle(seller_addr)              → records winner + clearing price, emits AuctionSettled
  → [Ethereum settlement contract reads AuctionSettled event and transfers assets]
```

---

## Phase 1: Demo

### I-D1: auction.move — receipt-based, FA-free ✅

**File:** `source/atomica-move-contracts/sources/auction.move`

- [x] `create_auction(seller, lock_id, min_price, duration, mpk_bytes)` — calls `lock_receipt::claim<Ethereum, FakeETH>` to consume receipt, stores amount (wei)
- [x] `submit_bid(bidder, seller_addr, bid_price)` — Demo: no Aptos-side collateral
- [x] `settle(caller, seller_addr)` — finds highest bid, records winner + clearing_price, emits `AuctionSettled`
- [x] `AuctionSettled` event: seller, winner, amount, clearing_price, lock_id
- [x] View functions: `get_auction`, `get_bid_count`, `is_settled`, `auction_exists`, `get_settlement`
- [x] No FA imports (`primary_fungible_store`, `fake_eth`, `fake_usd` all removed)
- [x] No object-based escrow (not needed — receipts are the collateral)
- [x] `aptos move compile` — clean; `aptos move test` — 41/41 pass

### I-D2: No timelock dependency ✅

- [x] `auction.move` has no reference to `timelock_encryption` or `aptos_framework::timelock`

### I-D3: Signer auth comment in lock_receipt ✅

- [x] Comment documents Demo admin-signer workaround; defers SIWE-derived auth to I-M4

### I-D4: Docstrings clarified in fake_eth / fake_usd ✅

- [x] `mint_from_lock` docstrings note it is deprecated canonical path

### I-D5: Plan corrected — receipt-direct-escrow is the correct Demo path ✅

- [x] `docs/plans/sell-component-implementation.md` updated: removed "Decision for Demo: keep mint_from_lock"
- [x] Added correct description: auction.move consumes LockReceipts, no FA minting
- [x] Demo integration contract table updated: removed `fake_eth::mint_from_lock` row

### I-D6: e2e tests — canonical receipt-based flow ✅

All three tests follow the correct architecture (no mint_from_lock step):

- [x] `e2e-07-create-auction-from-receipt.test.ts` — lock ETH → register proof → `create_auction(lock_id)` → assert receipt STATUS_CLAIMED + auction stored with correct wei amount
- [x] `e2e-08-bid-on-auction.test.ts` — submit bids above/at/below min_price; assert bid count and rejection
- [x] `e2e-09-settle-auction.test.ts` — short-duration auction, bid, wait, settle; assert winner + clearing_price; assert double-settle rejected

Old incorrect tests deleted: `e2e-07-mint-on-atomica.test.ts`, `e2e-08-create-auction.test.ts`, `e2e-09-bid-and-settle.test.ts`

---

## Next: I-D7 — Move unit tests for auction.move

**File:** `source/atomica-move-contracts/sources/auction_tests.move`

The auction module has no Move-level unit tests yet. These run offline (no Docker needed)
and will catch logic bugs before the expensive meta test suite runs.

- [ ] Test setup helper: initialize fake_eth registry + mint ETH into a test LockReceipt
- [ ] `test_create_auction` — creates auction, verifies Auction resource at seller, receipt claimed
- [ ] `test_submit_bid_accepted` — bid >= min_price accepted, bid_count increases
- [ ] `test_submit_bid_rejected_too_low` — bid < min_price aborts with E_BID_TOO_LOW
- [ ] `test_bid_after_end_time_fails` — bid after expiry aborts with E_AUCTION_ENDED
- [ ] `test_settle_with_winner` — highest bid wins, AuctionSettled event emitted
- [ ] `test_settle_no_valid_bids` — all bids below min_price → winner == @0x0, clearing_price == 0
- [ ] `test_double_settle_fails` — second settle aborts with E_ALREADY_SETTLED
- [ ] `test_settle_before_end_time_fails` — settle too early aborts with E_AUCTION_NOT_ENDED
- [ ] `aptos move test` — all tests pass

---

## I-D8: Run full meta test suite

- [ ] `bun run test:meta` — e2e-01 through e2e-09 all pass on live Docker testnet
- [ ] Fix any failures in e2e-07/08/09

---

## Phase 2: MVP (deferred — begins after Demo DoD)

### I-M1: Validator-signed Ethereum state roots
- [ ] New module: `ethereum_state.move` — BLS threshold sig validation of Ethereum block headers

### I-M2: State root validation in eth_proof.move
- [ ] `verify_and_extract` checks proof.state_root against validator-signed root on-chain

### I-M3: Batch auction pool
- [ ] `AuctionPool` at `@atomica` — multiple sellers per window; twice-daily UTC alignment

### I-M4: Proper signer authorization
- [ ] User self-signs `register_ethereum_lock` (SIWE-derived address or signed attestation)

### I-M5: Bidder collateral via FakeUSD LockReceipt
- [ ] `submit_bid` requires a `FakeUSD` lock_id; claims it as collateral
- [ ] Settlement records USD clearing separately from ETH receipt

### I-M6: 64-block confirmation requirement
- [ ] `register_ethereum_lock` rejects proofs from blocks with < 64 confirmations

---

## Phase 3: Production (deferred)

- [ ] I-P1: State proof oracle service
- [ ] I-P2: N-layer onion timelock encryption in auction.move
- [ ] I-P3: Encrypted reserve price
- [ ] I-P4: Ethereum settlement contract reads AuctionSettled events

---

## Demo Definition of Done

- [x] `aptos move compile` — clean
- [x] `aptos move test` — 41/41 existing tests pass
- [x] `auction.move` uses LockReceipts (not FA, not legacy Coin)
- [x] `lock_receipt` auth allows `@atomica` admin signer (with MVP note)
- [x] Plan corrected: no mint_from_lock step in canonical flow
- [x] e2e-07/08/09 test files written (canonical receipt-based flow)
- [ ] `auction_tests.move` — Move unit tests for auction.move (I-D7)
- [ ] `bun run test:meta` — e2e-01 through e2e-09 all pass (I-D8)
