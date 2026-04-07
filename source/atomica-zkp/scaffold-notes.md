# scaffold-notes — atomica-zkp

## What is intentionally empty

`src/lib.rs` contains two comment lines and no logic:

```rust
// Library will contain runtime prover code
// Test circuits are in tests/common/
```

No circuit, no prover, no verifier. The crate compiles and is part of the workspace so that CI confirms it remains dependency-clean (no MoveVM coupling), but it produces no usable artifacts.

## Which roadmap milestone fills this in

**v1.0 — ZK double-verification** (see `docs/roadmap.md` v1.0 section).

Specifically:

| Capability | Status in v1.0 |
|---|---|
| ZK auction-clearing circuit | `missing` → implemented |
| On-chain ZK verifier (Ethereum) | `missing` → new contract in `evm-contracts/src/` |
| Dual-gate settlement (BLS + ZK must agree) | `missing` → `Settlement.sol` extended |
| On-chain bid-validity verification via ZK | `missing` → implemented |

## Known seams for the implementer

1. **Circuit input format** — The circuit must consume the same `Auction` struct fields emitted by `atomica::auction::settle` on Aptos. The canonical field layout is in `source/atomica-move-contracts/sources/auction.move` (`Auction` struct and `AuctionSettled` event).

2. **Proof system choice** — Not yet decided (STARK vs SNARK, Groth16 vs PLONK). The choice affects which on-chain verifier contract is needed in `evm-contracts`.

3. **Isolation requirement** — This crate must not import `aptos-framework` or any MoveVM dependency. CI will enforce this via `cargo deny` once the crate is non-empty.

4. **test data** — Golden test vectors for auction clearing are planned in `source/golden-vectors/`. Use those for circuit test inputs once available.

5. **`tests/common/`** — Placeholder directory referenced in `lib.rs` comment. Create `tests/common/mod.rs` with shared circuit setup when implementing.
