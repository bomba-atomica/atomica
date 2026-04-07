# atomica-zkp

Status: `scaffold`

## Purpose

Isolated Rust crate that will contain the ZK auction-clearing circuit for v1.0 double-verification. Currently a two-line stub (`lib.rs` is intentionally empty). The long-term goal is a MoveVM-independent ZK proof that independently re-verifies auction clearing, preventing validators from manipulating outcomes without detection.

See `scaffold-notes.md` in this directory for what is intentionally empty and which roadmap milestone fills it in.

## Public API surface

None yet. The planned public surface (v1.0) will include:

- A prover function that takes auction inputs and emits a proof
- A verifier function consumable by `evm-contracts` on-chain
- Circuit definitions in `src/circuit/`

## Dependents

None currently. Future dependents:

- `source/evm-contracts` — on-chain ZK verifier will consume proofs from this crate
- `source/atomica-crosschain-testing` — end-to-end tests will include ZK proof generation

## See also

- `docs/roadmap.md` v1.0 section — ZK double-verification milestone
- `scaffold-notes.md` — implementation seams and TODOs for the implementer
