# Timelock Phase 0 — Issue #28 Implementation Notes

## Status: BLOCKED — open re-integration decision

Issue #34 (PR #38) has merged. The re-integration decision section is now in
`docs/development/timelock-implementation-plan.md` (§ "Open Re-Integration
Decision"). That section explicitly states:

> **Decision status: NOT YET MADE**
>
> Neither option has been chosen. Agents MUST NOT re-implement Phase 0
> scaffolding from scratch before this decision is recorded and resolved.

Implementation for this issue cannot begin until the team resolves that open
decision.

## What issue #34 recorded (PR #38, merged 2026-03-28)

The merged document added a full "Phase 0: atomica-aptos Separation and
Re-Integration Decision" section that:

- Documents exactly which artifacts exist in `bomba-atomica/atomica-aptos`
  (branch `implement-ibe-1.38.5`) and their paths
- Lists parallel stub implementations already present in this repo (compiled,
  stubs-only)
- States the two candidate re-integration paths:
  - **Option A:** Copy source files from `atomica-aptos` directly into this repo
  - **Option B:** Depend on `atomica-aptos` as a published package
- Marks the decision as NOT YET MADE and prohibits agents from proceeding
  before it is resolved
- Documents integration seams (from issue #33 scout) that must be addressed
  after the decision (see also `docs/development/timelock-scout-findings.md`)

## Why implementation is still blocked

The `timelock_encryption.move.broken` file cannot compile until
`aptos_std::ibe` is available, which depends on which re-integration path is
chosen. Writing any implementation before that choice is made risks duplicate
or conflicting work relative to the existing `implement-ibe-1.38.5` artifacts.

## What exists in `bomba-atomica/atomica-aptos` (branch `implement-ibe-1.38.5`)

| Artifact | Path in `atomica-aptos` | Description |
|----------|------------------------|-------------|
| IBE Rust stubs | `crates/aptos-dkg/src/ibe/mod.rs` | Boneh-Franklin IBE struct and function stubs |
| IBE error types | `crates/aptos-dkg/src/ibe/errors.rs` | Error enum for IBE operations |
| Timelock config module | `aptos-move/framework/aptos-framework/sources/timelock_config.move` | Configurable epoch intervals and genesis integration |
| Timelock view functions | `aptos-move/framework/aptos-framework/sources/timelock.move` | 4 new view functions |
| DKG epoch manager field | `dkg/src/epoch_manager.rs` | `TimelockEpochState` field and storage stubs |
| E2E smoke-test stub | `testsuite/smoke-test/src/timelock/` | End-to-end test skeleton, marked `#[ignore]` |

## Next steps (after the re-integration decision is made)

1. A team member updates `docs/development/timelock-implementation-plan.md`
   → "Open Re-Integration Decision" to record which option was chosen, who
   decided, when, and any caveats.
2. Follow that decision to bring the files from `atomica-aptos` into this repo
   (Option A) or configure the package dependency (Option B).
3. Verify `aptos move compile` passes.
4. Verify `aptos move test` — 4/4 timelock_config tests pass.
5. Verify IBE module stubs compile.
6. Address the integration seams flagged in
   `docs/development/timelock-scout-findings.md`.
7. Remove draft status from PR #37 and request review.
