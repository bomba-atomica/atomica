# Atomica v0 Architecture

This document is the single authoritative reference for three interconnected
decisions: the target package layout, the v0.1 auction mechanism, and the v0.1
cross-chain settlement flow. Later phases extend, not replace, this foundation.

---

## §1 — Package Layout

### 1.1 Package structure

The codebase has three packages:

| Package | Role | React? |
|---|---|---|
| `atomica-web-components` | Reusable React UI components | Yes |
| `atomica-sdk` | Headless, zero-React business logic | No |
| `atomica-demo` | Demo app, scripts, and orchestration shell | Yes (consumer only) |

**Dependency rules:**
- `atomica-web-components` → `atomica-sdk` ✓
- `atomica-demo` → `atomica-web-components` and `atomica-sdk` ✓
- `atomica-sdk` must have zero React imports and must not import
  `atomica-web-components`. The pre-push hook checks both (§1.3). No CI job
  checks them.
- No package may import from `atomica-demo`

### 1.2 Renames (done)

| Old package | Package now | Change |
|---|---|---|
| `source/atomica-web-ui` | `atomica-web-components` | Renamed in place |
| `source/atomica-web-demo` | `atomica-demo` | Renamed in place |
| `source/atomica-web` | (deleted) | Deleted; its integration-test harness moved to `atomica-demo` |
| `source/atomica-sdk` | `atomica-sdk` | Extended in place, no rename |

### 1.3 Boundary check

The pre-push hook (`.githooks/pre-push`, installed with
`scripts/install-hooks.sh`) fails a code push when any file under
`source/atomica-sdk/src` imports `react`, `react-dom` or
`@atomica/atomica-web-components`. It is a local hook only: no GitHub Actions
job runs this check.

---

## §2 — Auction Mechanism (v0.1 Beta)

This section describes `source/atomica-move-contracts/sources/auction.move` as
built on `main`. Its code blocks match the Move structs and entry signatures.

### 2.1 Auction windows

<!-- SCOUT(#231) DOC: "A single epoch lasts 12 hours" is the window period, not the chain epoch; pick another word once the chain epoch ends are fixed. -->

Two global windows close per day, anchored to UTC. A window runs from the
previous close up to its own close:

| Window | Opens | Closes |
|---|---|---|
| Morning (even id) | 16:15 UTC the day before | 07:45 UTC |
| Afternoon (odd id) | 07:45 UTC | 16:15 UTC |

All auctions within a window share the same `auction_window_id`. A day lasts
86 400 seconds. The morning close is 27 900 s into the UTC day
(07:45 = 7×3600 + 45×60); the afternoon close is 58 500 s into it
(16:15 = 16×3600 + 15×60). Midnight is not a boundary.

### 2.2 Window ID formula

```
day               = unix_seconds / 86400          // integer division
t                 = unix_seconds % 86400
auction_window_id = day * 2 + (t >= 27900 ? 1 : 0) + (t >= 58500 ? 1 : 0)

close(w)          = (w / 2) * 86400 + (w even ? 27900 : 58500)
```

`close(w)` is the first second of window `w + 1`. Implemented on-chain in
`eth_proof::window_id_at` and `eth_proof::window_close_secs`, and read with
`timestamp::now_seconds()`:

```move
public fun current_window_id(): u64 {
    eth_proof::window_id_at(timestamp::now_seconds())
}

public fun window_id_at(secs: u64): u64 {
    let day = secs / 86400;
    let t = secs % 86400;
    let id = day * 2;
    if (t >= 27900) { id = id + 1 };
    if (t >= 58500) { id = id + 1 };
    id
}
```

The SDK mirror is `currentWindowId` and `windowCloseSecs` in
`source/atomica-sdk/src/ethereum/lock-binding.ts`.

The formula above is the production window schedule. `eth_proof` reads the
schedule in force from `WindowSchedule { day_secs, close_offsets_secs }` at
`@atomica`; while none is stored it is `day_secs = 86400`,
`close_offsets_secs = [27900, 58500]`. With `n` closes a day,
`close(w) = (w / n) * day_secs + close_offsets_secs[w % n]`, and the window id
is `day * n` plus the number of offsets at or before `t`. The view
`eth_proof::get_window_schedule` returns it. `eth_proof::set_window_schedule`
stores another schedule only on a test chain: the signer must be `@atomica`
(`E_NOT_ADMIN`), the chain id must be 4 (`E_NOT_TEST_CHAIN`), no schedule may be
stored yet (`E_SCHEDULE_ALREADY_SET`), and there must be one or two strictly
increasing offsets, the first above 0 and the last at most `day_secs`
(`E_INVALID_SCHEDULE`). A production chain therefore always closes at 07:45 and
16:15 UTC. The docker testnet stores `900:900`, one close every 15 minutes, when
`ATOMICA_TEST_WINDOW_SCHEDULE` is set. The SDK functions take the same schedule
as an optional argument.

The window timelock deadline is the window close. The first `create_auction`
of a window id registers the timelock with deadline `close(w) * 1_000_000`
microseconds (section 2.3). `submit_bid` accepts a bid only while that timelock
is `Pending` and strictly before its deadline, which binds every bid to the
window clock.

The window ID monotonically increases. `create_auction` accepts only the
current or the next window id (`E_STALE_WINDOW_ID`). `submit_bid` never reads
the clock window id: it checks only the window timelock status and deadline,
as above.

### 2.3 AuctionRegistry

The registry is keyed by `(auction_window_id, pair)`, not by seller address.
Multiple sellers offering the same pair in the same window contribute supply
to the same clearing pool.

`create_auction(seller, window_id, pair_bcs, lock_id)` takes no timelock id.
The package holds a timelock registrar: a named object at
`object::create_object_address(&@atomica, b"atomica/timelock-registrar")`
(view `auction::timelock_registrar_address`) whose `ExtendRef` only the
`auction` module can sign with. Genesis names that address as the framework's
`timelock_registrar`, so `0x1::ibe_config` lets no other signer register a
timelock (`E_NOT_REGISTRAR`, 17). The first `create_auction` of a window id
registers one timelock through `ibe_config::register_timelock_with_id`, with
deadline `eth_proof::window_close_secs(window_id) * 1_000_000`, and stores its
id in `TimelockRegistrar.window_timelocks`. Every later seller of that window
id joins the stored timelock, for any pair. A window id gets one timelock, ever.
When it is no longer `Pending` or its deadline has passed, a new seller aborts
and no second timelock is registered. The framework still checks the
registration: it aborts when the epoch has no key (`E_IBE_NOT_READY`) or when
the close is later than 15 minutes before the epoch end
(`E_DEADLINE_AFTER_EPOCH_END`, 9). The views `auction::window_timelock` and
`auction::window_deadline_us` return the id and the deadline of a window id.

A window can exist only for a pair on the allowlist. `PairAllowlist` at
`@atomica` maps pair bytes to a `Pair`, and `init_module` seeds it with the
launch pair (section 2.4). `create_auction` aborts with `E_PAIR_NOT_ALLOWED`
(42) when `pair_bcs` is not listed. The check runs right after the window id
checks. A new window stores the `Pair` the allowlist holds for those bytes.
Only the package account adds a pair, through `allow_pair` (otherwise
`E_NOT_PACKAGE_ACCOUNT`, 43), and the contract computes the key as the BCS of
the `Pair`. The views are `is_pair_allowed(pair_bcs)` and `launch_pair_bcs()`.
Entries that find a window by `(window_id, pair_bcs)` abort with
`E_AUCTION_NOT_FOUND` (1) for unlisted bytes, since no window exists for them.

**Seller limits (issue 218).** A window holds at most
`MAX_SELLER_LOCKS_PER_WINDOW` = 100 seller locks. `create_auction` aborts with
`E_SELLER_LOCKS_FULL` (39) when a seller joins a window that already holds 100.
Each seller lock must be at least `MIN_SELLER_LOCK_AMOUNT` = 0.01 FakeETH
(`10_000_000_000_000_000` wei), or `create_auction` aborts with
`E_SELLER_LOCK_TOO_SMALL` (40). Settle, refund and unwind loop over every
seller lock, so the cap keeps one window finishable in one transaction. The
view `get_window_limits()` returns `(max bids, max seller locks, min seller
lock amount, min bid collateral)`, and the SDK reads it with
`getWindowLimits()`. LockBox on Ethereum accepts any nonzero amount: a lock
Aptos refuses waits for its reclaim deadline. The UI reads the limits and the
window's fill before it locks, and refuses a lock Aptos would refuse. That
check is advisory, since a window can fill between the check and the lock.

A window has no reserve price at launch. `create_auction` takes no minimum
price, and `WindowState` stores none: clearing alone sets the price, as the PRD
MVP scope states ("No reserve prices at launch").

```move
struct AuctionRegistry has key {
    // key: BCS-encoded (auction_window_id: u64, pair: Pair)
    windows: Table<vector<u8>, WindowState>,
}

struct WindowState has store {
    pair:             Pair,
    window_id:        u64,
    timelock_id:      u64,                 // the window id's one timelock
    total_supply:     u256,                // sum of all seller lock amounts (FakeETH wei)
    bids:             vector<SealedBid>,   // §2.5
    settled:          bool,
    clearing_price:   u64,                 // whole USD per whole base token
    lock_ids:         vector<vector<u8>>,  // seller receipts
    open_cursor:      u64,                 // next bid open_bids opens (§2.6)
    reveal_final:     bool,                // finalize_window ran: all opened, cleared
    refunded:         bool,                // refunded after the timelock expired
    bid_results:      vector<BidResult>,   // per-bid fills, index-aligned to bids (§2.7)
}
```

### 2.4 Pair struct


```move
struct Pair has copy, drop, store {
    base_chain:    vector<u8>,   // e.g. b"ethereum"
    base_token:    vector<u8>,   // e.g. b"FakeETH"
    quote_chain:   vector<u8>,   // e.g. b"ethereum"
    quote_token:   vector<u8>,   // e.g. b"FakeUSD"
}
```

The launch pair is `Pair { ethereum, FakeETH, ethereum, FakeUSD }`. Both
assets are locked on Ethereum, and the token names match the receipt types
`lock_receipt::FakeETH` and `lock_receipt::FakeUSD`. Its BCS is the 34 bytes
`0x08657468657265756d0746616b6545544808657468657265756d0746616b65555344`: each
field is a one-byte ULEB128 length then its bytes, in field order. The SDK
exports the same bytes as `LAUNCH_PAIR_BCS`, built by `bcsEncodePair` in
`source/atomica-sdk/src/settlement/bridge.ts`.

The key for `AuctionRegistry` is `bcs::to_bytes(&window_id)` followed by the
pair bytes. With the allowlist those bytes are always the BCS of a listed
`Pair`. Ethereum locks are bound to the hash of the same bytes.

### 2.5 Sealed Bid struct

As built by the ciphertext opening issue (228), `SealedBid` holds one V2
ciphertext, `ct_id`, a clear quantity, the claimed collateral, `opened`,
`price` and `valid`, with no price hash or salt.

Bids are IBE-encrypted at submission time. The plaintext is the 8-byte
little-endian `u64` price and nothing else: no salt and no price hash. The
plaintext price is never stored on-chain during the live auction. The client builds the timelock identity and
the bid associated data itself, from the chain id and the timelock's epoch and
deadline, and refuses to seal when the node's values differ. When extra Aptos
endpoints are configured (`VITE_APTOS_EXTRA_FULLNODE_URLS`), it compares the
master public key across them, so no single RPC node picks the key a bid is
sealed to.

```move
struct SealedBid has store {
    bidder:             address,
    ciphertext:         vector<u8>,   // V2 ciphertext BCS(vk, U, nonce, C, sig) of the 8-byte price
    ct_id:              vector<u8>,   // H(vk, AD): rejects a duplicate ciphertext
    collateral_lock_id: vector<u8>,   // FakeUSD LockReceipt ID held as margin
    quantity:           u256,         // clear bid quantity (FakeETH wei)
    collateral:         u256,         // FakeUSD the claimed receipt holds
    opened:             bool,         // true once open_bids passed the bid
    price:              u64,          // the decrypted price
    valid:              bool,
}
```

`submit_bid(window_id, pair_bcs, ciphertext, collateral_lock_id, quantity)`
takes no commitment. The ciphertext encoding is the fork spec's V2 wrapper
(`atomica-aptos: atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md`,
section 6). See `docs/architecture/adr-timelock-ibe.md` for the scheme.

**Bid limits (issue 218).** A window holds at most `MAX_BIDS_PER_WINDOW` =
100 bids (`E_WINDOW_FULL`, 25). A bid's claimed FakeUSD collateral must be at
least `MIN_BID_COLLATERAL` = 10 FakeUSD (`10_000_000` base units), or
`submit_bid` aborts with `E_COLLATERAL_TOO_SMALL` (41). Filling the 100 slots
therefore locks at least 1 000 FakeUSD, which bounds a dust attack that
closes a window.

**Bid validity at submission (issue 216).** `submit_bid` aborts with
`E_ZERO_QUANTITY` (37) on a zero quantity and with `E_QUANTITY_ABOVE_SUPPLY`
(38) on a quantity above the window's `total_supply` at that moment. Supply
only grows before the deadline, so an honest bid at or below the visible
supply always passes. The bid stores the collateral amount that
`lock_receipt::claim_for_window` returns (`SealedBid.collateral`, the same
amount the receipt holds) and a validity flag (`SealedBid.valid`, true until
opening judges the bid invalid, §2.6).

### 2.6 Reveal path

As built by the ciphertext opening issue (228), `open_bids` decrypts each bid
on chain; nobody submits or checks a price, salt or hash.

After the window closes the validators release the verified decryption key of
the window's timelock (`timelock::get_decryption_key`, status `Revealed`). The
chain then opens every bid itself with the fork native `ibe::decrypt_bid`
(issue 228). Nobody submits a price or a salt, so nobody can withhold one.

```move
// Any account. Decrypts up to max_bids bids from the window's opening cursor,
// clamped to MAX_OPEN_BIDS_PER_CALL. Never clears.
public entry fun open_bids(caller: &signer, window_id: u64, pair_bcs: vector<u8>, max_bids: u64)

// Any account, once every bid is opened. Sets reveal_final and clears (§2.7).
public entry fun finalize_window(caller: &signer, window_id: u64, pair_bcs: vector<u8>)
```

`open_bids` reads the key and the identity from the timelock registry, rebuilds
each bid's associated data with `bid_associated_data`, and decrypts the bids in
bid order from a per-window cursor. It emits one `BidsOpened { window_id,
pair_bcs, from, to }` per call. The call that opens the last bid only moves the
cursor to the bid count; a further call aborts `E_REVEAL_FINAL`. A client reads
the cursor with `get_open_cursor(window_id, pair_bcs): (next, total)`.
`MAX_OPEN_BIDS_PER_CALL` is 12 (`get_max_open_bids`): B - 1, where B = 13 is the
largest decrypt batch that fits `max_execution_gas` in the fork test
`largest_decrypt_batch_fits_max_execution_gas`. The one decrypt of headroom pays
for the associated data, the validity check and the writes of every bid in the
batch. Opening 100 bids takes nine calls.

`finalize_window` aborts `E_BIDS_NOT_ALL_OPENED` while the cursor is below the
bid count. It then sets `reveal_final` and runs the clearing algorithm (§2.7)
in the same call. It decrypts nothing. `settle` aborts `E_REVEAL_NOT_FINAL`
until it ran on a window with bids. A window with no bids needs no
`finalize_window`. `clear_uniform_price` stays public: on an already-cleared
window it changes nothing. A window whose bids nobody opens by its stuck
deadline unwinds (§2.9).

**Invalid at opening (issues 216, 228).** Each bid is judged once, when
`open_bids` decrypts it. The bid is **invalid** if its ciphertext does not
decrypt to exactly 8 bytes, the price is zero, or
`quote_for_fill(quantity, price)` is above its stored collateral. The opening
does not abort: the bid counts as opened, the cursor moves past it, and
`BidInvalid { window_id, pair_bcs, bid_index, bidder, reason }` is emitted
(reason 1: zero price, reason 2: collateral below the quote, reason 3: not an
8-byte price). An invalid bid never fills and its collateral goes back to its
depositor. A bad bid never stops the window. `get_bid_info` returns
`(bidder, ciphertext, opened, price, valid)`; `valid` is true for an unopened
bid, and the reason is only in the event.

### 2.7 Uniform-price clearing algorithm

Steps:
1. Sort all revealed bids descending by price. Unopened and invalid bids
   (§2.6) are skipped: they never fill and never set the price.
2. Accumulate quantity from the top until cumulative quantity reaches total
   supply, or all bids are consumed. A bid fits when
   `qty <= supply - accumulated`, which cannot overflow for any quantity.
3. The last bid whose cumulative quantity does not exceed supply sets the
   **marginal (clearing) price**. All winning bids pay this price. In an
   undersubscribed window the lowest valid bid sets it.
4. If the final winning bid would overfill supply, that bidder receives a
   partial fill proportional to remaining supply.
5. Losing and invalid bids get their whole collateral back: `settle` records
   a refund to the depositor for each such `collateral_lock_id` receipt (§2.8).
   A window that never settles unwinds from its stuck deadline, and `unwind`
   returns every receipt it still holds, opened or not (§3.1).

**Worked numeric example:**

Prices are whole USD per whole ETH, the one price unit (§2.9). Supply = 10 ETH.

| Bidder | Price (whole USD per whole ETH) | Quantity (ETH) | Cumulative |
|---|---|---|---|
| Alice | 2 100 | 4 | 4 |
| Bob | 2 050 | 3 | 7 |
| Carol | 2 010 | 5 | 12 |
| Dave | 1 980 | 2 | 14 |

Clearing: Alice and Bob fully fill (7 ETH). Carol's 5 ETH would bring total
to 12 but supply is 10, so Carol gets a partial fill of 3 ETH. Clearing price
= 2 010 (Carol's marginal price). Dave's receipt is released.

All winners pay 2 010 × their_fill in FakeUSD. Alice pays 8 040, Bob pays
6 030, Carol pays 6 030. In FakeUSD base units (6 decimals),
`quote_for_fill(4 × 10^18, 2010)` is 8 040 000 000 for Alice and
`quote_for_fill(3 × 10^18, 2010)` is 6 030 000 000 for Bob and Carol.

### 2.8 Bidder collateral requirement

As built by the bid validity issue (216), `submit_bid` does not check the
collateral against quantity times price: it stores the claimed amount, and
opening marks a bid invalid when its quote is above it.

Each bidder should hold an active FakeUSD `LockReceipt` on Ethereum whose
locked value is at least `bid_quantity × bid_price`, and never below the
10 FakeUSD minimum bid collateral (`submit_bid` aborts with
`E_COLLATERAL_TOO_SMALL`, 41). Here `bid_quantity` is in FakeETH wei,
`bid_price` is whole USD per whole FakeETH, and the product is in FakeUSD
base units (6 decimals), computed as
`quote_for_fill(bid_quantity, bid_price)`. The receipt's `lock_id`
is stored in `Bid.collateral_lock_id`. This mirrors the seller-side
`LockReceipt<Ethereum, FakeETH>` in
`source/atomica-move-contracts/sources/lock_receipt.move`.

**As enforced (issue 216).** `submit_bid` stores the claimed collateral
amount on the bid (§2.5). At opening, a bid whose
`quote_for_fill(quantity, price)` is above that amount, or whose price is
zero, is invalid (§2.6). An invalid bid is skipped by clearing (§2.7) and its
whole collateral returns to its depositor in the window's outcome, like a
losing bid. Nothing is slashed, kept as a fee or sent to anyone else: all
funds unwind to their origin unless the auction executes flawlessly. Spam is
bounded by the collateral each bid must lock, not by a penalty. A valid
winner can always pay: its own price is at or above the clearing price and
the quote rounds down, so its payment is at most its collateral.

**Receipt lifecycle (issue 194).** A receipt is `ACTIVE` (0) after
registration. `create_auction` and `submit_bid` claim it (`CLAIMED`, 1) only
into the window and pair its lock is bound to on Ethereum
(`lock_receipt::claim_for_window`, `E_WRONG_BINDING`). Settle, a refund or
unwind then gives it one terminal state with a stored outcome record
(`get_lock_outcome`) and a `LockOutcomeRecorded` event with the same fields:

- `FILLED` (3): the lock pays a counterparty. A seller lock pays the filled
  FakeETH to the winners' `eth_owner`. A winner's collateral pays
  `quote_for_fill` FakeUSD to the sellers' `eth_owner`.
- `REVOKED` (2): the whole amount returns to the depositor's `eth_owner`.
  Losing, unopened and invalid bids, refunded and unwound windows, and
  cancelled receipts end here.

A filled lock's leftover (winner excess collateral with its rounding dust, or
unsold seller supply) is a payout to its own depositor in the same record.
Each record's amounts sum to the lock amount, and `record_outcome` refuses a
zero, malformed or short-summing payout list, so Aptos never certifies an
unpayable leaf. LockBox does not rely on this: it pays a short leaf's remainder
to the depositor and returns a lock with an unpayable leaf whole (issue 222). Any account may call `lock_receipt::cancel_unauctioned` on an
`ACTIVE` receipt at least `timelock_config::get_receipt_cancel_delay_us` (24 h)
old.

No fee or rebate is computed on chain. The distance-to-clearing concept
(bidders closer to the marginal price pay smaller fees / receive larger
rebates) is an open question in the PRD; no scaffolding for it exists in the
contract, the SDK or the UI.

### 2.9 Settlement events

This is the canonical definition. §3 references it; §3 does not redefine it.

`settle` honours the cleared fills (§2.8) and emits `AuctionSettled`. Winners
in bid order take supply from the seller locks in `lock_ids` order. A fill
that does not fit the locks aborts `E_UNPAYABLE_FILL`; the window then
unwinds after its stuck deadline. The check stays as a guard, but a bid's
collateral can no longer trigger it: an under-collateralised bid is invalid
at opening and never fills (§2.6), and a valid winner's payment at the
clearing price is at most its collateral (§2.8).

Whichever of `settle`, `refund_expired_window` or `unwind` finalizes a window
first emits its one `AuctionOutcome`: the `outcome_tree` root over the payout
lists of every lock claimed into the window (§3.5). `unwind` on a window that
was already finalized returns only the receipts it still holds and emits
`AuctionUnwound` with no second outcome.

```move
#[event]
struct AuctionSettled has drop, store {
    window_id:      u64,
    pair:           Pair,
    pair_bcs:       vector<u8>, // window key pair bytes passed to create_auction
    clearing_price: u64,        // whole USD per whole base token, no decimal shift
    total_filled:   u256,       // wei of base token transferred to winners
    winner_count:   u64,
    lock_ids:       vector<vector<u8>>,  // seller receipt IDs consumed
}
```

Price unit: every price (bid price, clearing price) is whole USD per whole base
token, as an unsigned integer with no decimal shift. Sections 2.7 and 2.8 and
every client use it. The SDK parses and shows prices with `parsePrice` and
`formatPrice` (`formatPrice(2000n)` is `$2000`), and only `quote_for_fill`
(SDK `quoteForFill`) turns a price into FakeUSD base units.

Ethereum settlement is driven by `AuctionOutcome`, not by `AuctionSettled`.
LockBox `recordOutcome` verifies the `AuctionOutcome` event through the Aptos
light client (§3.2) and releases each lock per its leaf (§3.5).
`AuctionSettled` only reports the clearing to clients.

```move
#[event]
struct AuctionOutcome has drop, store {
    window_id:         u64,
    pair_hash:         vector<u8>,
    eth_lock_deadline: u64,        // LockBox decodes it and computes its own
    dispositions_root: vector<u8>, // outcome_tree root over every claimed lock
    leaf_count:        u64,
}
```

---

## §3 — Cross-Chain Settlement (v0.1 Trustless Flow)

<!-- SCOUT(#242) DOC: "No relayer, admin key or operator account decides where funds go" contradicts the upgrade-key bullet of 3.2 (owner decision 30). -->

v0.1 trusts only the 2/3 Aptos validator threshold. No relayer, admin key or
operator account decides where funds go. The
[trustless v0.1 unwinding ADR](../decisions/trustless-v0-1-unwinding.md)
records the three owner axioms behind this section:

1. All funds unwind to their origin unless the auction executes flawlessly.
2. No relayer is trusted.
3. Any user can send a transaction to a finished or stuck auction to unwind it.

Issues 194 to 203 and 195 moved the code to this model. The settlement
relayer, its `Settlement`, `DepositBox` and `BLSVerifier` contracts and its
SDK release path are retired (issue 195).

### 3.1 End-to-end flow

```
Ethereum chain                      Aptos chain                       Ethereum chain
──────────────                      ───────────                       ──────────────
LockBox.lock(token, amount,
  window, pair)
        │
        ▼
Validators attest the header ─────► ethereum_headers stores
(2/3+ voting power, validator txn)   (block_hash, state_root)
                                            │
                                            ▼
                                    register_ethereum_lock
                                    (any carrier; storage proof vs
                                     certified root; receipt owner =
                                     depositor's derivable account)
                                            │
                                            ▼
                                    auction settle / unwind
                                    emits AuctionOutcome
                                            │
                                            ▼
                                    any user fetches the signed ──────► light client verifies
                                    LedgerInfo + event proof            BLS quorum + inclusion
                                                                               │
                                                                               ▼
                                                                      LockBox.recordOutcome
                                                                      LockBox.releaseByOutcome
                                                                      (reclaimUnpayable for an
                                                                       unpayable leaf, or reclaim
                                                                       after deadline)
```

A user finishes a trade from the UI in three actions, in this order, on the
sell flow monitoring step (`Step8Monitor`) and in the demo:

```
open                               settle                          release
────                               ──────                          ───────
AuctionRevealer: after the         SettleButton: enabled from      ReleaseButton: enabled once the
timelock reveal, Open bids sends   chain state once the window     window settled on Aptos. It records
open_bids until every bid is       exists, every bid is opened     the AuctionOutcome on LockBox when
opened, then finalize_window.      and is_settled is false.        missing (recordOutcome), then calls
An expired timelock points to      It sends auction::settle,       releaseByOutcome per open lock, or
Unwind (UnwindButton).             which emits AuctionOutcome.     reclaimUnpayable for an unpayable leaf.
```

Any wallet may press each of them. `ReleaseButton` lists every lock of the
window with its asset, leaf payouts and LockBox status. After release the
winner holds the seller's FakeETH and the seller holds the winner's FakeUSD
on Ethereum. A stuck or unwound window goes through `UnwindButton` instead.

Every step is a permissionless call. Any wallet carries the data: the SDK
outcome carrier (`source/atomica-sdk/src/settlement/outcome-carrier.ts`) and
the UI Release, Unwind and Reclaim actions (`ReleaseButton`, `UnwindButton`,
`ReclaimLockButton`) send
ordinary transactions from the user's own wallet. Every byte a carrier brings
is checked on chain, so a carrier holds no special authority.

A lock proof is checked on Aptos against trusted inputs only (issues 171, 196,
197):

- The state root comes from `aptos_framework::ethereum_headers`. Aptos
  validators observe Ethereum through their own RPCs and certify a header
  with a 2/3+ voting-power quorum, like JWK consensus. The certificate enters
  a block as a validator transaction, so no user, relayer or special account
  carries it. No entry function writes headers, and a stored header never
  changes. The caller names a block number, never a root. A block the
  validators have not certified aborts with `E_UNKNOWN_HEADER`.
- `eth_proof::initialize` pins the LockBox address, the FakeETH and FakeUSD
  token addresses and the SIWE domain once at deploy. The receipt's asset
  type picks the token. The client reads this pin (`eth_proof::get_config`)
  before every SDK approve and lock, and refuses to send either when its
  LockBox or token address differs (`assertEthereumConfigMatchesPin`,
  `source/atomica-sdk/src/ethereum-pin.ts`, issue 234).
- `eth_proof` derives the storage key from the lock fields, and the receipt's
  `lock_id` is the LockBox lock id, so one lock gives exactly one receipt
  however many blocks it is proven at.
- The proven slot is `LockBox.commitments[lock_id]` (slot 0). It holds
  `keccak256(abi.encode(depositor, token, amount, window_id, pair_hash,
  deadline))`. `register_ethereum_lock` takes no deadline: `verify_lock`
  recomputes the commitment from the fields the carrier names and the
  deadline `eth_lock_deadline(window_id)`, which LockBox computed (issue
  221). A wrong amount, binding or deadline does not verify
  (`E_COMMITMENT_MISMATCH`).

A bidder's FakeUSD collateral lock registers the same way, with the
`FakeUSD` asset type (`getRegisterLockPayload(proof, "FakeUSD")` in the SDK).
The bidder screen reads the lock from the `Locked` event, waits for a
certified block, proves and registers the lock, and bids with its receipt id,
which is the LockBox lock id.

Any account may send `register_ethereum_lock`. The proof names the
depositor. The receipt stores that Ethereum address as `eth_owner`, and its
owner (`user`) is the depositor's Ethereum-derivable Aptos account:
`eth_proof::ethereum_account_address` derives it on chain from the address and
the pinned SIWE domain, as `0x1::ethereum_derivable_account` and the SDK's
`getDerivedAddress` do. `getDerivedAddress` lowercases the Ethereum address
before it derives, so every spelling of one address derives one account. Only
that account can claim the receipt into an auction (`create_auction`,
`submit_bid`). The `@atomica` account has no
header, registration or claim privilege.

A client waits until the validators certify a block that covers its lock
(`0x1::ethereum_headers::latest_block_number`, SDK `waitForCertifiedBlock`),
then proves the lock at that block. Production validators observe Ethereum
with `block_tag: finalized`, the node default (issue 196), so a certified
header can never be reorganized away. Only the anvil and docker testnets use
`latest`: the docker testnet turns attestation on at genesis (`eth_chain_id`)
and points every validator at the host's Ethereum RPC with `block_tag: latest`
(`source/docker-testnet/config/generate-genesis.sh`).
Each network attests one Ethereum chain id, and headers are keyed by block
number only.

**Every auction ends in an outcome Ethereum can verify (issues 194, 199).**
Aptos emits one `AuctionOutcome` per auction, from `settle`,
`refund_expired_window` or the permissionless
`auction::unwind(window_id, pair_bcs)`, whichever finalizes the window first.
`settle` runs from the reveal until the window's stuck deadline (the reveal
expiry plus the 24 h unwind grace,
`auction::get_stuck_deadline_us`). From the stuck deadline on, any account
may call `unwind`. On a window that never settled, whatever its reveal state,
it returns every lock to its depositor and emits an all-refund outcome. On a
finalized window it returns only receipts still held and emits no second
outcome. With nothing left it aborts `E_WINDOW_FINAL`. The 24 h grace is
fixed on every deployed network. Only the local testing chain (chain id 4)
lets the `@atomica` account shorten it
(`timelock_config::set_unwind_grace_us_on_test_chain`), so a live test can
stall a window past its stuck deadline in minutes. Winning fills go to
buyers at the clearing price. Bids that do not decrypt, invalid bids, losing bids,
winner excess collateral, unsold seller supply and refunded windows go back to
their depositors (§2.8). A receipt that never reached an auction can be cancelled by
anyone after a delay, and it goes back to its depositor.

**Every lock has a deadline (issues 203, 221).** A lock is bound to its
auction by the auction key `keccak256(abi.encode(window_id, pair_hash))`.
LockBox computes the lock's deadline from the window id,
`lockDeadline(window_id)`, equal to `auction::eth_lock_deadline(window_id)`
(the window close, 07:45 or 16:15 UTC, plus `ETH_RECLAIM_DELAY_SECS`, see
[auction timing](../specifications/auction-timing.md)). No caller supplies
it, so all locks of an auction share one deadline, and `lock` accepts only
the current or the next window. A recorded outcome
pays a lock out at any time. After the deadline, anyone may `reclaim` an open
lock, and the whole amount returns to the depositor unless the auction's
recorded outcome covers that lock. A lock the outcome does not cover goes home
with a non-membership proof against the sorted outcome tree. A reclaim before
any outcome is recorded voids that auction's outcome on Ethereum: no outcome
can be recorded for it afterwards.

**Leaf rule (issue 222).** A leaf means: these payouts, and the remainder to
the depositor. A leaf whose payouts sum below the lock amount pays them, then
sends `amount - sum` to the depositor. An empty leaf returns the whole lock. A
leaf is unpayable when its payouts sum above the lock amount, when the sum
overflows, or when a recipient is the zero address. `releaseByOutcome` reverts
on it, and anyone may call `reclaimUnpayable` to return that lock whole to its
depositor with no deadline wait. The other locks of the auction still release.
A lock that cannot be paid as recorded goes home.

Payouts go to the Ethereum owner of each lock (the depositor the storage proof
names), not to the bidder's Aptos signer address. A lock leaves the open
status once, so a retried release never pays twice.

There is no settlement authority. LockBox releases a lock only on a verified
Aptos outcome or a passed deadline.

**Client flow (issue 195).** The SDK builds every step from the user's own
wallet:

- `getUnwindPayload(window_id, pair_bcs)` sends `auction::unwind`, and
  `getUnwindEligibility` mirrors its checks (stuck deadline passed; window
  unfinished, or finished with receipts still held). The UI `UnwindButton`
  is enabled only then.
- `getCancelUnauctionedPayload(asset, lock_id)` sends
  `lock_receipt::cancel_unauctioned` for a receipt no window claimed.
- `carryOutcome` fetches the event proof from
  `/v1/atomica/event_proof/{version}/{event_index}`, asking each configured
  node in turn (a 404 `version_pruned` moves to the next node). It advances
  the light client with `advanceEpoch` from `latestEpoch()` to the proof's
  epoch, then calls `LockBox.recordOutcome`. On `StaleEpoch` it fetches a fresh
  proof once and retries. When no node serves the proof, or the light client
  is stale, the outcome is unprovable and every lock goes home by `reclaim`.
- `carryAndReleaseWindow` then rebuilds the outcome tree from the per-lock
  outcomes on Aptos (`lock_receipt::get_lock_outcome`), checks its root against
  the recorded one, and sends `releaseByOutcome` for each open lock.
- `reclaimLock` returns a lock after its deadline when no outcome is proven.
  The UI `ReclaimLockButton` is enabled only for such a lock.
- Before any lock, the sell flow and the bidder call `assertSiweDomain`: the
  page host must equal `eth_proof::siwe_domain`, or the lock is refused and the
  expected domain is shown. A receipt locked from another host could never be
  claimed on Aptos.

### 3.2 Aptos outcome verification on Ethereum (real BLS in v0.1)

Ethereum checks Aptos outcomes itself (issues 201, 202). Any Atomica node
serves the signed `LedgerInfoWithSignatures`, the transaction and event
inclusion proofs, and the epoch change chain. An Ethereum light client
verifies them:

- The trust root is the Aptos genesis waypoint, pinned at deploy. Anyone can
  advance the stored validator set one epoch at a time with an epoch-ending
  LedgerInfo signed by the previous set's quorum.
- A proof verifies when signers hold strictly more than two thirds of the
  voting power and the aggregate BLS12-381 signature checks out through the
  EIP-2537 precompiles.
- The event must sit in the signed ledger through its accumulator proofs.
- Only the latest known epoch's validator set can verify an event. A retired
  set is no longer bonded, so a proof signed by it reverts with `StaleEpoch`.
- Age limit (issue 195). The light client stores the LedgerInfo timestamp of
  the latest epoch it accepts and takes a constructor value `maxEpochAge`,
  shorter than the Aptos validator stake lockup. Once Ethereum time passes that
  timestamp plus `maxEpochAge`, `advanceEpoch` and `verifyEvent` revert
  `StaleLightClient`, and the client stays dead. No outcome can be recorded,
  so every lock goes home by `reclaim` after its deadline. A validator set that
  has lost its stake therefore cannot forge an epoch change chain. Carriers
  keep the client fresh with `advanceEpoch`. The Aptos genesis LedgerInfo has
  timestamp 0, so the constructor anchors the genesis epoch at deploy time,
  and a client must be deployed while the genesis set is still bonded.
- Genesis pin at deploy. `script/DeployAptosLightClient.s.sol` requires
  `EXPECTED_GENESIS_WAYPOINT` and reverts before broadcasting when it is
  missing, or differs from the waypoint the node serves at
  `/v1/atomica/genesis_waypoint`, or from the one recomputed from the genesis
  LedgerInfo. `MAX_EPOCH_AGE` defaults to half the chain's
  `recurring_lockup_duration_secs`. LockBox takes the light client address in
  its constructor, so both redeploy together.
- Trust assumption: the `@atomica` package upgrade key can emit any
  `AuctionOutcome`, so lock safety at v0.1 also trusts that key (see the ADR).

The verifier has no owner, pause, proxy or trusted caller. The old
`BLSVerifierTestnet` stub, which accepted one deploy-time caller in place of a
signature check, is deleted (issue 195).

### 3.3 Real BLS ships in v0.1

Real BLS verification is a v0.1 requirement, not a v1 upgrade. The target
Ethereum networks, including the docker testnet, must enable EIP-2537
(Pectra / Electra). The old `BLSVerifier.sol` checked Ethereum block hashes
with the wrong key and signature sizes for Aptos. Issue 202 replaced it with
the Aptos LedgerInfo verifier, and issue 195 deleted it. The anvil browser
test chunks that carry a real outcome through the light client run Prague
(`ETH_ANVIL_HARDFORK=prague`): `unwind`, `happy-path` and `claim-reclaim` in
`test-web.yaml`, and the anvil happy path in `test-web.yml` (issue 236). The
other anvil chunks run Cancun. The Aptos Light Client Live job also runs anvil
with Prague.

### 3.4 ZK seam (v1 path)

In v1 a ZK proof adds a second, independent check. It does not replace a
relayer, because v0.1 has none to replace:

```
Aptos event → ZK circuit (re-verifies auction clearing)
             → proof posted to Ethereum
             → BLS outcome proof AND ZK proof must agree
             → LockBox releases
```

Both checks gate the same release entry point. The validator threshold stays
the same trust assumption.

### 3.5 Releases

Each lock is released on its own (`source/evm-contracts/src/escrow/LockBox.sol`,
issue 203). Every call is permissionless, and LockBox has no admin, relayer or
upgrade key. It ships at a new address, and again with the computed lock
deadline (issue 221). Its constructor takes the window clock as its last two
arguments, `uint64 daySecs` and `uint64[] closeOffsetsSecs` (one or two
closes, `DeployLockBox.productionWindowSchedule()`), and freezes them.

```solidity
// windowId must be currentWindowId() or the next one (WindowClosed,
// WindowTooFarAhead). The commitment binds lockDeadline(windowId).
function lock(address token, uint256 amount, uint64 windowId, bytes32 pairHash)
    external returns (bytes32 lockId);
function auctionKey(uint64 windowId, bytes32 pairHash) external pure returns (bytes32);
// The window clock: mirrors eth_proof::window_id_at, window_close_secs and
// eth_lock_deadline (windowClose + RECLAIM_DELAY, 259_200 s).
function currentWindowId() external view returns (uint64);
function windowClose(uint64 windowId) external view returns (uint64);
function lockDeadline(uint64 windowId) external view returns (uint64);
function windowSchedule() external view returns (uint64 daySecs, uint64[] memory closeOffsetsSecs);
// Verifies the AuctionOutcome event through the Aptos light client and stores
// its dispositions root and leaf count for the auction key.
function recordOutcome(IAptosLightClient.EventProof calldata proof) external returns (bytes32 auctionKey);
// Pays a lock per its leaf: the payouts, then the remainder to the depositor.
// Reverts ZeroRecipient or PayoutSumMismatch on an unpayable leaf.
function releaseByOutcome(Lock calldata l, OutcomeTree.Payout[] calldata payouts,
                          OutcomeTree.LeafProof calldata leaf) external;
// No deadline wait: the whole lock to its depositor when its proven leaf is
// unpayable (LeafPayable otherwise). Emits LockReclaimedUnpayable.
function reclaimUnpayable(Lock calldata l, OutcomeTree.Payout[] calldata payouts,
                          OutcomeTree.LeafProof calldata leaf) external;
// After the deadline: back to the depositor, with a non-membership proof
// when the auction has a recorded outcome.
function reclaim(Lock calldata l, OutcomeTree.Neighbour[] calldata neighbours) external;
```

The outcome tree (`OutcomeTree.sol`, `atomica::outcome_tree`, SDK
`settlement/outcome-tree.ts`) has one leaf per lock claimed into the window,
sorted by lock id: `keccak256(0x00 || lock_id || payouts_hash)`, where
`payouts_hash` packs the (Ethereum recipient, amount) payouts. Recipients are
receipt `eth_owner` addresses, never the Aptos `user`. The payouts of a leaf
may sum below the lock amount, and the remainder goes to the depositor; the
leaf and payouts hashes do not depend on this rule. The relayer-only
`refund`, `settleFill` and `withdrawWinnings` are gone.

**Migration from the old LockBox (issue 195).** The SDK and UI point only at
the new LockBox address. The old relayer-gated deployment takes no new
locks. Before the relayer key is retired, the old deployment's
`settlementAuthority` refunds every remaining open lock to its depositor with
`refund`. After that the key has nothing left to act on.

---

*Document version: v0.1 — describes the code on `main`. The `auction.move`
implementation (Phase 3a), the light-client verifier and the proof-gated
LockBox (Phase 3b) are merged.*
