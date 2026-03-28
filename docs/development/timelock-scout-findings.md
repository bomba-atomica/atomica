# Timelock Foundation — Scout Findings

**Issue**: #33 (dev-scout)
**Scout date**: 2026-03-28
**Status**: Partial — blocked pending issue #34

---

## 1. Where Phase 0 Work Lives

Phase 0 of the Timelock Foundation was implemented in the **external repository
`bomba-atomica/atomica-aptos`** on branch `implement-ibe-1.38.5`, not in this
repository. The `atomica-aptos` submodule was intentionally removed from this
repo in PR #7 (Dec 2025). See issue #34 for the re-integration decision that
must precede full implementation.

The following Phase 0 artifacts exist in `bomba-atomica/atomica-aptos`:

- `crates/aptos-dkg/src/ibe/mod.rs` and `ibe/errors.rs` — IBE Rust stubs
- `timelock_config.move` — configurable intervals and genesis integration
- 4 new view functions in `timelock.move`
- `dkg/src/epoch_manager.rs` — DKG manager field and storage stubs
- `testsuite/smoke-test/src/timelock/` — E2E smoke-test stub (marked `#[ignore]`)

**In this repo** (`source/` on `main`), the scout found parallel stub
implementations that mirror what exists in `atomica-aptos`:

| Path | Status |
|------|--------|
| `source/aptos-dkg/src/ibe/mod.rs` | Compiles; stubs only |
| `source/aptos-dkg/src/epoch_manager.rs` | Compiles; stubs only |
| `source/aptos-dkg/tests/timelock_e2e_smoke.rs` | Present; `#[ignore]` |
| `source/atomica-move-contracts/sources/timelock_config.move` | Compiles; 4 tests |
| `source/atomica-move-contracts/sources/timelock_encryption.move.broken` | Excluded (`.broken` suffix) |

---

## 2. Compile Verification Results

### 2a. Rust / aptos-dkg crate

```
cargo build   — PASS  (0.30s, no warnings)
cargo test    — PASS  (3 unit tests pass; 1 E2E test ignored)
```

All stubs in `source/aptos-dkg` compile successfully against the current
toolchain with no external dependencies.

### 2b. Move contracts — `timelock_config.move`

```
aptos move compile --named-addresses atomica=0xcafe  — PASS
```

`timelock_config` is included in the compiled output alongside all other
`atomica` modules.

### 2c. Move tests — `timelock_config` (BLOCKED)

```
aptos move test --dev --filter timelock  — FAIL
```

**Root cause**: `timelock_config.move` test block uses
`std::unit_test::assert_eq`, which does not exist in the `dev-atomica` fork of
the Aptos framework that `Move.toml` pins as `AptosFramework`. The symbol is
only available in a newer framework version.

**Impact**: The acceptance criterion "4/4 timelock_config tests pass" cannot be
met until either (a) the test block is rewritten to use plain `assert!`, or
(b) the framework dependency is updated. This is a pre-existing issue; the
scout did not introduce it.

### 2d. `timelock_encryption.move` (BLOCKED pending #34)

The full IBE encryption module is stored as
`source/atomica-move-contracts/sources/timelock_encryption.move.broken`.
It imports `aptos_std::ibe`, which is only present in the `atomica-aptos` fork
of the Aptos framework. Renaming the file and attempting to compile will fail
until the re-integration path from issue #34 is resolved.

---

## 3. Integration Seams Between IBE / Move / DKG Layers

### 3a. threshold_numerator coupling

`timelock_config.move::TimelockConfig.threshold_numerator` (default `67`,
denominator `100`) **must match** the threshold value passed to
`aptos_dkg::ibe::recombine(shares, threshold)`. If they diverge, recombination
will produce a wrong key and decryption will silently fail.

- Risk level: **High** — a mismatch is a silent correctness failure, not a
  compile error.
- Mitigation: Pass `threshold_numerator` on-chain and have the validator read
  it from Move storage before calling `recombine`.

### 3b. identity bytes format

`aptos_dkg::ibe::extract(_msk, identity: &[u8])` must receive the same byte
encoding that Move produces for the epoch identity (e.g.
`bcs::to_bytes(&epoch_number)`). The two sides currently have no shared
constant or test.

- Risk level: **Medium** — mismatch will cause decryption failure, detectable
  by the E2E smoke test.
- Mitigation: Define a canonical `IDENTITY_FORMAT` constant shared between the
  Rust and Move layers, and assert it in the E2E smoke test.

### 3c. IbeCiphertext wire format

`aptos_dkg::ibe::IbeCiphertext` (currently an empty struct) must serialise to
the same format expected by the Move `EncryptedMessage` struct in
`timelock_encryption.move`:

```move
struct EncryptedMessage has drop, store, copy {
    u: vector<u8>,      // U = r * G (G2, BLS12-381)
    ciphertext: vector<u8>, // C = M XOR Hash(e(P_pub, Q_id)^r)
}
```

The web client (`atomica-web/src/lib/timelock.ts`, when created) must produce
the same byte layout.

- Risk level: **High** — a format mismatch will compile cleanly but fail at
  runtime.
- Mitigation: Define wire format in
  `docs/technical/timelock-dataflow-specification.md` before Phase 1 coding
  begins; add a golden-vector test.

### 3d. `on_new_epoch` sequencing seam

`TimelockEpochState::on_new_epoch` must be invoked **before** validators
accept bids for the new epoch. The hook is called from the Aptos consensus
`EpochChangeProof` handler (in `atomica-aptos`). If the timing is wrong,
bids encrypted under the new MPK cannot be decrypted.

- Risk level: **Medium** — race condition; hard to reproduce in unit tests.
- Mitigation: Document the invariant in the consensus integration test plan;
  add an assertion that `epoch_decryption_key` is `Some` before the auction
  module accepts new bids.

### 3e. `MasterSecretKey` zeroisation

`TimelockEpochState.master_secret_key` is marked with a `# Security note`
that it must be zeroised on drop using the `zeroize` crate in Phase 1. The
current stub does not zeroize.

- Risk level: **Low** (scout phase only) / **High** (production)
- Mitigation: Add `zeroize` dependency and `#[zeroize(drop)]` derive in Phase 1
  before any non-stub keys are stored.

### 3f. `TimelockEpochState` persistence format

BCS serialisation format for `TimelockEpochState` is not yet finalised. A
breaking change after validators have stored state on disk will require a
migration.

- Risk level: **Medium**
- Mitigation: Finalise and document the BCS format in
  `docs/technical/timelock-dataflow-specification.md` before Phase 1 deployment.

---

## 4. Acceptance Criteria Status

| Criterion | Status | Notes |
|-----------|--------|-------|
| `cargo build` succeeds for aptos-dkg crate | PASS | Verified 2026-03-28 |
| `aptos move compile` passes for timelock modules | PARTIAL | `timelock_config` compiles; `timelock_encryption` excluded (`.broken`) |
| DKG epoch_manager compiles with timelock field | PASS | Stub compiles; no real crypto |
| Downstream issue #28 updated with integration findings | DONE | See comment on #28 |

**Blocked items** (cannot be fully verified until #34 merges):

- `aptos move test` 4/4 `timelock_config` tests — blocked by `std::unit_test::assert_eq`
  incompatibility with current framework pin (fix: rewrite tests with `assert!`)
- `timelock_encryption.move` compile — blocked until re-integration path from #34
  is executed (copy source or package dependency)

---

## 5. Recommended Actions Before Issue #28 Implementation

1. **Merge #34** — record the re-integration decision and path.
2. **Fix `timelock_config` tests** — replace `std::unit_test::assert_eq` with
   plain `assert!` or update the framework pin to a version that includes it.
3. **Restore `timelock_encryption.move`** — once the `atomica-aptos` fork's
   `aptos_std::ibe` is available, remove the `.broken` suffix and verify
   compilation.
4. **Define wire format** — document `IbeCiphertext` byte layout in
   `docs/technical/timelock-dataflow-specification.md` before Phase 1.
5. **Audit identity bytes encoding** — agree on canonical `identity` byte
   format between Rust `extract` and Move epoch derivation.
