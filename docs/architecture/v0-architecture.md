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
`(u_bytes, ciphertext)` using `timelock_config::get_decryption_key`, then
runs the clearing algorithm.

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
    clearing_price: u64,        // USD per base token, no decimal shift
    total_filled:   u256,       // wei of base token transferred to winners
    winner_count:   u64,
    lock_ids:       vector<vector<u8>>,  // seller receipt IDs consumed
}
```

---

## §3 — Cross-Chain Settlement (v0.1 BLS-Relayer Flow)

### 3.1 End-to-end flow

```
Aptos chain                          Off-chain bridge             Ethereum chain
──────────────                       ─────────────                ──────────────
AuctionSettled event emitted
        │
        ▼
Event indexed by relayer service ───► relayer reads event fields
                                      signs with trusted EOA key
                                             │
                                             ▼
                                     BLSVerifierTestnet.sol
                                     (trusted-relayer call)
                                             │
                                             │ emit SettlementAuthorized(windowId, pair,
                                             │        clearingPrice, totalFilled, winners[])
                                             ▼
                                     Settlement.sol
                                     transferFrom(winner, amount × clearingPrice, FakeUSD)
                                     transfer(winner, their_fill, FakeETH)
                                             │
                                             ▼
                                     WithdrawWinnings emitted
```

`AuctionSettled` (defined in §2.9) is the sole on-chain signal read by the
relayer. The relayer reconstructs winner addresses from the Aptos event data
and posts them to Ethereum.

### 3.2 BLSVerifierTestnet.sol trusted-relayer interface

The v0.1 testnet verifier skips real BLS verification and instead accepts a
call from a trusted EOA set at deploy time. This keeps settlement unblocked
while EIP-2537 precompile availability is confirmed.

```solidity
// source/evm-contracts/src/settlement/BLSVerifierTestnet.sol
// Comment-only stub — implementation in Phase 3b

interface IBLSVerifierTestnet {
    /// Called by the trusted relayer with data extracted from AuctionSettled.
    /// @param windowId   auction_window_id from the Move event
    /// @param pairHash   keccak256 of ABI-encoded (baseChain, baseToken, quoteChain, quoteToken)
    /// @param clearingPrice   USD per base token (no decimal shift)
    /// @param winners    winning bidder Ethereum addresses
    /// @param fills      corresponding fill amounts in wei
    function authorizeSettlement(
        uint64  windowId,
        bytes32 pairHash,
        uint64  clearingPrice,
        address[] calldata winners,
        uint256[] calldata fills
    ) external;

    event SettlementAuthorized(
        uint64  indexed windowId,
        bytes32 indexed pairHash,
        uint64  clearingPrice,
        address[] winners,
        uint256[] fills
    );
}
```

### 3.3 Why EIP-2537 / real BLS is deferred to v1

EIP-2537 (BLS12-381 precompiles) ships in the Ethereum Pectra upgrade. As of
the v0.1 testnet phase the precompiles are not yet universally available on
public testnets. The production path (`BLSVerifier.sol`, already implemented
at `source/evm-contracts/src/BLSVerifier.sol`) uses precompiles `0x09`
(G1_MULTIEXP) and `0x0c` (PAIRING). When EIP-2537 is confirmed stable:

1. Deploy `BLSVerifier.sol` replacing `BLSVerifierTestnet.sol`.
2. The relayer submits an aggregated BLS signature over the Aptos event hash
   instead of a raw EOA signature.
3. `Settlement.sol` switches its verifier reference from testnet to production.
4. No other Settlement logic changes.

### 3.4 ZK seam (v1 path)

In v1 a ZK proof replaces the trusted relayer entirely:

```
Aptos event → ZK circuit (proves event inclusion in Aptos state)
             → proof posted to Ethereum
             → BLSVerifier verifies proof
             → Settlement.sol executes without relayer trust
```

The seam point is `BLSVerifierTestnet.authorizeSettlement`. In v1 this
function is replaced by a proof-verification entry point:

```solidity
function verifyAndAuthorize(
    bytes calldata aptosStateProof,
    bytes calldata zkProof,
    AuctionSettledData calldata eventData
) external;
```

Everything downstream of `SettlementAuthorized` remains identical.

### 3.5 WithdrawWinnings flow

Winners do not receive assets automatically. After `Settlement.sol` processes
an authorized settlement, it records entitlements. Winners call:

```solidity
/// Withdraw previously credited winnings.
/// @param token  ERC-20 token address (FakeETH or FakeUSD)
function withdrawWinnings(address token) external;

event WithdrawWinnings(
    address indexed winner,
    address indexed token,
    uint256 amount
);
```

This pull pattern prevents gas issues from pushing to many addresses in one
transaction, and gives winners control over when they claim.

---

*Document version: v0.1 — covers Phase 0b deliverables. Phase 3a will expand
§2 with the full Move module implementation. Phase 3b will expand §3 with the
production BLS verifier deployment.*
