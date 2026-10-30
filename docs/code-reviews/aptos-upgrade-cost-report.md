# Aptos Upgrade Cost Report

**Date**: October 30, 2026
**Status**: Analysis. No build or test run was done on the upstream target.
**Current base**: `aptos-node-v1.38.5` (upstream commit `facb34a558`, dated 2025-12-08). The `dev-atomica` branch of `bomba-atomica/atomica-aptos` forks from this commit.
**Targets evaluated**: `aptos-node-v1.49.6` (latest open-source mainnet release) and `aptos-node-v1.49.8-hotfix` (latest mainnet tag, private source).
**Sources**: GitHub release notes for `aptos-labs/aptos-core`, the git history of `dev-atomica`, and a partial clone of upstream `aptos-core`.
**Related**: [Aptos v1.38 Integration Analysis](../decisions/aptos-v1-38-integration-analysis.md), [Aptos Encrypted Mempool Analysis](../decisions/aptos-encrypted-mempool-analysis.md), [Aptos Validator Timelock](../decisions/aptos-validator-timelock.md)

---

## Summary

- Atomica is 11 minor releases behind upstream. That gap is 1,371 upstream commits and 11,731 changed files.
- All 310 shared files that atomica touched also changed upstream. Each one is a merge conflict risk.
- 57 files that atomica touched do not exist upstream at 1.49.8. These hold the IBE, timelock, and golden vector work, and each must be ported or dropped.
- Upstream now ships an encrypted transaction pipeline and a batch threshold encryption crate. Neither exists at the 1.38.5 tag. These overlap with atomica's custom DKG and IBE work.
- Recommendation: do not rebase `dev-atomica` onto a newer release yet. Run a short spike that builds `aptos-node-v1.49.6` and checks whether the upstream encrypted path meets the timelock spec.

---

## a) Latest stable releases

| Track | Tag | Date | Source available | Notes |
|---|---|---|---|---|
| Mainnet, latest | `aptos-node-v1.49.8-hotfix` | 2026-10-29 | No | Private hotfix. Binaries and docker image only. |
| Mainnet, latest open source | `aptos-node-v1.49.6` | 2026-10-16 | Yes | Last full release with public source and notes. |
| Testnet release candidate | `aptos-node-v1.49.8-hotfix-rc` | 2026-10-28 | No | Not a stable release. |
| Aptos CLI | `aptos-cli-v9.6.0` | 2026-09-22 | Yes | Latest CLI release. |

Recommended stable target for planning: `aptos-node-v1.49.6`. The 1.49.8 hotfix adds fixes that cannot be read yet, so a port to it cannot be reviewed from source.

---

## b) Changelog since 1.38.5

- Upstream commits in the range `facb34a558..aptos-node-v1.49.8-hotfix`: 1,371.
- Public mainnet releases with notes since 1.38.5: 22. These run from `1.39.2` to `1.49.6`.
- Private hotfix tags with no public notes: 16.
- PR titles in public release notes: 1,393 raw. After removing cherry-picks, version bumps, and duplicates, 1,036 are unique.

The notes do not cover every commit. The gap between 1,371 commits and 1,036 unique titles is a limit of this method. Treat the category counts below as approximate.

---

## c) Major architecture changes versus minor fixes

Counts are keyword-based estimates over the 1,036 unique titles.

| Area | Approx. items | Classification | Key releases |
|---|---|---|---|
| Move VM, BlockSTM, MonoMove prototype | ~208 | Major | BlockSTM v2 default in 1.49.1. MonoMove prototype runs under replay benchmarks, not default. |
| Move compiler, prover, linter, specs | ~153 | Mixed | Move 1 sunset and compiler v2 default in 1.44 to 1.49.1. Prover work is mostly not relevant to us. |
| CLI, tooling, CI, docker, forge, release | ~131 | Minor for runtime | Move CLI extracted in 1.43.1. Move CLI removed from the node tree. |
| Encrypted transactions, chunky DKG, batch threshold encryption | ~130 | Major | Chunky DKG and encrypted transaction types from 1.42. Encrypted transactions and chunky DKG v1 enabled at genesis in 1.48.2. |
| Mempool, consensus, quorum store | ~102 | Major for consensus | Batch v2 and OptQS v2 on by default in 1.44 to 1.45. Round timeout cut from 1000 ms to 500 ms in 1.47.1. |
| Storage and hot state | ~84 | Major | Hot state root on mainnet in 1.45.4. Legacy monolithic ledger DB removed in 1.44.7. Hot state DBs made non-optional in 1.48.2. |
| Move framework and stdlib | ~49 | Mixed | Permissioned signers and resource access control removed in 1.49.1. Chunky DKG Move modules added in 1.42. |
| API, indexer, SDK | ~34 | Moderate | Legacy in-node indexer deleted in 1.43.1. Encrypted payload added to the REST API in 1.44 to 1.45. |
| Networking, faucet, other | ~33 | Mixed | Validator to PFN connections in 1.44 to 1.45. |
| Uncategorized | ~112 | Mostly minor | Small fixes, typos, refactors, dependency changes. |

Major architectural changes, in order:

1. Chunky DKG replaces the older randomness DKG path (1.42 to 1.49.4).
2. Encrypted transactions use batch threshold encryption with a digest key, decrypted after ordering (1.42 to 1.48).
3. BlockSTM v2 becomes the default executor (verified on validators in 1.46, default in 1.49.1).
4. Hot state storage moves into the default path (1.45 to 1.48).
5. Legacy indexer and monolithic ledger storage are removed (1.43 to 1.44).
6. Move 1 is removed from the compiler, and compiler v2 becomes the default (1.44 to 1.49.1).
7. The MonoMove VM is in development as a prototype, with no default switch in the notes.

De minimis changes: CI and docker work, dependency bumps, license headers, typo fixes, forge tuning, and Rust toolchain bumps.

---

## d) Breaking incompatibilities

Overall severity: **High**. The largest risk is the DKG and encrypted path, because atomica's code is built on the older DKG.

| Area | Upstream change (release) | Atomica exposure | Severity |
|---|---|---|---|
| Encrypted payload primitives | Ciphertext ID now hashes the verification key and associated data (1.44.7). HKDF changed to RFC-5869 (1.42.1). Hash-to-curve replaced with arkworks and noble-curves (1.42.1). Digest key file format changed (1.45.4). | Only matters if atomica adopts upstream `aptos-batch-encryption`. Atomica's own IBE golden vectors would then need regenerating. | High if adopted. None if not. |
| DKG and validator transactions | Chunky DKG adds `ChunkyDKGResult` to the validator transaction enum (1.42.1). Config key `decryption_setup_blob_path` renamed to `digest_key_blob_path` (1.45.4). | `crates/aptos-dkg/src/ibe`, `dealt_secret_key_share`, and `aptos-move/aptos-vm/src/validator_txns/timelock.rs` are fork-only and depend on the older DKG output. | High |
| Move language features | Permissioned signers removed (1.49.1). Resource access control removed (1.49.1). Aggregator V1 removed from execution (1.49.1). Move 1 and compiler v2 below language version 2.2 dropped (1.49.1). Publishing gated on a minimum bytecode version (1.48.6). | Depends on what `source/atomica-move-contracts` uses. Not yet checked. | Medium |
| Gas schedule | 10x multiplier on gas costs and storage fees (1.41.9 and 1.42). Gas schedule version bumped through v49 (1.42 to 1.49.1). | Any gas expectation or fixture in tests and contracts must be recalibrated. | Medium |
| Storage and node database | Legacy monolithic ledger DB and `StateValueSchema` removed (1.44.7). Hot state DBs made non-optional (1.48.2). | A node database created at 1.38 may need a resync or snapshot restore. Not tested. | High (operational) |
| Indexer | In-node legacy indexer deleted (1.43.1). | Only matters if atomica reads the in-node indexer. Not yet checked. | Medium |
| API and clients | Fat type (de)serialization removed (1.48.2). Pruned reads return 410 (1.49.1). | `source/atomica-sdk` and API clients need checks. | Low to medium |
| Consensus wire format | Quorum store messages accept V2 entries only (1.46.2). Optimistic blocks rejected at ingress (1.49.1). | Matters only for mixed-version validator sets. | Medium (operational) |
| Build toolchain | Rust minimum rises from 1.91 to 1.94. `move-cli`, `move-ir-compiler`, and `mvir` removed. CLI moved to `aptos-move-cli` (1.43.1). | Build scripts and CI need updates. | Low to medium |
| Forge local swarm | Local swarm enhanced with NUMA affinity and Sapling support (1.44.7). | `atomica-crosschain-testing` uses `aptos-forge` from the fork. Its API may have changed. Not verified. | Medium |

### Effort estimate

This estimate is a judgment call, not a measured figure. No build was run.

- 343 files were touched by atomica commits. Of these, 286 exist at 1.49.8, 310 existed at 1.38.5, and all 310 changed upstream.
- 57 files must be ported or dropped. These hold the IBE, timelock, and golden vector code.
- The upgrade crosses 11 minor releases and a Rust toolchain change.

Rough range: 8 to 16 engineer-weeks for one engineer who knows Move and `aptos-dkg`. Confidence is low. The biggest unknown is how much of the DKG and timelock code can be replaced by upstream.

---

## e) Improvements that help timelock, mempool, or general performance

### Timelock encryption

- **Batch threshold encryption crate** (`crates/aptos-batch-encryption`, 37 files at 1.49.8). It has IBE-style schemes, weighted and succinct variants, and digest key handling. It may replace atomica's custom IBE if the timing model fits.
- **Timing model gap**: the release notes point to decryption in consensus after ordering, per block. I did not confirm this in source. Atomica needs decryption at a future deadline height. The fit must be checked against [Aptos Validator Timelock](../decisions/aptos-validator-timelock.md) before any adoption.
- **Digest key posted on chain at epoch end** (1.42.1). This could replace part of atomica's DKG key release flow.
- **Chunky DKG robustness** (1.45.4 to 1.49.4). Includes stall recovery, equivocation fixes, DoS hardening, and transcript fetch retries.
- **Encrypted payload fields**: `claimed_entry_fun` (1.45.4) lets an encrypted transaction name the call it makes. This may suit auction bids.
- **Sender binding** (1.45.4): encrypted payload verification is tied to sender auth keys.

### Mempool and consensus

- **Orderless transactions** (1.42.1). Removes sequence number contention. Relevant to bursts of auction bids.
- **Mempool rate limiter and thread pool change** (1.45.4). Rayon pools replaced with `spawn_blocking`.
- **Encrypted-transaction-aware shuffler** (1.45.4).
- **Optimistic batch and proposal paths** on by default (1.44 to 1.45).
- **Round timeout reduced to 500 ms** (1.47.1). Lowers block latency.
- **Mempool fix release** (1.49.6). The notes do not describe the change. Read the diff before relying on it.

### General performance

- **BlockSTM v2 default** (1.49.1). Largest expected execution gain.
- **Hot state** root hash, pruning, and concurrent DB open (1.45 to 1.49.1).
- **Cryptography speedups**: multipairing in the encrypted path (1.45.4), Shplonked rewrite (1.44.7), single-permutation SHA3 for Merkle nodes (1.44.7), deferred G1 decompression (1.47.1).
- **Smaller values**: `values_impl::Value` shrinks from 48 to 32 bytes (1.39.2).
- **Caution**: `DigestKey` deserialization now skips validation for speed (1.45.4). Review this against the security model before reuse.
- **MonoMove** is a prototype. Do not plan around it.

### Security fixes the 1.38.5 base lacks

Staying on 1.38.5 leaves these open:

- Iterative drop of nested Move values (1.44 and 1.46.2).
- Fail-closed squash for delayed-field writes (1.46 and 1.47).
- Display recursion stack overflow fix (1.46).
- Fiat-Shamir fixes in DeKART and PVSS (1.45 and 1.46).
- Chunky DKG equivocation fix (1.44.7 and 1.45.4).
- PROXY protocol allocation bound (1.46.2).

---

## Confidence

- **High**: release tags and dates, the commit and file counts, and the finding that the 1.38.5 tag has no encrypted payload type or batch encryption crate.
- **Medium**: category counts and classifications, since they come from keyword matching on release titles.
- **Low**: the effort range, and the severity ratings for Move language features and the node database. Neither has been tested.

## Open questions

1. Does `source/atomica-move-contracts` use permissioned signers, aggregator V1, or resource access control?
2. Can a node database created at 1.38 migrate to 1.49 without a resync?
3. Does the atomica IBE design need decryption at a future height, or can it use upstream's after-ordering decryption?
4. Does `atomica-crosschain-testing` still build against the upstream forge crate?

## Correction to the v1.38 analysis

[Aptos v1.38 Integration Analysis](../decisions/aptos-v1-38-integration-analysis.md) (December 9, 2025) says v1.38 already includes `EncryptedPayload` and `aptos-batch-encryption`. The `aptos-node-v1.38.5` tag contains neither. The release notes place the first encrypted payload type in the 1.39 line, and the batch encryption crate in the 1.42 line. That doc should be marked superseded by this report.

## Next step

Build `aptos-node-v1.49.6` in a separate worktree under `~/tmp/superfield-worktrees/atomica-aptos/`. Then run the timelock smoke test against it. This shows how much of the atomica timelock code upstream already covers.
