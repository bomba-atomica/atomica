# Atomica v0 Architecture

This document is the single authoritative reference for three interconnected
decisions: the target package layout, the v0.1 auction mechanism, and the v0.1
cross-chain settlement flow. Later phases extend, not replace, this foundation.

---

## §1 — Package Layout

### 1.1 Target structure

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

This section is detailed enough that an implementer can derive every Move data
structure and entry-function signature for the `auction.move` rewrite in
Phase 3a.

### 2.1 Auction windows

Two global windows open per day, anchored to UTC:

| Window | Open | Close |
|---|---|---|
| Morning | 07:45 UTC | 08:15 UTC |
| Afternoon | 16:15 UTC | 16:45 UTC |

All auctions within a window share the same `auction_window_id`. A single
epoch lasts 12 hours (43 200 seconds). The morning window fires at offset
28 500 s into the epoch (07:45 = 7×3600 + 45×60); the afternoon window fires
at offset 58 500 s (16:15 = 16×3600 + 15×60).

### 2.2 Window ID formula

```
epoch_index      = unix_seconds / 43200          // integer division
time_in_epoch    = unix_seconds % 43200
window_offset    = (time_in_epoch >= 28500) ? 1 : 0

auction_window_id = epoch_index * 2 + window_offset
```

Implemented on-chain using `timestamp::now_seconds()`:

```move
fun current_window_id(): u64 {
    let s = timestamp::now_seconds();
    let epoch = s / 43200;
    let tmod  = s % 43200;
    epoch * 2 + if (tmod >= 28500) { 1 } else { 0 }
}
```

The window ID monotonically increases. A bid is only accepted when the current
window ID matches the auction's registered window ID.

### 2.3 AuctionRegistry

The registry is keyed by `(auction_window_id, pair)`, not by seller address.
Multiple sellers offering the same pair in the same window contribute bids to
the same clearing pool.

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
    quote_chain:   vector<u8>,   // e.g. b"aptos"
    quote_token:   vector<u8>,   // e.g. b"FakeUSD"
}
```

The canonical key for `AuctionRegistry` is `bcs::to_bytes(&(window_id, pair))`.

### 2.5 Sealed Bid struct

Bids are IBE-encrypted at submission time. The plaintext price is never stored
on-chain during the live auction.

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

Each bidder must hold an active FakeUSD `LockReceipt` on Ethereum whose
locked value is at least `bid_quantity × bid_price`. The receipt's `lock_id`
is stored in `Bid.collateral_lock_id`. On win the receipt is consumed; on loss
it is released. This mirrors the seller-side `LockReceipt<Ethereum, FakeETH>`
already implemented in `source/atomica-move-contracts/sources/lock_receipt.move`.

Fee and rebate calibration is deferred to Phase 3c. The distance-to-clearing
concept (bidders closer to the marginal price pay smaller fees / receive larger
rebates) will be specified in that phase.

### 2.9 AuctionSettled event

This is the canonical definition. §3 references it; §3 does not redefine it.

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

---

## §3 — Cross-Chain Settlement (v0.1 Trustless Flow)

v0.1 trusts only the 2/3 Aptos validator threshold. No relayer, admin key or
operator account decides where funds go. The
[trustless v0.1 unwinding ADR](../decisions/trustless-v0-1-unwinding.md)
records the three owner axioms behind this section:

1. All funds unwind to their origin unless the auction executes flawlessly.
2. No relayer is trusted.
3. Any user can send a transaction to a finished or stuck auction to unwind it.

The code is moving to this model through issues 194 to 203. Where the code
still has a relayer-only path, that path is legacy and the ADR wins.

### 3.1 End-to-end flow

```
Ethereum chain                      Aptos chain                       Ethereum chain
──────────────                      ───────────                       ──────────────
LockBox.lock(token, amount,
  window, pair, deadline)
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

Every step is a permissionless call. A relayer may carry data as a
convenience, but every byte it carries is checked on chain, and any user can
make the same call.

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
  type picks the token.
- `eth_proof` derives the storage key from the lock fields, and the receipt's
  `lock_id` is the LockBox lock id, so one lock gives exactly one receipt
  however many blocks it is proven at.

Any account may send `register_ethereum_lock`. The proof names the
depositor. The receipt stores that Ethereum address as `eth_owner`, and its
owner (`user`) is the depositor's Ethereum-derivable Aptos account:
`eth_proof::ethereum_account_address` derives it on chain from the address and
the pinned SIWE domain, as `0x1::ethereum_derivable_account` and the SDK's
`getDerivedAddress` do. Only that account can claim the receipt into an
auction (`create_auction`, `submit_bid`). The `@atomica` account has no
header, registration or claim privilege.

A client waits until the validators certify a block that covers its lock
(`0x1::ethereum_headers::latest_block_number`, SDK `waitForCertifiedBlock`),
then proves the lock at that block. The docker testnet turns attestation on at
genesis (`eth_chain_id`) and points every validator at the host's Ethereum RPC
with `block_tag: latest` (`source/docker-testnet/config/generate-genesis.sh`).
Each network attests one Ethereum chain id, and headers are keyed by block
number only.

**Every auction ends in an outcome Ethereum can verify (issues 194, 199).**
Aptos emits one `AuctionOutcome` per auction, from `settle` or from the
permissionless `auction::unwind(window_id, pair_bcs)`. Any account may call
`unwind` on a finished window or on a stuck one (not settled and past the
reveal deadline plus the opening window plus a grace period). It gives every
receipt of the window a terminal state. Winning fills go to buyers at the
clearing price. Unopened bids, losing bids, winner excess collateral, unsold
seller supply and refunded windows go back to their depositors. A receipt that
never reached an auction can be cancelled by anyone after a delay, and it goes
back to its depositor.

**Every lock has a deadline (issue 203).** A lock carries a deadline bound to
its auction. Before the deadline, a verified Aptos outcome pays it out. After
the deadline, anyone may `reclaim` an open lock, and the whole amount returns
to the depositor unless a proven settle covers that lock. So an auction
settles on Ethereum fully or not at all.

Payouts go to the Ethereum owner of each lock (the depositor the storage proof
names), not to the bidder's Aptos signer address. A lock leaves the open
status once, so a retried release never pays twice.

There is no `settlementAuthority`. LockBox releases a lock only on a verified
Aptos outcome or a passed deadline.

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

The verifier has no owner, pause, proxy or trusted caller. The old
`BLSVerifierTestnet` stub, which accepted one deploy-time caller in place of a
signature check, is retired by the ADR.

### 3.3 Real BLS ships in v0.1

Real BLS verification is a v0.1 requirement, not a v1 upgrade. The target
Ethereum networks, including the docker testnet, must enable EIP-2537
(Pectra / Electra). The existing `BLSVerifier.sol` signs Ethereum block hashes
with the wrong key and signature sizes for Aptos, so issue 202 replaces it with
an Aptos LedgerInfo verifier.

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

### 3.5 Releases and the legacy relayer path

In the target model each lock is released on its own. `releaseByOutcome`
checks the lock against the verified outcome and transfers each payout to its
recipient. `reclaim` returns an open lock to its depositor after the deadline.
Both calls are permissionless (issue 203).

The current `LockBox.sol` (`source/evm-contracts/src/escrow/LockBox.sol`) still
has the legacy path below. Only `settlementAuthority` can call `refund` and
`settleFill`, which credit balances that users then pull with
`withdrawWinnings`. The [ADR](../decisions/trustless-v0-1-unwinding.md)
supersedes this path, and issue 203 replaces it with a new LockBox at a new
address.

```solidity
// Legacy, superseded: settlementAuthority-only calls
function refund(bytes32 outcomeId, address user, address token, uint256 amount) external;
function settleFill(bytes32 outcomeId, address seller, address winner,
                    uint256 baseAmount, uint256 quoteAmount) external;
function withdrawWinnings(address token) external;
```

---

*Document version: v0.1 — covers Phase 0b deliverables. Phase 3a will expand
§2 with the full Move module implementation. Phase 3b will expand §3 with the
light-client verifier and proof-gated LockBox deployment.*
