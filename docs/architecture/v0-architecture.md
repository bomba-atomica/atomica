# Atomica v0 Architecture

This document is the single authoritative reference for three interconnected
decisions: the target package layout, the v0.1 auction mechanism, and the v0.1
cross-chain settlement flow. Later phases extend, not replace, this foundation.

---

## §1 — Package Layout

### 1.1 Target structure

<!-- SCOUT(#242) DOC: section 1 reads as a plan: the renames of 1.2 are done and the React-import check of 1.3 already runs in .githooks/pre-push (not in CI). -->

The codebase converges on three packages:

| Target package | Role | React? |
|---|---|---|
| `atomica-web-components` | Reusable React UI components | Yes |
| `atomica-sdk` | Headless, zero-React business logic | No |
| `atomica-demo` | Demo app, scripts, and orchestration shell | Yes (consumer only) |

**Dependency rules (enforced by CI):**
- `atomica-web-components` → `atomica-sdk` ✓
- `atomica-demo` → `atomica-web-components` and `atomica-sdk` ✓
- `atomica-sdk` must have zero React imports — enforced by the pre-push hook
- No package may import from `atomica-demo`

### 1.2 Mapping from current packages

| Existing package | Target | Action |
|---|---|---|
| `source/atomica-web-ui` | `atomica-web-components` | In-place rename |
| `source/atomica-web-demo` | `atomica-demo` | In-place rename |
| `source/atomica-web` | (deleted) | Remove; its integration-test harness moves to `atomica-demo` |
| `source/atomica-sdk` | `atomica-sdk` | Extended in place — no rename |

`source/atomica-web` is a thin integration-test wrapper with no production
logic of its own. Keeping it adds a fourth package name for no benefit and
creates ambiguity about which package owns shared entry points. Its
Playwright/Vitest integration test configuration migrates to `atomica-demo`.

### 1.3 CI enforcement

The existing pre-push hook (`scripts/install-hooks.sh`) will be extended with
a single check:

```bash
grep -r "from 'react'" source/atomica-sdk/src && \
  { echo "ERROR: atomica-sdk must not import React"; exit 1; }
```

No separate CI job is required at v0; the hook is sufficient. A GitHub Actions
job is planned for Phase 3a.

---

## §2 — Auction Mechanism (v0.1 Beta)

<!-- SCOUT(#242) DOC: section 2 was the pre-implementation target: auction.move is written and its structs and entry signatures differ from the code blocks in 2.3, 2.5 and 2.6. -->

This section is detailed enough that an implementer can derive every Move data
structure and entry-function signature for the `auction.move` rewrite in
Phase 3a.

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

<!-- SCOUT(#242) DOC: last sentence of 2.2 is false: submit_bid never reads the clock window id; it checks the window timelock status and deadline, and create_auction accepts the current and the next window id. -->
<!-- SCOUT(#243) DOC: say here that the window timelock deadline is the window close, which is what binds a bid to the window clock. -->

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

The window ID monotonically increases. A bid is only accepted when the current
window ID matches the auction's registered window ID.

### 2.3 AuctionRegistry

<!-- SCOUT(#242) DOC: WindowState as built also holds timelock_id, min_prices, revealed_prices, reveal_final, refunded and bid_results, bids is vector<SealedBid>, and sellers contribute supply, not bids. -->
<!-- SCOUT(#218) DOC: state the cap on seller locks per window and the minimum seller lock size. -->
<!-- SCOUT(#243) DOC: state that create_auction registers the window timelock itself, one per window id, and takes no timelock_id. -->

The registry is keyed by `(auction_window_id, pair)`, not by seller address.
Multiple sellers offering the same pair in the same window contribute bids to
the same clearing pool.

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
    total_supply:     u256,   // sum of all seller lock amounts (FakeETH wei)
    bids:             vector<Bid>,
    settled:          bool,
    clearing_price:   u64,
    lock_ids:         vector<vector<u8>>,  // seller receipts
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

<!-- SCOUT(#242) DOC: Bid struct is stale: SealedBid holds one V2 ciphertext BCS(vk, U, nonce, C, sig), ct_id, a 32-byte price hash, a clear quantity, opened and price; there is no u_bytes, and the encoding follows the fork spec, not Drand tlock. -->
<!-- SCOUT(#216) DOC: the bid stores its collateral amount and a validity flag; submit_bid aborts on zero quantity and on quantity above supply. -->
<!-- SCOUT(#218) DOC: state the bid cap (100) and the minimum collateral per bid. -->
<!-- SCOUT(#228) DOC: the price hash and salt leave the bid; the plaintext is the 8-byte little-endian price. -->

Bids are IBE-encrypted at submission time. The plaintext price is never stored
on-chain during the live auction. The client builds the timelock identity and
the bid associated data itself, from the chain id and the timelock's epoch and
deadline, and refuses to seal when the node's values differ. When extra Aptos
endpoints are configured (`VITE_APTOS_EXTRA_FULLNODE_URLS`), it compares the
master public key across them, so no single RPC node picks the key a bid is
sealed to.

```move
struct Bid has store {
    bidder:             address,
    u_bytes:            vector<u8>,   // IBE ephemeral point U = rG (48-byte G1)
    ciphertext:         vector<u8>,   // AES-GCM ciphertext of plaintext price
    collateral_lock_id: vector<u8>,   // FakeUSD LockReceipt ID held as margin
}
```

`u_bytes` and `ciphertext` follow the Drand tlock encoding: see
`docs/architecture/adr-timelock-ibe.md` for the full IBE scheme.

### 2.6 Reveal path

<!-- SCOUT(#242) DOC: reveal as built: submit_cleartext_and_clear(settler, window_id, pair_bcs, cleartexts, salts) and open_bid check each (price, salt) against the 32-byte hash stored at submission, never against the ciphertext; the key getter is timelock::get_decryption_key. -->
<!-- SCOUT(#216) DOC: an opened bid with price zero or a quote above its collateral is marked invalid without aborting. -->
<!-- SCOUT(#228) DOC: the fork native ibe::decrypt_bid is what lets the chain check a ciphertext; until it ships no Move code can decrypt. -->
<!-- SCOUT(#228) DOC: whole section is replaced: open_bids(window_id, pair_bcs, max_bids) decrypts in batches and clears on the last batch; submit_cleartext_and_clear, open_bid, finalize_reveal and the opening window go. -->

After the window closes the on-chain DKG releases a decryption key for the
window's timelock identity. The settlement transaction calls:

```move
// 1. Fetch the 48-byte G1 decryption key for this window's timelock
let dk: vector<u8> = timelock_config::get_decryption_key(timelock_id);

// 2. For each Bid, call submit_cleartext_and_clear
//    (entry function signature — Phase 3a implementation target)
public entry fun submit_cleartext_and_clear(
    settler:   &signer,
    window_id: u64,
    pair_bcs:  vector<u8>,
    cleartexts: vector<u64>,  // revealed prices, index-aligned to bids
) acquires AuctionRegistry { ... }
```

The entry function verifies each cleartext against the corresponding
`(u_bytes, ciphertext)` using `timelock_config::get_decryption_key`. When the
call opens the last unopened bid, the reveal becomes final and the same
transaction runs the clearing algorithm (§2.7). If some bids stay unopened,
`finalize_reveal` closes the openings after the opening window and runs the
clearing algorithm in that call. `clear_uniform_price` stays public: on an
already-cleared window it changes nothing.

### 2.7 Uniform-price clearing algorithm

<!-- SCOUT(#216) DOC: steps 1 to 3: invalid bids are skipped like unopened ones and the fit test is qty <= supply - accumulated; the undersubscribed rule (review decision 34) stays as written: the lowest bid sets the price. -->
<!-- SCOUT(#217) DOC: the worked example is in whole USD per whole ETH; name that unit and show the FakeUSD (6 decimals) amounts quote_for_fill gives. -->
<!-- SCOUT(#242) DOC: step 5: on main only opened losing bids are released; an unopened bid receipt stays claimed (BidUnopened) until the Aptos unwind (194) merges. -->

Steps:
1. Sort all revealed bids descending by price.
2. Accumulate quantity from the top until cumulative quantity reaches total
   supply, or all bids are consumed.
3. The last bid whose cumulative quantity does not exceed supply sets the
   **marginal (clearing) price**. All winning bids pay this price.
4. If the final winning bid would overfill supply, that bidder receives a
   partial fill proportional to remaining supply.
5. Losing bids have their `collateral_lock_id` receipts released.

**Worked numeric example:**

Supply = 10 ETH.

| Bidder | Price (USD/ETH) | Quantity (ETH) | Cumulative |
|---|---|---|---|
| Alice | 2 100 | 4 | 4 |
| Bob | 2 050 | 3 | 7 |
| Carol | 2 010 | 5 | 12 |
| Dave | 1 980 | 2 | 14 |

Clearing: Alice and Bob fully fill (7 ETH). Carol's 5 ETH would bring total
to 12 but supply is 10, so Carol gets a partial fill of 3 ETH. Clearing price
= 2 010 (Carol's marginal price). Dave's receipt is released.

All winners pay 2 010 × their_fill in FakeUSD. Alice pays 8 040, Bob pays
6 030, Carol pays 6 030.

### 2.8 Bidder collateral requirement

<!-- SCOUT(#242) DOC: the contract does not enforce "at least bid_quantity × bid_price": submit_bid drops the receipt amount; say what is enforced today and name the bid validity issue (216) as the gap. -->
<!-- SCOUT(#216) DOC: state the rule as enforced: collateral stored on the bid, invalid at opening when quote_for_fill(quantity, price) exceeds it, collateral returned to the depositor; the E_UNPAYABLE_FILL sentence that open pull request 213 adds to section 2.9 then no longer applies to an under-collateralised bid. -->
<!-- SCOUT(#217) DOC: bid_quantity × bid_price needs units: quantity in wei, price in whole USD per whole token, product in FakeUSD units via quote_for_fill. -->
<!-- SCOUT(#218) DOC: state the minimum FakeUSD collateral per bid. -->

Each bidder must hold an active FakeUSD `LockReceipt` on Ethereum whose
locked value is at least `bid_quantity × bid_price`. The receipt's `lock_id`
is stored in `Bid.collateral_lock_id`. This mirrors the seller-side
`LockReceipt<Ethereum, FakeETH>` in
`source/atomica-move-contracts/sources/lock_receipt.move`.

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
  Losing and unopened bids, refunded and unwound windows, and cancelled
  receipts end here.

A filled lock's leftover (winner excess collateral with its rounding dust, or
unsold seller supply) is a payout to its own depositor in the same record.
Each record's amounts sum to the lock amount, and `record_outcome` refuses a
zero, malformed or short-summing payout list, so Ethereum never certifies an
unpayable leaf. Any account may call `lock_receipt::cancel_unauctioned` on an
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
that does not fit the locks (a payment above a winner's collateral) aborts
`E_UNPAYABLE_FILL`; the window then unwinds after its stuck deadline.

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
    clearing_price: u64,        // USD per base token, no decimal shift
    total_filled:   u256,       // wei of base token transferred to winners
    winner_count:   u64,
    lock_ids:       vector<vector<u8>>,  // seller receipt IDs consumed
}
```

<!-- SCOUT(#217) DOC: section 2.9: the clearing_price comment "USD per base token, no decimal shift" is the unit; sections 2.7 and 2.8 and every client must match it. -->
<!-- SCOUT(#242) DOC: section 2.9: Ethereum settlement is driven by AuctionOutcome, which settle does not emit on main; AuctionSettled is no longer what section 3 uses. -->

---

## §3 — Cross-Chain Settlement (v0.1 Trustless Flow)

<!-- SCOUT(#242) DOC: "No relayer, admin key or operator account decides where funds go" contradicts the upgrade-key bullet of 3.2 (owner decision 30); "moving to this model through issues 194 to 203" is stale: only 194 and 195 are open. -->

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

<!-- SCOUT(#236) DOC: diagram: add the user flow: open, settle, then the release action that records the outcome and calls releaseByOutcome per lock. -->
<!-- SCOUT(#242) DOC: diagram: "auction settle / unwind emits AuctionOutcome" is not on main (open pull request 213). -->

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
                                                                      (or reclaim after deadline)
```

Every step is a permissionless call. Any wallet carries the data: the SDK
outcome carrier (`source/atomica-sdk/src/settlement/outcome-carrier.ts`) and
the UI Unwind and Reclaim actions (`UnwindButton`, `ReclaimLockButton`) send
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

<!-- SCOUT(#242) DOC: not on main: settle emits no AuctionOutcome and auction::unwind does not exist (open pull request 213 rewrites this paragraph). -->
<!-- SCOUT(#216) DOC: invalid bids join the list of locks that go back to their depositors. -->
<!-- SCOUT(#228) DOC: the stuck test loses "plus the opening window", and "unopened bids" become bids that do not decrypt. -->

**Every auction ends in an outcome Ethereum can verify (issues 194, 199).**
Aptos emits one `AuctionOutcome` per auction, from `settle`,
`refund_expired_window` or the permissionless
`auction::unwind(window_id, pair_bcs)`, whichever finalizes the window first.
`settle` runs from the reveal until the window's stuck deadline (the reveal
expiry plus the 10-minute opening window plus the 24 h unwind grace,
`auction::get_stuck_deadline_us`). From the stuck deadline on, any account
may call `unwind`. On a window that never settled, whatever its reveal state,
it returns every lock to its depositor and emits an all-refund outcome. On a
finalized window it returns only receipts still held and emits no second
outcome. With nothing left it aborts `E_WINDOW_FINAL`. The 24 h grace is
fixed on every deployed network. Only the local testing chain (chain id 4)
lets the `@atomica` account shorten it
(`timelock_config::set_unwind_grace_us_on_test_chain`), so a live test can
stall a window past its stuck deadline in minutes. Winning fills go to
buyers at the clearing price. Unopened bids, losing bids, winner excess
collateral, unsold seller supply and refunded windows go back to their
depositors (§2.8). A receipt that never reached an auction can be cancelled by
anyone after a delay, and it goes back to its depositor.

<!-- SCOUT(#222) DOC: add: a short leaf pays its remainder to the depositor, and a covered lock whose leaf is unpayable goes home through reclaimUnpayable with no deadline wait. -->

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
can be recorded for it afterwards. So an auction settles on Ethereum fully or
not at all.

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

<!-- SCOUT(#242) DOC: "issue 202 replaces it" is done: AptosLightClient.sol is merged; BLSVerifier.sol still ships until the SDK and UI unwind (195) deletes it. -->

Real BLS verification is a v0.1 requirement, not a v1 upgrade. The target
Ethereum networks, including the docker testnet, must enable EIP-2537
(Pectra / Electra). The old `BLSVerifier.sol` checked Ethereum block hashes
with the wrong key and signature sizes for Aptos. Issue 202 replaced it with
the Aptos LedgerInfo verifier, and issue 195 deleted it. The browser test
tiers run Cancun, except the unwind chunk, which runs anvil with Prague
(`ETH_ANVIL_HARDFORK=prague`) and carries a real outcome through the light
client. The Aptos Light Client Live job also runs anvil with Prague.

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
<!-- SCOUT(#222) DOC: the releaseByOutcome comment becomes "payouts, then the remainder to the depositor"; add reclaimUnpayable(lock, payouts, leaf). -->

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
// Pays a lock per its leaf: payouts sum to the lock amount.
function releaseByOutcome(Lock calldata l, OutcomeTree.Payout[] calldata payouts,
                          OutcomeTree.LeafProof calldata leaf) external;
// After the deadline: back to the depositor, with a non-membership proof
// when the auction has a recorded outcome.
function reclaim(Lock calldata l, OutcomeTree.Neighbour[] calldata neighbours) external;
```

<!-- SCOUT(#222) DOC: leaf semantics: the payouts of a leaf may sum below the lock amount; the leaf and payouts hashes do not change. -->

The outcome tree (`OutcomeTree.sol`, `atomica::outcome_tree`, SDK
`settlement/outcome-tree.ts`) has one leaf per lock claimed into the window,
sorted by lock id: `keccak256(0x00 || lock_id || payouts_hash)`, where
`payouts_hash` packs the (Ethereum recipient, amount) payouts. Recipients are
receipt `eth_owner` addresses, never the Aptos `user`. The relayer-only
`refund`, `settleFill` and `withdrawWinnings` are gone.

**Migration from the old LockBox (issue 195).** The SDK and UI point only at
the new LockBox address. The old relayer-gated deployment takes no new
locks. Before the relayer key is retired, the old deployment's
`settlementAuthority` refunds every remaining open lock to its depositor with
`refund`. After that the key has nothing left to act on.

---

<!-- SCOUT(#242) DOC: footer is stale: the Phase 3a and 3b work it promises is merged. -->

*Document version: v0.1 — covers Phase 0b deliverables. Phase 3a will expand
§2 with the full Move module implementation. Phase 3b will expand §3 with the
light-client verifier and proof-gated LockBox deployment.*
