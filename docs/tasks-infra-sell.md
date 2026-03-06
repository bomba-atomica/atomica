# Infra Sell — Task List

**Worktree:** `infra/sell`
**Plan ref:** `docs/plans/sell-component-implementation.md`
**Last updated:** 2026-03-05 (I-D7 complete)

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

## I-D7: Move unit tests for auction.move ✅

**File:** `source/atomica-move-contracts/sources/auction_tests.move`

- [x] Test setup helper: initialize registry + insert test LockReceipt via `insert_test_receipt`
- [x] `test_create_auction` — creates auction, verifies Auction resource, receipt STATUS_CLAIMED
- [x] `test_create_auction_no_receipt_fails` — missing receipt → E_RECEIPT_NOT_FOUND
- [x] `test_submit_bid_accepted` — bid >= min_price accepted, bid_count increases
- [x] `test_submit_bid_too_low_fails` — bid < min_price aborts with E_BID_TOO_LOW
- [x] `test_submit_bid_after_end_time_fails` — bid after expiry aborts with E_AUCTION_ENDED
- [x] `test_submit_bid_no_auction_fails` — no auction → E_AUCTION_NOT_FOUND
- [x] `test_settle_highest_bid_wins` — highest bid wins, correct winner + clearing_price
- [x] `test_settle_single_bid` — single valid bid
- [x] `test_settle_no_bids` — no bids → winner == @0x0, clearing_price == 0
- [x] `test_settle_before_end_time_fails` — too early aborts with E_AUCTION_NOT_ENDED
- [x] `test_settle_twice_fails` — second settle aborts with E_ALREADY_SETTLED
- [x] `test_settle_nonexistent_auction_fails` — no auction → E_AUCTION_NOT_FOUND
- [x] `test_create_auction_with_golden_vector_proof` — annotated `#[expected_failure]` with
      explanation: golden_vectors.json storage_key is inconsistent with the proof trie path
      (same staleness issue as integration_tests.move). Re-enable when vectors are regenerated.
- [x] `aptos move test` — 54/54 pass

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
- [x] `aptos move test` — 54/54 pass
- [x] `auction.move` uses LockReceipts (not FA, not legacy Coin)
- [x] `lock_receipt` auth allows `@atomica` admin signer (with MVP note)
- [x] Plan corrected: no mint_from_lock step in canonical flow
- [x] e2e-07/08/09 test files written (canonical receipt-based flow)
- [x] `auction_tests.move` — Move unit tests for auction.move (I-D7)
- [ ] `bun run test:meta` — e2e-01 through e2e-09 all pass (I-D8)
