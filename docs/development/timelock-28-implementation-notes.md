# Timelock Phase 0 — Issue #28 Implementation Notes

## Status: BLOCKED on issue #34

Implementation for this issue cannot begin until issue #34 (re-integration
decision docs) is merged and closed.

## Why this issue is blocked

Issue #28 requires porting IBE Rust stubs, `timelock_config.move`, DKG
`epoch_manager` changes, and related code from the external repo
`bomba-atomica/atomica-aptos` (branch `implement-ibe-1.38.5`) into this
repository. Before any code is copied or referenced, the re-integration
strategy must be recorded:

- **Option A:** Copy source files from `atomica-aptos` directly into this repo
- **Option B:** Depend on `atomica-aptos` as a published package

Issue #34 exists specifically to record this decision. Until it is closed,
writing any implementation here risks having to redo the work or undo
structural choices.

## What exists in `bomba-atomica/atomica-aptos` (branch `implement-ibe-1.38.5`)

- IBE Rust stubs: `crates/aptos-dkg/src/ibe/mod.rs` and `ibe/errors.rs`
- `timelock_config.move` with configurable intervals and genesis integration
- 4 new view functions in `timelock.move`
- DKG manager field and storage stubs in `dkg/src/epoch_manager.rs`
- Smoke-test E2E stub at `testsuite/smoke-test/src/timelock/` (marked `#[ignore]`)

## Next steps (after #34 closes)

1. Read the re-integration decision recorded by issue #34.
2. Follow that decision to bring the files from `atomica-aptos` into this repo.
3. Verify `aptos move compile` passes.
4. Verify `aptos move test` — 4/4 timelock_config tests pass.
5. Verify IBE module stubs compile.
6. Remove the `[DRAFT]` label from this PR and request review.
