# atomica-move-contracts

Status: `live` (partially `scaffold` — see per-module notes below)

## Purpose

Move smart contracts deployed on the Atomica Aptos testnet. Implements the sealed-bid batch auction, cross-chain Ethereum state proof verification, lock-receipt registry, and IBE timelock scaffolding. These contracts are the on-chain half of the v0.1 auction flow; the off-chain half lives in `atomica-sdk` and `state-proofs`.

## Public API surface

### Entry points (public entry funs)

| Module | Function | Status |
|---|---|---|
| `atomica::auction` | `create_auction` | live |
| `atomica::auction` | `submit_bid` | live (V2 bid ciphertext checked with `ibe::verify_bid_ct`, price commitment) |
| `atomica::auction` | `open_bid`, `submit_cleartext_and_clear`, `finalize_reveal` | live (openings checked against the commitment; needs registry status `Revealed`) |
| `atomica::auction` | `refund_expired_window` | live (releases every receipt once the timelock is `Expired`) |
| `atomica::auction` | `settle` | live (single highest bid; uniform-price clearing is scaffold) |
| `atomica::lock_receipt` | `initialize<Chain, Asset>` | live |
| `atomica::lock_receipt` | `register_ethereum_lock<Asset>` | live |
| `atomica::fake_eth` | `initialize` | live |
| `atomica::fake_eth` | `mint` | live (legacy faucet) |
| `atomica::fake_eth` | `mint_from_lock` | live (legacy; canonical flow skips Aptos FA minting) |
| `atomica::fake_usd` | `initialize` | live |
| `atomica::fake_usd` | `mint` | live (legacy faucet) |
| `atomica::fake_usd` | `mint_from_lock` | live (legacy) |
| `atomica::registry` | `initialize` | live |
| `atomica::timelock` | — (view funs only) | live (facade of `aptos_framework::ibe_config`) |

### View functions

| Module | Function |
|---|---|
| `atomica::auction` | `get_auction`, `get_bid_count`, `get_bid_info`, `get_window_status`, `bid_associated_data`, `compute_bid_commitment`, `is_settled`, `auction_exists`, `get_settlement` |
| `atomica::lock_receipt` | `is_lock_claimed`, `get_total_locked`, `get_receipt_count`, `get_receipt`, `is_registry_initialized` |
| `atomica::fake_eth` | `get_metadata`, `balance` |
| `atomica::fake_usd` | `get_metadata`, `balance` |
| `atomica::registry` | `get_aptos_address`, `get_nonce` |
| `atomica::timelock` | `is_ibe_ready`, `get_mpk`, `get_status`, `get_expiry_reason`, `is_deadline_passed`, `is_timelock_expired` (the `Expired` status), `is_revealed`, `get_timelock_epoch`, `get_deadline`, `get_reveal_expiry`, `get_timelock_identity`, `get_decryption_key` |

### Internal modules (not directly called by clients)

- `atomica::eth_proof` — Ethereum MPT state proof verification
- `atomica::mpt` — Merkle-Patricia Trie node decoding
- `atomica::rlp` — RLP decoding for Ethereum account data

## Dependents

- `source/atomica-sdk` (via `@atomica/aptos-docker-testnet`) — submits transactions to these contracts
- `source/atomica-web-components` — calls view functions via the SDK
- `source/atomica-crosschain-testing` — Rust integration tests that exercise the full cross-chain flow

## See also

- `atomica-aptos` `atomica/docs/decisions/auction-v2-bid-wrapper.md` — how the contract handles V2 bids, the reveal and the refund (cleartext decision, open items)
- `docs/architecture/v0-architecture.md` §2 — auction mechanism spec
- `docs/architecture/v0-architecture.md` §3 — cross-chain settlement flow
- `docs/roadmap.md` — per-capability status (scaffold capabilities noted)
