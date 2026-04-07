# atomica-crosschain-testing

Status: `live`

## Purpose

Rust integration test crate that exercises the full cross-chain flow end-to-end: Ethereum token locking via `LockBox`, state proof generation, Aptos-side proof registration via `lock_receipt`, and auction settlement. Runs against a live dual-chain testnet (Anvil + Aptos local node) spun up by `source/docker-testnet`. This crate contains no production logic — only test infrastructure and assertions.

## Public API surface

No public API. Internal modules:

| Module | Description |
|---|---|
| `env` | Test environment setup — RPC URLs, contract addresses, funded accounts |
| `tests::cross_chain_workflow` | Happy-path integration test: lock → proof → register → auction → settle |
| `tests::timelock_e2e_smoke` | Smoke test for IBE timelock flow |

## Dependents

None — this is a terminal test crate. It is not imported by any other package.

## See also

- `docs/architecture/v0-architecture.md` §3 — the flow exercised by these tests
- `source/docker-testnet` — testnet orchestration this crate depends on
- `source/state-proofs` — proof generation used in the cross-chain workflow test
