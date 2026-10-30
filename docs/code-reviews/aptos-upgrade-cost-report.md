# Aptos Upgrade Cost Report

**Date**: October 30, 2026 (revised the same day, see [Revision note](#revision-note))
**Status**: Analysis. No build or test run was done on the upstream target.
**Current base**: `aptos-node-v1.38.5` (upstream commit `facb34a558`, dated 2025-12-08). The `dev-atomica` branch of `bomba-atomica/atomica-aptos` forks from this commit. Its fork point on upstream `main` is `c6ae38ec41` (2025-11-07).
**Target evaluated**: `aptos-node-v1.49.6` (upstream commit `b4359185dd`). Its fork point on upstream `main` is `074d7f0cb5` (2026-08-18).
**Sources**: GitHub release notes for `aptos-labs/aptos-core`, the git history of `dev-atomica`, and a full-history partial clone of upstream `aptos-core`.
**Related**: [Aptos v1.38 Integration Analysis](../decisions/aptos-v1-38-integration-analysis.md), [Aptos Encrypted Mempool Analysis](../decisions/aptos-encrypted-mempool-analysis.md), [Aptos Validator Timelock](../decisions/aptos-validator-timelock.md)

---

## Summary

- **Upstream moved a lot.** From 1.38.5 to 1.49.6 upstream landed 1,371 squashed commits. These change about 1.2 million lines (+759,781 / −456,016) across 11,658 text files. That spans 11 minor releases and about 9 months of `main`.
- **atomica's real footprint is small but sits in the hottest area.** The fork changes 498 files, but 250 of them are formatting-only and 98 are deleted CI files. The real port surface is 62 edited upstream files (+1,179 / −472 lines) and 33 new code files (8,780 lines of Rust, 1,792 lines of Move).
- **Conflicts concentrate in DKG.** 368 upstream commits touch the 62 files atomica edits. The hottest paths are `crates/aptos-dkg/src/` (51 commits), `types/src/dkg/` (30 commits), and `consensus/src/epoch_manager.rs` (28 commits).
- **Upstream encryption is not a timelock.** Upstream decrypts encrypted transactions right after a block is ordered and before it executes. atomica needs bids sealed until an auction deadline, so the upstream pipeline cannot replace atomica's timelock. Some primitives may still be reusable.
- **atomica's Move contracts depend on fork-only modules.** `source/atomica-move-contracts` imports `aptos_framework::ibe_config` and `ibe_golden_vector_fixtures`. These must be carried forward in any upgrade.
- **The crypto changes are larger than the change list suggests.** atomica and upstream build on the same threshold BLS and chunked ElGamal foundations. Upstream's FPTX encryption and chunky DKG are newer and hardened. atomica's timelock has unverified key shares, malleable ciphertexts, and no DKG range proofs. See [f)](#f-cryptography-comparison).
- **Recommendation**: first strip the formatting churn from the fork. Then rebuild the timelock on `aptos-node-v1.49.6` using FPTX primitives inside atomica's own registry and natives (Option C in [g)](#g-timelock-upgrade-options)). Do not merge or rebase the branch as it stands.

---

## a) Latest stable releases

| Track | Tag | Date | Source available | Notes |
|---|---|---|---|---|
| Mainnet, latest | `aptos-node-v1.49.8-hotfix` | 2026-10-29 | No | Private hotfix. In the public repo this tag points at the same commit as `1.49.6`. |
| Mainnet, latest open source | `aptos-node-v1.49.6` | 2026-10-16 | Yes | Last release with public source. |
| Testnet release candidate | `aptos-node-v1.49.8-hotfix-rc` | 2026-10-28 | No | Not a stable release. |
| Aptos CLI | `aptos-cli-v9.6.0` | 2026-09-22 | Yes | Latest CLI release. |

The target for planning is `aptos-node-v1.49.6`. The 1.49.8 hotfix code cannot be read yet, so every figure in this report measures 1.49.6.

---

## b) Changelog since 1.38.5

| Measure | Value |
|---|---|
| Upstream commits (`facb34a558..aptos-node-v1.49.6`) | 1,371 (squash merges, one per PR) |
| Commits on `main` between the two fork points | 1,348 |
| Text files changed | 11,658 |
| Lines changed | +759,781 / −456,016 |
| Public mainnet releases with notes | 22 (`1.39.2` to `1.49.6`) |
| Private hotfix tags with no public notes | 16 |

Upstream `main` lands about 100 to 260 squashed commits a month. Each commit is a whole PR, so the commit count understates the size of the change. The line counts are the better measure.

### Where the lines changed

| Area | Lines changed | Files | Notes |
|---|---|---|---|
| `third_party/move` | ~484k | 6,595 | MonoMove VM, compiler v2, prover, test baselines |
| `aptos-move/framework` | ~277k | 646 | Mostly deletions. Generated docs removed (80 files to 1). Natives moved to a new crate. |
| `aptos-move/aptos-gas-calibration` | ~100k | 146 | Gas recalibration |
| `ecosystem/indexer-grpc` | ~40k | 137 | Indexer gRPC v2 |
| `consensus/src` | ~18k | 250 | Decryption pipeline, secret sharing, quorum store v2 |
| `crates/aptos-dkg` | ~18k | 103 | Chunky DKG, PVSS trait redesign |
| `storage/aptosdb` | ~17k | 186 | Hot state, legacy schema removal |
| `crates/indexer` | ~17k | 117 | Deleted (legacy in-node indexer) |
| `ecosystem/node-checker` | ~11k | 91 | Deleted |
| `crates/aptos-batch-encryption` | ~6k | 37 | New crate |
| `dkg/src` | ~4.5k | 21 | Chunky DKG manager |

---

## c) Major architecture changes versus minor fixes

This table classifies all 1,371 commits by the paths each one touches. A commit whose title names encryption or DKG is counted there first.

| Area | Commits | File touches | Classification |
|---|---|---|---|
| CI, docker, testsuite, tooling | 220 | 1,490 | Minor for runtime |
| Move VM runtime, including MonoMove | 186 | 4,461 | Major |
| Move compiler, prover, tools | 184 | 8,246 | Mixed. Large, but mostly outside the node runtime. |
| Move framework, natives, gas | 156 | 3,246 | Major |
| Encrypted transactions, batch encryption, secret sharing | 107 | 947 | Major |
| Storage and state sync | 96 | 1,876 | Major |
| Consensus and quorum store | 79 | 565 | Major |
| Other | 76 | 549 | Mostly minor |
| DKG (chunky, randomness, PVSS) | 72 | 990 | Major, and the highest atomica overlap |
| Networking and node config | 68 | 232 | Mixed |
| Types, API, indexer, SDK | 63 | 1,148 | Moderate |
| Block executor and execution | 43 | 405 | Major |
| Crypto outside DKG | 13 | 39 | Minor |
| Mempool | 8 | 36 | Moderate |

Major architectural changes, in order:

1. **Chunky DKG** joins the randomness DKG. It ran in shadow mode in 1.46 and was enabled at genesis in 1.48.2. Both `randomness_dkg.rs` and `chunky_dkg.rs` exist at 1.49.6.
2. **Encrypted transactions** use batch threshold encryption with a digest key (1.42 to 1.48). Decryption runs as a pipeline stage after ordering.
3. **BlockSTM v2** becomes the default executor (verified on validators in 1.46, default in 1.49.1).
4. **Hot state storage** moves into the default path (1.45 to 1.48).
5. **Legacy indexer and monolithic ledger storage** are removed (1.43 to 1.44).
6. **Move natives** move out of `aptos-move/framework/src/natives/` into a new `aptos-move/framework/natives` crate (1.43.1).
7. **Move 1 is removed** from the compiler. Compiler v2 with language version 2.4 and bytecode v10 becomes the default (1.44 to 1.49.1).
8. **MonoMove** is in development as a new VM. It has an Aptos transaction executor and replay benchmarks, but it is not the default.

De minimis changes: CI and docker work, dependency bumps, license headers, typo fixes, forge tuning, and Rust toolchain bumps.

---

## d) Breaking incompatibilities

### What atomica actually carries

The raw fork diff overstates the port surface. Most of it is noise.

| Fork change type | Files | Port cost |
|---|---|---|
| Formatting-only edits of upstream files | 250 | None. Drop them. They come from adding stable `rustfmt` to `rust-toolchain.toml`, while upstream formats with nightly `rustfmt`. |
| Deleted upstream files | 98 | Low. All are upstream CI files under `.github`. |
| New CI and docker files (7 under `.github/workflows`, 22 under `atomica/docker`) | 29 | Low to medium. Rebuild against the new upstream workflows. |
| New docs, golden vectors, and scripts under `atomica/` | 26 | None. Copy as is. |
| **Real edits of upstream files** | **62** | **High.** +1,179 / −472 lines. 54 of these files changed upstream, and 8 were removed upstream. |
| **New code files** (plus one git hook) | **33** | **High.** 8,780 lines of Rust and 1,792 lines of Move. They must be moved onto the new crate layout. |

The rows add up to the full fork diff of 498 files.

### Hotspots in the real edits

| atomica edit point | Upstream commits touching it | Upstream change |
|---|---|---|
| `crates/aptos-dkg/src/` (PVSS traits, dealt key shares, IBE) | 51 | PVSS traits redesigned (1.42.1). Aggregated type added. Chunky PVSS added. |
| `types/src/dkg/` | 30 | DKG types split into `randomness_dkg.rs` and `chunky_dkg.rs` (1.42.1). `mod.rs` lost 228 lines. |
| `consensus/src/epoch_manager.rs` | 28 | Chunky DKG manager and secret sharing wired in. |
| `aptos-move/framework/aptos-framework/sources/reconfiguration_with_dkg.move` | 11 | Chunky DKG reconfiguration added. |
| Move natives (`algebra/mod.rs`, `natives/mod.rs`) | 9 old path, 7 new path | Moved to the new `aptos-move/framework/natives` crate. atomica's `ibe.rs` native must move with them. |
| `aptos-move/aptos-vm/src/validator_txns/` | 8 | `chunky_dkg.rs` added beside `dkg.rs`. atomica's `timelock.rs` must fit the new validator transaction enum. |
| `aptos-move/framework/aptos-framework/sources/block.move` | 7 | Block metadata extended for decryption keys (1.42.1). |

### Other breaking changes

| Area | Upstream change (release) | atomica exposure | Severity |
|---|---|---|---|
| atomica Move contracts | Upstream has no `ibe_config` or `ibe_golden_vector_fixtures` module. | `source/atomica-move-contracts` imports both and pins `AptosFramework` to the `dev-atomica` branch. They break unless the modules are ported. | High |
| Encrypted payload primitives | Ciphertext ID now hashes the verification key and associated data (1.44.7). HKDF changed to RFC-5869 (1.42.1). Hash-to-curve replaced (1.42.1). Digest key file format changed (1.45.4). Config key `decryption_setup_blob_path` renamed to `digest_key_blob_path` (1.45.4). | Only matters if atomica adopts upstream `aptos-batch-encryption`. | High if adopted. None if not. |
| Move language features | Permissioned signers, resource access control, and aggregator V1 removed (1.49.1). Language versions below 2.2 dropped (1.49.1). Publishing gated on a minimum bytecode version (1.48.6). | Checked: `source/atomica-move-contracts` uses none of the removed features. | Low |
| Generated framework docs | Generated `doc/*.md` files removed from the tree. | atomica's edits to those docs are moot. Regenerate locally if needed. | None |
| Gas schedule | 10x multiplier on gas costs and storage fees (1.41.9 and 1.42). Gas schedule version bumped through v49. | Any gas expectation or fixture in tests and contracts must be recalibrated. | Medium |
| Storage and node database | Legacy monolithic ledger DB and `StateValueSchema` removed (1.44.7). Hot state DBs made non-optional (1.48.2). | A node database created at 1.38 may need a resync. Not tested. For a testnet, starting from fresh genesis avoids this. | Medium |
| Indexer | In-node legacy indexer deleted (1.43.1). | Only matters if atomica reads the in-node indexer. | Low to medium |
| API and clients | Fat type (de)serialization removed (1.48.2). Pruned reads return 410 (1.49.1). | `source/atomica-sdk` and API clients need checks. | Low to medium |
| Consensus wire format | Quorum store messages accept V2 entries only (1.46.2). Optimistic blocks rejected at ingress (1.49.1). | Matters only for mixed-version validator sets. | Low for a fresh network |
| Build toolchain | Rust minimum rises to 1.94. `move-cli`, `move-ir-compiler`, and `mvir` removed. CLI moved to `aptos-move-cli` (1.43.1). | Build scripts, CI, and the docker testnet need updates. | Medium |
| Forge local swarm | Local swarm changed for NUMA affinity and Sapling support (1.44.7). | `atomica-crosschain-testing` uses `aptos-forge` from the fork. Its API may have changed. | Medium |

### Effort estimate

This is a judgment call, not a measured figure. No build was run.

| Work item | Estimate |
|---|---|
| Drop formatting churn and deleted-CI noise from the fork | 1 to 2 days |
| Port the 33 new code files onto the new crate layout (natives crate, DKG type split) | 2 to 4 weeks |
| Rework the 62 real edits against 368 upstream commits, mostly in DKG | 2 to 4 weeks |
| Rebuild CI and the docker testnet image | about 1 week |
| Recalibrate gas, regenerate golden vectors, run smoke and cross-chain tests | 1 to 2 weeks |
| **Total** | **6 to 12 engineer-weeks** |

Confidence is low. The biggest unknown is whether atomica's dual-output DKG can stay on the randomness DKG path, which still exists at 1.49.6, or must move to chunky DKG.

---

## e) Improvements that help timelock, mempool, or general performance

### Timelock encryption

- **Upstream encryption does not replace the timelock.** The pipeline README at 1.49.6 places a Decrypt stage right after a block is ordered and before Prepare and Execute. The key arrives from validator secret sharing for that block. atomica needs bids sealed until a deadline height, which can be hours later. See [Aptos Validator Timelock](../decisions/aptos-validator-timelock.md).
- **Batch threshold encryption crate** (`crates/aptos-batch-encryption`, 37 files, new). It has IBE-style schemes, weighted and succinct variants, and digest key handling. It may be reusable as a primitive under atomica's timelock. That needs a separate crypto review.
- **Chunky DKG robustness** (1.45.4 to 1.49.4). Includes stall recovery, equivocation fixes, DoS hardening, transcript fetch retries, and restart recovery. This matters if atomica moves its DKG onto chunky DKG.
- **Persisted secret shares for recovery** (1.49.1). A pattern atomica's key release could reuse.
- **Encrypted payload fields**: `claimed_entry_fun` (1.45.4) lets an encrypted transaction name the call it makes. Sender binding to auth keys (1.45.4).

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

## f) Cryptography comparison

This section compares atomica's timelock crypto in `dev-atomica` with upstream's chunky DKG and FPTX encryption at 1.49.6. It comes from reading both trees.

### Shared foundations

- **Same core primitive.** atomica's decryption key is `H(id)^s` in G1, which is a BLS signature on the identity. Upstream's per-batch key is a "shifted BLS signature" on a digest, `(digest + H(mpk))^msk`. Both are threshold BLS signatures used as IBE keys, on BLS12-381.
- **Same DKG problem, same fix.** The DAS PVSS used for randomness hands out shares as G1 points. Encryption keys need scalar shares. atomica built `crates/aptos-dkg/src/pvss/scalar_elgamal`. Upstream finished `crates/aptos-dkg/src/pvss/chunky`. Both encrypt shares with chunked lifted ElGamal, in 16-bit chunks that each validator decrypts with a small discrete-log search.
- **Shared starting code.** The 1.38.5 base already held chunky's building blocks (`chunked_elgamal`, `hkzg_chunked_elgamal`, `keys`, `public_parameters`) and the DeKART range proofs. It had no chunky transcript yet. atomica built its own scalar PVSS beside these instead of finishing chunky.

### Side by side

| | atomica fork | Upstream 1.49.6 |
|---|---|---|
| Encryption scheme | Boneh-Franklin BasicIdent. The message is XORed with a SHA3 keystream derived from the pairing. | FPTX batch threshold encryption. A batch-IBE ciphertext wrapped with a one-time Ed25519 signature and AES-128-GCM. `FPTXWeighted` is the production variant. |
| Ciphertext tampering | Malleable. No integrity check. | Non-malleable. Validators must verify each ciphertext against its associated data. |
| Identity | One per timelock, `SHA3(DST, timelock_id, deadline_us)` | One per ciphertext, hashed from the one-time verification key and associated data |
| What a released key opens | Every ciphertext under that identity | Only ciphertexts in that batch. A KZG digest commits to the batch's IDs. Excluded ciphertexts stay sealed. |
| Key share checks | None. Shares are length-checked only. `verify_decryption_key` is called only from test code. | Pairing check on every share against per-validator verification keys |
| DKG secret | One secret serves both randomness and IBE ("dual output", ADR-001) | Chunky DKG runs its own secret for encryption |
| PVSS proofs | DLEQ proofs, a low-degree test, and a signature of knowledge. No range proofs. | Sigma protocol plus DeKART range proofs |
| Trusted setup | None | One-time powers-of-tau "digest key". It caps batch size and the number of rounds per epoch. |
| Curve library | blstrs | arkworks, the same library as Move's `crypto_algebra` natives |

### What is new upstream

FPTX is the new construction. Validators publish one constant-size key share per batch, whatever the batch size. The combined key decrypts only the ciphertexts committed in the batch digest. atomica's scheme has no equivalent. Chunky DKG is not new as a design. It is a hardened version of what atomica built in `scalar_elgamal`.

Placing these in the literature is my judgment, since the code cites no papers. atomica's IBE matches textbook Boneh-Franklin. Chunky matches the chunked-ElGamal non-interactive DKG family. FPTX matches published batched threshold encryption work.

### Security gaps in atomica's timelock code

These come from reading the code. No exploit was run.

1. **One bad share breaks a reveal.** `aptos-move/aptos-vm/src/validator_txns/timelock.rs` only checks that a share is 48 bytes. `ibe_config::finalize_timelock_reveal` never checks the result against the master public key. One faulty or malicious validator can make it store a wrong key. `is_revealed` then becomes true, so the reveal cannot be retried, and that auction's bids stay sealed for good.
2. **Bids can be forged from other bids.** `ibe_encrypt` XORs the bid with a keystream and adds no authentication. Anyone can flip bits in someone else's sealed bid and submit the copy. This is a known attack on sealed-bid auctions.
3. **No range proofs in the DKG.** `scalar_elgamal` verification has no bound on chunk size. A dishonest dealer can encrypt chunks too large to decrypt and still pass verification. Honest validators then cannot recover their shares. Upstream's chunky PVSS adds DeKART range proofs for this reason.
4. **One secret serves two protocols.** Randomness and IBE share the secret `a`. Safety depends on domain separation between the randomness hashing and the IBE hashing. This needs a crypto review. No break was found.

The fork's `atomica/docs/technical/ibe-summary.md` says the master secret is rebuilt from scalar shares. The on-chain path actually combines G1 shares through `reconstruct_ibe_dk_from_g1_shares`, which never exposes the secret. The doc is stale.

---

## g) Timelock upgrade options

| Option | What it is | Fixes gaps | Port cost |
|---|---|---|---|
| A. Harden Boneh-Franklin | Keep atomica's IBE. Add per-share pairing checks and a CCA wrapper built from upstream's AES-GCM and one-time signature pieces. | 1 and 2. Gaps 3 and 4 remain unless the secret moves to chunky DKG. | High. All fork-only crypto must be ported. |
| B. FPTX inside consensus | Run upstream's encrypted mempool on a deadline schedule. Hold an auction's bids, then release one batch key at the deadline. | 1, 2, and 3 | High. Needs custom consensus policy in the decryption pipeline. |
| **C. FPTX inside atomica's natives** | Keep atomica's deadline registry, validator transaction, and Move API. Replace the crypto underneath with FPTX primitives. | **1, 2, 3, and 4** if the secret comes from a separate chunky DKG output | **Lowest.** Retires `scalar_elgamal`, the dual-output DKG, and the Boneh-Franklin code. |

### Option C flow

`aptos-batch-encryption` is a standalone library crate. Its trait covers encryption with associated data, digests, share derivation, share verification, key reconstruction, and decryption. None of it is tied to consensus.

1. **Encrypt bids** as FPTX ciphertexts. Bind the associated data to the auction ID and the bidder.
2. **At the deadline, compute one digest** over that auction's bid IDs. It replaces the `(timelock_id, deadline)` identity.
3. **Validators derive key shares** for the digest. They submit them through atomica's timelock validator transaction.
4. **Verify every share** with `verify_decryption_key_share` before accepting it. Then verify the rebuilt key.
5. **Decrypt each bid** with its evaluation proof. Anyone holding the public digest key can compute the proofs.

### Option C constraints

- **Round allocation.** The digest key holds a fixed number of rounds per epoch. The encrypted mempool already uses one round per key-producing block and marks transactions `TrustedSetupExhausted` when rounds run out (`consensus/src/pipeline/decryption_pipeline_builder.rs`). Each auction reveal needs its own round. Never issue two keys for the same round under the same secret. Either reserve rounds through consensus, or run a separate digest key with its own trusted setup.
- **Key separation.** Reusing the mempool's secret for timelock reveals needs a cryptographer's sign-off. The safer default is a separate secret, or at least a separate offset domain.
- **Batch size.** A digest holds at most `max_batch_size` IDs. That caps bids per auction. The production value is in the digest key file, which was not available. Size the setup for the largest auction.
- **Epoch boundaries.** FPTX secrets are per epoch, as atomica's master public key already is. `register_timelock` records no epoch. A reveal after an epoch change would use the wrong validators' shares. This is an open risk in [Aptos Validator Timelock](../decisions/aptos-validator-timelock.md), and Option C does not fix it.
- **Node-side code is still needed.** Validators hold their secret shares in the node, so node code must derive and submit shares. Share verification should run in Rust in the validator transaction handler. The weighted check runs one pairing per virtual player, which would be costly as metered Move natives.

---

## Confidence

- **High**: release tags and dates, commit and line counts, the fork breakdown (formatting-only, deleted, real edits, new files), the upstream commit counts on atomica's edit points, and the upstream decrypt-after-ordering design.
- **Medium**: the subsystem classification, since it assigns each commit to one area by path majority. Also the four security gaps in [f)](#f-cryptography-comparison), which come from reading code without running an exploit.
- **Low**: the effort range and the node database migration risk. Neither has been tested. Also the literature placement of the schemes.

## Open questions

1. How should Option C allocate FPTX rounds: reserved from the mempool's counter, or a separate digest key?
2. Should timelock reveals use a separate secret from the encrypted mempool? This needs a cryptographer.
3. What batch size must the digest key support for the largest auction?
4. How should auctions that cross an epoch boundary be handled?
5. Does `atomica-crosschain-testing` still build against the upstream forge crate?
6. Can a node database created at 1.38 migrate to 1.49 without a resync? This matters only for long-lived networks.

## Correction to the v1.38 analysis

[Aptos v1.38 Integration Analysis](../decisions/aptos-v1-38-integration-analysis.md) (December 9, 2025) says v1.38 already includes `EncryptedPayload` and `aptos-batch-encryption`. The `aptos-node-v1.38.5` tag contains neither. The release notes place the first encrypted payload type in the 1.39 line, and the batch encryption crate in the 1.42 line. That doc should be marked superseded by this report.

## Next step

Write a short design doc for Option C. Settle round allocation and key separation first, since both are security decisions. Then prototype Option C as a Rust test outside consensus: encrypt bids, compute a digest, derive and verify shares, and decrypt. Build it on `aptos-node-v1.49.6` in a worktree under `~/tmp/superfield-worktrees/atomica-aptos/`, after reverting the formatting-only files.

---

## Revision note

The first version of this report, committed as `b34e7cc`, had these errors:

- It called the target 1.49.8. The public 1.49.8 hotfix tag is the 1.49.6 commit, so all figures measure 1.49.6.
- It sized upstream change by commit count alone. Each commit is a squashed PR. Line counts (about 1.2 million) show the true scale.
- It classified only release-note titles, which miss about 335 commits. This version classifies all 1,371 commits by path.
- It said all 310 shared files atomica touched also changed upstream. 250 of those edits are formatting-only and carry no port cost. The real surface is 62 edited files and 33 new code files.
- It left the decryption timing unconfirmed. The upstream pipeline README confirms decryption right after ordering.
- It left the Move contract exposure open. The contracts use no removed features, but they depend on the fork-only `ibe_config` module.

A second revision added [f)](#f-cryptography-comparison) and [g)](#g-timelock-upgrade-options). It compares the DKG and encryption crypto in detail, lists security gaps in atomica's timelock, and recommends Option C.
