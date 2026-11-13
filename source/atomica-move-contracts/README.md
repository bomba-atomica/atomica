# atomica-move-contracts

Status: `live` (partially `scaffold` — see per-module notes below)

## Purpose

Move smart contracts deployed on the Atomica Aptos testnet. Implements the sealed-bid batch auction, cross-chain Ethereum state proof verification, lock-receipt registry, and IBE timelock scaffolding. These contracts are the on-chain half of the v0.1 auction flow; the off-chain half lives in `atomica-sdk` and `state-proofs`.

## Public API surface

### Entry points (public entry funs)

<!-- SCOUT(#228) DOC: the `submit_bid` row loses "price commitment"; the `open_bid`, `submit_cleartext_and_clear`, `finalize_reveal` row becomes `open_bids`. -->
<!-- SCOUT(#242) DOC: the `settle` row says "single highest bid; uniform-price clearing is scaffold"; the code clears at a uniform price. The unwind pull request (213) rewrites this row. -->

| Module | Function | Status |
|---|---|---|
| `atomica::auction` | `create_auction` | live (aborts `E_PAIR_NOT_ALLOWED` unless `pair_bcs` is on the pair allowlist; takes no timelock id: the first call of a window id registers its one timelock through the package's registrar object, with the window close as deadline, and later sellers of any pair join it) |
| `atomica::auction` | `allow_pair` | live (package account only; adds a pair from its four fields) |
| `atomica::eth_proof` | `set_window_schedule` | test chain only (package account, chain id 4, once: stores a short window clock such as `900, [900]`) |
| `atomica::auction` | `submit_bid` | live (V2 bid ciphertext checked with `ibe::verify_bid_ct`, price commitment) |
| `atomica::auction` | `open_bid`, `submit_cleartext_and_clear`, `finalize_reveal` | live (openings checked against the commitment; needs registry status `Revealed`) |
| `atomica::auction` | `refund_expired_window` | live (returns every receipt and emits the all-refund `AuctionOutcome` once the timelock is `Expired`) |
| `atomica::auction` | `settle` | live (honours the cleared fills until the stuck deadline; records every lock's outcome and emits `AuctionOutcome`) |
| `atomica::auction` | `unwind` | live (any account, from the stuck deadline: returns every lock a window still holds; issue 194) |
| `atomica::lock_receipt` | `initialize<Chain, Asset>` | live |
| `atomica::lock_receipt` | `register_ethereum_lock<Asset>` | live (proves the LockBox commitment slot; takes no deadline: the commitment binds `auction::eth_lock_deadline(window_id)`, which LockBox computes) |
| `atomica::lock_receipt` | `cancel_unauctioned<Chain, Asset>` | live (any account returns an `ACTIVE` receipt after the cancel delay) |
| `atomica::fake_eth` | `initialize` | live |
| `atomica::fake_eth` | `mint` | live (legacy faucet) |
| `atomica::fake_eth` | `mint_from_lock` | retired (aborts `E_RETIRED`; issue 203) |
| `atomica::fake_usd` | `initialize` | live |
| `atomica::fake_usd` | `mint` | live (legacy faucet) |
| `atomica::fake_usd` | `mint_from_lock` | retired (aborts `E_RETIRED`; issue 203) |
| `atomica::timelock` | — (view funs only) | live (facade of `aptos_framework::ibe_config`) |

### View functions

<!-- SCOUT(#218) DOC: add the view `get_window_limits`. -->
<!-- SCOUT(#228) DOC: remove `compute_bid_commitment` from the `atomica::auction` row. -->

| Module | Function |
|---|---|
| `atomica::auction` | `get_auction`, `get_bid_count`, `get_bid_info`, `get_window_status`, `bid_associated_data`, `compute_bid_commitment`, `is_settled`, `auction_exists`, `get_settlement`, `get_stuck_deadline_us`, `quote_for_fill`, `is_pair_allowed`, `launch_pair_bcs`, `timelock_registrar_address`, `window_timelock`, `window_deadline_us` |
| `atomica::eth_proof` | `get_window_schedule` (the window clock in force: 07:45 and 16:15 UTC unless a test chain stored another) |
| `atomica::lock_receipt` | `is_lock_claimed`, `get_total_locked`, `get_receipt_count`, `get_receipt`, `get_receipt_binding`, `get_lock_outcome`, `is_registry_initialized` |
| `atomica::fake_eth` | `get_metadata`, `balance` |
| `atomica::fake_usd` | `get_metadata`, `balance` |
| `atomica::timelock` | `is_ibe_ready`, `get_mpk`, `get_status`, `get_expiry_reason`, `is_deadline_passed`, `is_timelock_expired` (the `Expired` status), `is_revealed`, `get_timelock_epoch`, `get_deadline`, `get_reveal_expiry`, `get_timelock_identity`, `get_decryption_key` |

### Internal modules (not directly called by clients)

- `atomica::eth_proof` — Ethereum MPT state proof verification, LockBox lock commitment, auction key and `eth_lock_deadline` (also exposed as `auction::eth_lock_deadline` and `auction::auction_key`)
- `atomica::outcome_tree` — keccak Merkle tree of an auction's dispositions; LockBox (`OutcomeTree.sol`) verifies its root from `auction::AuctionOutcome`
- `atomica::mpt` — Merkle-Patricia Trie node decoding
- `atomica::rlp` — RLP decoding for Ethereum account data

## Dependents

- `source/atomica-sdk` (via `@atomica/aptos-docker-testnet`) — submits transactions to these contracts
- `source/atomica-web-components` — calls view functions via the SDK

## See also

- `atomica-aptos` `atomica/docs/decisions/auction-v2-bid-wrapper.md` — how the contract handles V2 bids, the reveal and the refund (cleartext decision, open items)
- `docs/architecture/v0-architecture.md` §2 — auction mechanism spec
- `docs/architecture/v0-architecture.md` §3 — cross-chain settlement flow
- `docs/roadmap.md` — per-capability status (scaffold capabilities noted)
