# Exhaustive path-level delta inventory

**Local evidence, regenerated November 4, 2026.** This inventory covers the complete 577-path union of two upstream-relative diffs. It does not certify semantic preservation of every changed hunk. An absent delta can be an intentional relocation or replacement. A new delta means a new difference from upstream, which may be a deletion rather than a newly added file.

The comparison uses these snapshots:

| Snapshot | Git reference | Full commit |
|---|---|---|
| Old upstream | `aptos-node-v1.38.5` | `facb34a55849fd4ab6f70149b32cde3e87d6c314` |
| Old fork | `125d36b957` | `125d36b95736ef782806afdcdf842858a0d325dd` |
| New upstream | `aptos-node-v1.49.6` | `b4359185dd8f18b4ee9b7eba3d3e73af40a5e487` |
| Reviewed fork | `e41b69f662` | `e41b69f662cde4c40953b9576088f997bb31a126` |

Reproduce the path sets in the fork repository:

```bash
git diff --name-only aptos-node-v1.38.5 125d36b957
git diff --name-only aptos-node-v1.49.6 e41b69f662
```

The old comparison has 498 paths; the new comparison has 260. Their union has 577 paths. Object presence and object IDs were read from successful `git ls-tree -r <ref>` calls for all four snapshots. Every command failure aborts regeneration. Missing blobs are classified as retained deletions only when both upstream snapshots contain the file and both fork snapshots omit it. They are not counted as identical existing files.

| Mechanical classification | Paths |
|---|---:|
| Old delta absent at original path; inspect replacement or relocation | 66 |
| Reworked or rebased delta; semantic review required | 45 |
| Existing file unchanged byte-for-byte | 39 |
| Upstream deletion retained | 97 |
| New upstream-relative delta at upgrade | 79 |
| Old deletion also absent in new upstream | 1 |
| Old delta absent; old text differs only under normalization | 250 |
| **Total** | **577** |

The 250 normalization-equivalent old deltas are candidates for formatting-only changes, not a syntax-aware proof. The comparison removes all whitespace and commas immediately before `)`, `]`, or `}` from the old upstream and old fork text. Such removal can also affect string literals or comments. These rows only establish that the old text matches under that transformation and that no upstream-relative delta remains at the same path in the reviewed fork. Do not interpret them as independently verified semantic equivalence or evidence that upstream adopted an Atomica patch.

The 39 identical existing files and 98 retained deletions replace the earlier misleading count of 137 byte-identical survivals. The remaining 66 absent-at-original-path deltas, 45 reworked deltas, and 79 new upstream-relative deltas require semantic review beyond this mechanical inventory. Critical runtime findings are documented in the [upgrade review](aptos-1-49-6-upgrade-review.md).

| Path | Mechanical status |
|---|---|
| `.cargo/config.toml` | Old delta absent at original path; inspect replacement or relocation |
| `.dockerignore` | Reworked or rebased delta; semantic review required |
| `.githooks/pre-push` | Existing file unchanged byte-for-byte |
| `.github/ISSUE_TEMPLATE/bug_report.md` | Upstream deletion retained |
| `.github/ISSUE_TEMPLATE/config.yml` | Upstream deletion retained |
| `.github/ISSUE_TEMPLATE/dev_portal_issue.md` | Upstream deletion retained |
| `.github/ISSUE_TEMPLATE/devex_rfc.md` | Upstream deletion retained |
| `.github/ISSUE_TEMPLATE/feature_request.md` | Upstream deletion retained |
| `.github/PULL_REQUEST_TEMPLATE.md` | Upstream deletion retained |
| `.github/actionlint.yaml` | Upstream deletion retained |
| `.github/actions/buildx-setup/action.yml` | Upstream deletion retained |
| `.github/actions/cli-rust-setup/action.yaml` | Upstream deletion retained |
| `.github/actions/determine-or-use-target-branch-and-get-last-released-image/action.yaml` | Upstream deletion retained |
| `.github/actions/docker-setup/action.yaml` | Upstream deletion retained |
| `.github/actions/file-change-determinator/action.yaml` | Upstream deletion retained |
| `.github/actions/fullnode-sync/action.yaml` | Upstream deletion retained |
| `.github/actions/fullnode-sync/fullnode_sync.py` | Upstream deletion retained |
| `.github/actions/fullnode-sync/requirements.txt` | Upstream deletion retained |
| `.github/actions/general-lints/action.yaml` | Upstream deletion retained |
| `.github/actions/get-latest-cli/action.yaml` | Upstream deletion retained |
| `.github/actions/get-latest-docker-image-tag/action.yml` | Upstream deletion retained |
| `.github/actions/install-grpcurl/action.yml` | Upstream deletion retained |
| `.github/actions/install-grpcurl/install_grpcurl.sh` | Upstream deletion retained |
| `.github/actions/move-prover-setup/action.yaml` | Upstream deletion retained |
| `.github/actions/python-setup/action.yaml` | Upstream deletion retained |
| `.github/actions/release-aptos-node/action.yml` | Upstream deletion retained |
| `.github/actions/release-aptos-node/bump_aptos_node_version.py` | Upstream deletion retained |
| `.github/actions/run-faucet-tests/action.yaml` | Upstream deletion retained |
| `.github/actions/run-rust-client-tests/action.yaml` | Upstream deletion retained |
| `.github/actions/rust-batch-encryption/action.yaml` | New upstream-relative delta at upgrade |
| `.github/actions/rust-check-merge-base/action.yaml` | Upstream deletion retained |
| `.github/actions/rust-doc-tests/action.yaml` | Upstream deletion retained |
| `.github/actions/rust-lints/action.yaml` | Upstream deletion retained |
| `.github/actions/rust-setup/action.yaml` | Upstream deletion retained |
| `.github/actions/rust-smoke-tests/action.yaml` | Old deletion also absent in new upstream |
| `.github/actions/rust-targeted-unit-tests/action.yaml` | Upstream deletion retained |
| `.github/actions/rust-unit-tests/action.yaml` | Upstream deletion retained |
| `.github/actions/rust-unit-tests/nextest_summary.py` | Upstream deletion retained |
| `.github/actions/test-target-determinator/action.yaml` | Upstream deletion retained |
| `.github/actions/wait-images-ci/action.yaml` | Upstream deletion retained |
| `.github/dep-auditors.json` | Upstream deletion retained |
| `.github/dependabot.yml` | Upstream deletion retained |
| `.github/github-readme.md` | Upstream deletion retained |
| `.github/linters/semgrep/disallow-schedule-trigger.yaml` | Upstream deletion retained |
| `.github/linters/semgrep/pull-request-target-code-checkout.yaml` | Upstream deletion retained |
| `.github/runs-on.yml` | Upstream deletion retained |
| `.github/scripts/assert_tests_ran.py` | New upstream-relative delta at upgrade |
| `.github/scripts/run-tests-guarded.sh` | New upstream-relative delta at upgrade |
| `.github/scripts/tests/failed.log` | New upstream-relative delta at upgrade |
| `.github/scripts/tests/nosummary.log` | New upstream-relative delta at upgrade |
| `.github/scripts/tests/ok.log` | New upstream-relative delta at upgrade |
| `.github/scripts/tests/selftest.sh` | New upstream-relative delta at upgrade |
| `.github/scripts/tests/zero.log` | New upstream-relative delta at upgrade |
| `.github/ts-tasks/package.json` | Upstream deletion retained |
| `.github/ts-tasks/pnpm-lock.yaml` | Upstream deletion retained |
| `.github/ts-tasks/prune-github-workflow-runs.ts` | Upstream deletion retained |
| `.github/ts-tasks/tsconfig.json` | Upstream deletion retained |
| `.github/workflows/README.md` | Reworked or rebased delta; semantic review required |
| `.github/workflows/adhoc-forge.yaml` | Upstream deletion retained |
| `.github/workflows/aptos-node-release.yaml` | Upstream deletion retained |
| `.github/workflows/backport-to-release-branches.yaml` | Upstream deletion retained |
| `.github/workflows/binary-release.yaml` | New upstream-relative delta at upgrade |
| `.github/workflows/build-aptos-binary.yml` | Reworked or rebased delta; semantic review required |
| `.github/workflows/build-validator-image.yml` | Reworked or rebased delta; semantic review required |
| `.github/workflows/bump-release-version.yaml` | Upstream deletion retained |
| `.github/workflows/calibrate-execution-performance.yaml` | New upstream-relative delta at upgrade |
| `.github/workflows/cargo-metadata-upload.yaml` | Upstream deletion retained |
| `.github/workflows/check-minimum-revision.yaml` | Upstream deletion retained |
| `.github/workflows/cli-e2e-tests.yaml` | Upstream deletion retained |
| `.github/workflows/cli-external-deps.yaml` | Upstream deletion retained |
| `.github/workflows/cli-release.yaml` | Upstream deletion retained |
| `.github/workflows/close-stale-issues.yaml` | Upstream deletion retained |
| `.github/workflows/codeql-analysis.yaml` | Upstream deletion retained |
| `.github/workflows/copy-images-to-dockerhub-nightly.yaml` | Upstream deletion retained |
| `.github/workflows/copy-images-to-dockerhub-release.yaml` | Upstream deletion retained |
| `.github/workflows/copy-images-to-dockerhub.yaml` | Upstream deletion retained |
| `.github/workflows/coverage-move-only.yaml` | Upstream deletion retained |
| `.github/workflows/coverage.yaml` | Upstream deletion retained |
| `.github/workflows/crypto-crates-tests.yml` | Reworked or rebased delta; semantic review required |
| `.github/workflows/cut-release-branch.yaml` | Upstream deletion retained |
| `.github/workflows/debug-tests.yml` | Reworked or rebased delta; semantic review required |
| `.github/workflows/docker-build-rosetta.yaml` | Upstream deletion retained |
| `.github/workflows/docker-build-test.yaml` | Upstream deletion retained |
| `.github/workflows/docker-update-images.yaml` | Upstream deletion retained |
| `.github/workflows/execution-performance.yaml` | Upstream deletion retained |
| `.github/workflows/faucet-tests-main.yaml` | Upstream deletion retained |
| `.github/workflows/faucet-tests-prod.yaml` | Upstream deletion retained |
| `.github/workflows/find-packages-with-undeclared-feature-dependencies.yaml` | Upstream deletion retained |
| `.github/workflows/forge-continuous-land-blocking-test.yaml` | Upstream deletion retained |
| `.github/workflows/forge-stable.yaml` | Upstream deletion retained |
| `.github/workflows/fuzzer-data-update.yml` | Upstream deletion retained |
| `.github/workflows/indexer-processor-testing.yaml` | Upstream deletion retained |
| `.github/workflows/indexer-protos-sdk-update.yaml` | Upstream deletion retained |
| `.github/workflows/lean.yaml` | New upstream-relative delta at upgrade |
| `.github/workflows/lint-format.yml` | Reworked or rebased delta; semantic review required |
| `.github/workflows/lint-test.yaml` | Upstream deletion retained |
| `.github/workflows/module-verify.yaml` | Upstream deletion retained |
| `.github/workflows/mono-move-micro-bench.yaml` | New upstream-relative delta at upgrade |
| `.github/workflows/move-flow-release.yaml` | New upstream-relative delta at upgrade |
| `.github/workflows/node-api-compatibility-tests.yaml` | Upstream deletion retained |
| `.github/workflows/node-framework-tests.yml` | New upstream-relative delta at upgrade |
| `.github/workflows/prover-daily-test.yaml` | Upstream deletion retained |
| `.github/workflows/provision-replay-verify-archive-disks.yaml` | Upstream deletion retained |
| `.github/workflows/prune-old-workflow-runs.yaml` | Upstream deletion retained |
| `.github/workflows/rate-limit.yaml` | New upstream-relative delta at upgrade |
| `.github/workflows/replay-verify-mainnet.yaml` | Upstream deletion retained |
| `.github/workflows/replay-verify-testnet.yaml` | Upstream deletion retained |
| `.github/workflows/run-fullnode-sync.yaml` | Upstream deletion retained |
| `.github/workflows/run-gas-calibration.yaml` | Upstream deletion retained |
| `.github/workflows/rust-client-tests.yaml` | Upstream deletion retained |
| `.github/workflows/semgrep.yaml` | Upstream deletion retained |
| `.github/workflows/smoke-tests.yaml` | New upstream-relative delta at upgrade |
| `.github/workflows/terraform-freeze.yaml` | Upstream deletion retained |
| `.github/workflows/test-copy-images-to-dockerhub.yaml` | Upstream deletion retained |
| `.github/workflows/test-docker-image.yml` | Reworked or rebased delta; semantic review required |
| `.github/workflows/timelock-tests.yml` | New upstream-relative delta at upgrade |
| `.github/workflows/trigger-release-branch-validation.yaml` | Upstream deletion retained |
| `.github/workflows/windows-build.yaml` | Upstream deletion retained |
| `.github/workflows/workflow-run-docker-rust-build.yaml` | Upstream deletion retained |
| `.github/workflows/workflow-run-execution-performance.yaml` | Upstream deletion retained |
| `.github/workflows/workflow-run-forge.yaml` | Upstream deletion retained |
| `.github/workflows/workflow-run-module-verify.yaml` | Upstream deletion retained |
| `.github/workflows/workflow-run-replay-verify-archive-storage-provision.yaml` | Upstream deletion retained |
| `.github/workflows/workflow-run-replay-verify-on-archive.yaml` | Upstream deletion retained |
| `.github/workflows/workflow-run-replay-verify.yaml` | Upstream deletion retained |
| `Cargo.lock` | Reworked or rebased delta; semantic review required |
| `Cargo.toml` | Reworked or rebased delta; semantic review required |
| `api/src/tests/modules.rs` | Old delta absent; old text differs only under normalization |
| `api/src/tests/multisig_transactions_test.rs` | Old delta absent; old text differs only under normalization |
| `api/src/tests/simulation_test.rs` | Old delta absent; old text differs only under normalization |
| `api/src/tests/transaction_vector_test.rs` | Old delta absent; old text differs only under normalization |
| `api/types/src/move_types.rs` | Old delta absent; old text differs only under normalization |
| `api/types/src/transaction.rs` | Reworked or rebased delta; semantic review required |
| `aptos-move/aptos-aggregator/src/delta_change_set.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/aptos-gas-meter/src/algebra.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/aptos-gas-profiling/src/render.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/aptos-gas-profiling/src/report.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/aptos-release-builder/src/simulate.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/aptos-sdk-builder/src/common.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/aptos-sdk-builder/src/rust.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/aptos-transactional-test-harness/src/aptos_test_harness.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/aptos-transactional-test-harness/tests/tests.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/aptos-vm-profiling/src/bins/run_move.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/aptos-vm-types/src/storage/io_pricing.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/aptos-vm-types/src/storage/space_pricing.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/aptos-vm-types/src/tests/test_output.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/aptos-vm/Cargo.toml` | Reworked or rebased delta; semantic review required |
| `aptos-move/aptos-vm/src/system_module_names.rs` | Reworked or rebased delta; semantic review required |
| `aptos-move/aptos-vm/src/validator_txns/dkg.rs` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/aptos-vm/src/validator_txns/mod.rs` | Reworked or rebased delta; semantic review required |
| `aptos-move/aptos-vm/src/validator_txns/timelock.rs` | Reworked or rebased delta; semantic review required |
| `aptos-move/aptos-vm/src/validator_txns/timelock_dkg.rs` | New upstream-relative delta at upgrade |
| `aptos-move/aptos-vm/src/verifier/transaction_arg_validation.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/block-executor/src/cold_validation.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/block-executor/src/scheduler_status.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/block-executor/src/scheduler_v2.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/block-executor/src/view.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-benchmark/src/gas_profiling.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-benchmark/src/main.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/Cargo.toml` | New upstream-relative delta at upgrade |
| `aptos-move/e2e-move-tests/src/aggregator_v2.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/aptos_governance.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/resource_groups.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/tests/aggregator.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/tests/aggregator_v2_events.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/tests/aggregator_v2_runtime_checks.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/tests/events.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/tests/fee_payer.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/tests/function_value_depth.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/tests/fungible_asset.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/tests/gas.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/tests/ibe_gas.data/p/Move.toml` | New upstream-relative delta at upgrade |
| `aptos-move/e2e-move-tests/src/tests/ibe_gas.data/p/sources/test.move` | New upstream-relative delta at upgrade |
| `aptos-move/e2e-move-tests/src/tests/ibe_gas.rs` | New upstream-relative delta at upgrade |
| `aptos-move/e2e-move-tests/src/tests/keyless_feature_gating.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/tests/metadata.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/tests/mod.rs` | New upstream-relative delta at upgrade |
| `aptos-move/e2e-move-tests/src/tests/resource_groups.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/tests/scripts.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/tests/state_metadata.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/tests/string_args.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/tests/timelock_dkg.rs` | New upstream-relative delta at upgrade |
| `aptos-move/e2e-move-tests/src/tests/timelock_share.rs` | New upstream-relative delta at upgrade |
| `aptos-move/e2e-move-tests/src/tests/token_objects.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-move-tests/src/tests/transaction_context.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-tests/src/executor.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-testsuite/src/tests/invariant_violation.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/e2e-testsuite/src/tests/verify_txn.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/framework/Cargo.toml` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/aptos-framework/doc/block.md` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/aptos-framework/doc/genesis.md` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/aptos-framework/doc/ibe_config.md` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/aptos-framework/doc/ibe_golden_vector_fixtures.md` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/aptos-framework/doc/overview.md` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/aptos-framework/doc/reconfiguration_with_dkg.md` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/aptos-framework/doc/timelock_config.md` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/aptos-framework/sources/block.move` | Reworked or rebased delta; semantic review required |
| `aptos-move/framework/aptos-framework/sources/genesis.move` | Reworked or rebased delta; semantic review required |
| `aptos-move/framework/aptos-framework/sources/ibe_config.move` | Reworked or rebased delta; semantic review required |
| `aptos-move/framework/aptos-framework/sources/ibe_golden_vector_fixtures.move` | Reworked or rebased delta; semantic review required |
| `aptos-move/framework/aptos-framework/sources/reconfiguration_with_dkg.move` | Reworked or rebased delta; semantic review required |
| `aptos-move/framework/aptos-framework/sources/reconfiguration_with_dkg.spec.move` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/aptos-framework/sources/timelock_dkg.move` | New upstream-relative delta at upgrade |
| `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move` | New upstream-relative delta at upgrade |
| `aptos-move/framework/aptos-framework/tests/ibe_golden_vector_tests.move` | New upstream-relative delta at upgrade |
| `aptos-move/framework/aptos-framework/tests/ibe_native_test.move` | Reworked or rebased delta; semantic review required |
| `aptos-move/framework/aptos-framework/tests/timelock_dkg_tests.move` | New upstream-relative delta at upgrade |
| `aptos-move/framework/aptos-framework/tests/timelock_workflow_test.move` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/aptos-stdlib/doc/crypto_algebra.md` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/aptos-stdlib/doc/ibe.md` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/aptos-stdlib/doc/overview.md` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/aptos-stdlib/sources/cryptography/crypto_algebra.move` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/aptos-stdlib/sources/cryptography/ibe.move` | Reworked or rebased delta; semantic review required |
| `aptos-move/framework/cached-packages/src/aptos_framework_sdk_builder.rs` | Reworked or rebased delta; semantic review required |
| `aptos-move/framework/cached-packages/src/head.mrb` | New upstream-relative delta at upgrade |
| `aptos-move/framework/move-stdlib/src/natives/bcs.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/framework/natives/Cargo.toml` | New upstream-relative delta at upgrade |
| `aptos-move/framework/natives/src/lib.rs` | New upstream-relative delta at upgrade |
| `aptos-move/framework/natives/src/timelock.rs` | New upstream-relative delta at upgrade |
| `aptos-move/framework/src/built_package.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/framework/src/natives/aggregator_natives/context.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/framework/src/natives/cryptography/algebra/ibe-architecture.md` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/src/natives/cryptography/algebra/ibe-test-plan.md` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/src/natives/cryptography/algebra/ibe.rs` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/src/natives/cryptography/algebra/ibe_tests.rs` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/src/natives/cryptography/algebra/mod.rs` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/framework/src/natives/mod.rs` | Old delta absent at original path; inspect replacement or relocation |
| `aptos-move/mvhashmap/src/unit_tests/mod.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/mvhashmap/src/versioned_delayed_fields.rs` | Old delta absent; old text differs only under normalization |
| `aptos-move/script-composer/src/builder.rs` | Old delta absent; old text differs only under normalization |
| `aptos-node/Cargo.toml` | Reworked or rebased delta; semantic review required |
| `aptos-node/src/lib.rs` | Reworked or rebased delta; semantic review required |
| `aptos-node/src/main.rs` | Reworked or rebased delta; semantic review required |
| `aptos-node/src/state_sync.rs` | New upstream-relative delta at upgrade |
| `atomica/docker/.dockerignore` | Existing file unchanged byte-for-byte |
| `atomica/docker/Dockerfile` | Reworked or rebased delta; semantic review required |
| `atomica/docker/README.md` | Existing file unchanged byte-for-byte |
| `atomica/docker/tests/.gitignore` | Existing file unchanged byte-for-byte |
| `atomica/docker/tests/CRITICAL_FINDING.md` | Existing file unchanged byte-for-byte |
| `atomica/docker/tests/DEBUG_DOCKER_TESTNET_PLAN.md` | Existing file unchanged byte-for-byte |
| `atomica/docker/tests/DEBUG_FINDINGS.md` | Existing file unchanged byte-for-byte |
| `atomica/docker/tests/FINAL_STATUS.md` | Existing file unchanged byte-for-byte |
| `atomica/docker/tests/INVESTIGATION_RESULTS.md` | Existing file unchanged byte-for-byte |
| `atomica/docker/tests/README.md` | Reworked or rebased delta; semantic review required |
| `atomica/docker/tests/SUCCESS_SUMMARY.md` | Existing file unchanged byte-for-byte |
| `atomica/docker/tests/SUMMARY.md` | Existing file unchanged byte-for-byte |
| `atomica/docker/tests/bun.lock` | Existing file unchanged byte-for-byte |
| `atomica/docker/tests/docker-compose.yaml` | Reworked or rebased delta; semantic review required |
| `atomica/docker/tests/generate-genesis-host.sh` | Reworked or rebased delta; semantic review required |
| `atomica/docker/tests/generate-genesis.sh` | Reworked or rebased delta; semantic review required |
| `atomica/docker/tests/package.json` | Existing file unchanged byte-for-byte |
| `atomica/docker/tests/test-comparison.sh` | Existing file unchanged byte-for-byte |
| `atomica/docker/tests/test-latest.sh` | Existing file unchanged byte-for-byte |
| `atomica/docker/tests/test-network.ts` | Existing file unchanged byte-for-byte |
| `atomica/docker/tests/test-prior.sh` | Existing file unchanged byte-for-byte |
| `atomica/docker/tests/tsconfig.json` | Existing file unchanged byte-for-byte |
| `atomica/docs/adr/adr-001-dual-output-dkg.md` | Reworked or rebased delta; semantic review required |
| `atomica/docs/decisions/aptos-upgrade-crypto-review-packet.md` | New upstream-relative delta at upgrade |
| `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md` | New upstream-relative delta at upgrade |
| `atomica/docs/decisions/aptos-upgrade-option-c-spec.md` | New upstream-relative delta at upgrade |
| `atomica/docs/decisions/auction-v2-bid-wrapper.md` | New upstream-relative delta at upgrade |
| `atomica/docs/decisions/crosschain-forge-compat.md` | New upstream-relative delta at upgrade |
| `atomica/docs/decisions/db-migration-assessment.md` | New upstream-relative delta at upgrade |
| `atomica/docs/decisions/port-real-edits-classification.md` | New upstream-relative delta at upgrade |
| `atomica/docs/decisions/sdk-api-client-compat.md` | New upstream-relative delta at upgrade |
| `atomica/docs/decisions/sdk-auction-settled-event-source.md` | New upstream-relative delta at upgrade |
| `atomica/docs/definitions.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/developer-guides/code-review-guide.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/developer-guides/docker-testnet.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/developer-guides/smoke-test-debugging.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/developer-guides/testing.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/developer-guides/validator-event-subscription.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/plan/ibe-implementation-vs-plan.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/plan/implementation-plan-unified-dkg-ibe.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/plan/timelock-ibe-elgamal-plan.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/product-spec/atomica-timelock-spec.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/product-spec/dkg-overview.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/prompts/implement-dk-share-aggregation-test.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/prompts/implement-on-chain-ibe-test.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/technical/chunked-elgamal-scalar-generation.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/technical/ibe-summary.md` | Reworked or rebased delta; semantic review required |
| `atomica/docs/technical/prior-art-aptos-apache.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/technical/prior-art-aptos-bibe-apache.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/technical/prior-art-drand.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/testing/golden-vectors-implementation.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/testing/ibe-golden-tests-summary.md` | Existing file unchanged byte-for-byte |
| `atomica/docs/testing/ibe-test-review-report.md` | Existing file unchanged byte-for-byte |
| `atomica/golden_vectors/README.md` | Reworked or rebased delta; semantic review required |
| `atomica/golden_vectors/ibe_golden_vectors.json` | Old delta absent at original path; inspect replacement or relocation |
| `atomica/golden_vectors/ibe_golden_vectors.txt` | Old delta absent at original path; inspect replacement or relocation |
| `atomica/golden_vectors/ibe_v2_golden_vectors.json` | New upstream-relative delta at upgrade |
| `atomica/golden_vectors/legacy-v1/ibe_golden_vectors.json` | New upstream-relative delta at upgrade |
| `atomica/golden_vectors/legacy-v1/ibe_golden_vectors.txt` | New upstream-relative delta at upgrade |
| `atomica/proto-fptx-timelock/.gitignore` | New upstream-relative delta at upgrade |
| `atomica/proto-fptx-timelock/Cargo.lock` | New upstream-relative delta at upgrade |
| `atomica/proto-fptx-timelock/Cargo.toml` | New upstream-relative delta at upgrade |
| `atomica/proto-fptx-timelock/README.md` | New upstream-relative delta at upgrade |
| `atomica/proto-fptx-timelock/rust-toolchain.toml` | New upstream-relative delta at upgrade |
| `atomica/proto-fptx-timelock/src/lib.rs` | New upstream-relative delta at upgrade |
| `atomica/proto-fptx-timelock/tests/timelock.rs` | New upstream-relative delta at upgrade |
| `atomica/scripts/generate_move_fixtures.py` | Existing file unchanged byte-for-byte |
| `atomica/scripts/storage_schema_diff.py` | New upstream-relative delta at upgrade |
| `config/src/config/consensus_config.rs` | New upstream-relative delta at upgrade |
| `consensus/src/block_storage/execution_pool/target_block_retrieval_test.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/consensus_observer/network/observer_message.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/consensus_observer/observer/subscription_manager.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/consensus_observer/publisher/consensus_publisher.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/dag/tests/fetcher_test.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/dag/tests/integration_tests.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/dag/tests/rb_handler_tests.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/dag/tests/types_test.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/epoch_manager.rs` | Old delta absent at original path; inspect replacement or relocation |
| `consensus/src/liveness/proposal_generator.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/network.rs` | Old delta absent at original path; inspect replacement or relocation |
| `consensus/src/network_tests.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/pipeline/buffer.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/pipeline/buffer_item.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/pipeline/decryption_pipeline_builder.rs` | New upstream-relative delta at upgrade |
| `consensus/src/quorum_store/batch_proof_queue.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/quorum_store/proof_manager.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/quorum_store/tests/proof_manager_test.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/round_manager_tests/txn_filter_proposal_test.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/transaction_shuffler/use_case_aware/tests/mod.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/twins/basic_twins_test.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/twins/twins_node.rs` | Old delta absent; old text differs only under normalization |
| `consensus/src/util/mod.rs` | Reworked or rebased delta; semantic review required |
| `crates/aptos-api-tester/src/counters.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-crypto/Cargo.toml` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-crypto/src/unit_tests/bcs_test.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-crypto/src/unit_tests/multi_ed25519_test.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-dkg/Cargo.toml` | Reworked or rebased delta; semantic review required |
| `crates/aptos-dkg/aptos-move/framework/aptos-framework/sources/ibe_golden_vector_fixtures.move` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/atomica/golden_vectors/ibe_golden_vectors.json` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/atomica/golden_vectors/ibe_golden_vectors.txt` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/benches/pvss.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/benches/weighted_vuf.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/src/dlog/table.rs` | New upstream-relative delta at upgrade |
| `crates/aptos-dkg/src/ibe/ciphertext.rs` | Reworked or rebased delta; semantic review required |
| `crates/aptos-dkg/src/ibe/golden_vectors.rs` | Reworked or rebased delta; semantic review required |
| `crates/aptos-dkg/src/ibe/mod.rs` | Reworked or rebased delta; semantic review required |
| `crates/aptos-dkg/src/ibe/tests.rs` | Reworked or rebased delta; semantic review required |
| `crates/aptos-dkg/src/ibe/timelock_tests.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/src/lib.rs` | Reworked or rebased delta; semantic review required |
| `crates/aptos-dkg/src/pcs/univariate_hiding_kzg.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-dkg/src/pvss/chunky/mod.rs` | New upstream-relative delta at upgrade |
| `crates/aptos-dkg/src/pvss/chunky/public_parameters.rs` | New upstream-relative delta at upgrade |
| `crates/aptos-dkg/src/pvss/das/unweighted_protocol.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/src/pvss/das/weighted_protocol.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/src/pvss/dealt_pub_key_share.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/src/pvss/dealt_secret_key.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/src/pvss/dealt_secret_key_share.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/src/pvss/insecure_field/transcript.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/src/pvss/mod.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/src/pvss/scalar_elgamal/README.md` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/src/pvss/scalar_elgamal/mod.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/src/pvss/scalar_elgamal/transcript.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/src/pvss/scalar_elgamal/weighted_protocol.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/src/pvss/test_utils.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/src/pvss/traits/transcript.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/src/pvss/weighted/generic_weighting.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-dkg/src/range_proofs/dekart_univariate_v2.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-dkg/tests/weighted_vuf.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-faucet/core/src/funder/mint.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-faucet/metrics-server/src/gather_metrics.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-genesis/src/config.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos-inspection-service/src/server/json_encoder.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-inspection-service/src/server/utils.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-jwk-consensus/src/network.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-jwk-consensus/src/observation_aggregation/tests.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-localnet/src/health_checker.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-rate-limiter/src/rate_limit.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-telemetry-service/src/custom_event.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-telemetry-service/src/log_ingest.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-telemetry-service/src/prometheus_push_metrics.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-telemetry-service/src/remote_config.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-telemetry-service/src/tests/auth_test.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-transaction-filters/src/batch_transaction_filter.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos-transaction-filters/src/tests/block_transaction_filter.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos/src/common/init.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos/src/common/transactions.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos/src/genesis/mod.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/aptos/src/genesis/tests.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos/src/move_tool/mod.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos/src/node/analyze/analyze_validators.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos/src/node/local_testnet/health_checker.rs` | Old delta absent; old text differs only under normalization |
| `crates/aptos/src/node/mod.rs` | New upstream-relative delta at upgrade |
| `crates/aptos/src/test/mod.rs` | Old delta absent; old text differs only under normalization |
| `crates/channel/src/aptos_channel.rs` | Old delta absent; old text differs only under normalization |
| `crates/channel/src/message_queues_test.rs` | Old delta absent; old text differs only under normalization |
| `crates/indexer/src/database.rs` | Old delta absent; old text differs only under normalization |
| `crates/indexer/src/models/coin_models/account_transactions.rs` | Old delta absent; old text differs only under normalization |
| `crates/indexer/src/models/stake_models/staking_pool_voter.rs` | Old delta absent; old text differs only under normalization |
| `crates/transaction-generator-lib/src/batch_transfer.rs` | Old delta absent; old text differs only under normalization |
| `crates/transaction-generator-lib/src/lib.rs` | Old delta absent; old text differs only under normalization |
| `crates/transaction-generator-lib/src/p2p_transaction_generator.rs` | Old delta absent; old text differs only under normalization |
| `crates/transaction-generator-lib/src/publishing/prebuild_packages.rs` | Old delta absent; old text differs only under normalization |
| `crates/transaction-generator-lib/src/workflow_delegator.rs` | Old delta absent; old text differs only under normalization |
| `crates/transaction-workloads-lib/src/move_workloads.rs` | Old delta absent at original path; inspect replacement or relocation |
| `crates/validator-transaction-pool/src/lib.rs` | Old delta absent; old text differs only under normalization |
| `dkg/src/chunky/agg_subtrx_producer.rs` | New upstream-relative delta at upgrade |
| `dkg/src/chunky/common.rs` | New upstream-relative delta at upgrade |
| `dkg/src/chunky/dkg_manager/mod.rs` | New upstream-relative delta at upgrade |
| `dkg/src/chunky/missing_transcript_fetcher.rs` | New upstream-relative delta at upgrade |
| `dkg/src/chunky/mod.rs` | New upstream-relative delta at upgrade |
| `dkg/src/chunky/subtrx_cert_producer.rs` | New upstream-relative delta at upgrade |
| `dkg/src/chunky/test_utils.rs` | New upstream-relative delta at upgrade |
| `dkg/src/chunky/timelock_session_tests.rs` | New upstream-relative delta at upgrade |
| `dkg/src/counters.rs` | New upstream-relative delta at upgrade |
| `dkg/src/epoch_manager.rs` | New upstream-relative delta at upgrade |
| `dkg/src/lib.rs` | New upstream-relative delta at upgrade |
| `dkg/src/network.rs` | Old delta absent; old text differs only under normalization |
| `dkg/src/transcript_aggregation/tests.rs` | Old delta absent; old text differs only under normalization |
| `dkg/src/types.rs` | New upstream-relative delta at upgrade |
| `ecosystem/indexer-grpc/indexer-grpc-data-service-v2/src/status_page.rs` | Old delta absent; old text differs only under normalization |
| `ecosystem/indexer-grpc/indexer-grpc-fullnode/src/convert.rs` | Reworked or rebased delta; semantic review required |
| `ecosystem/indexer-grpc/indexer-grpc-manager/src/status_page.rs` | Old delta absent; old text differs only under normalization |
| `ecosystem/indexer-grpc/indexer-grpc-utils/src/counters.rs` | Old delta absent; old text differs only under normalization |
| `ecosystem/nft-metadata-crawler/src/asset_uploader/api/get_status.rs` | Old delta absent; old text differs only under normalization |
| `execution/executor-benchmark/src/db_access.rs` | Old delta absent; old text differs only under normalization |
| `execution/executor-benchmark/src/native/native_vm.rs` | Old delta absent; old text differs only under normalization |
| `execution/executor-benchmark/src/pipeline.rs` | Old delta absent at original path; inspect replacement or relocation |
| `execution/executor-test-helpers/src/integration_test_impl.rs` | Old delta absent; old text differs only under normalization |
| `execution/executor-types/src/lib.rs` | New upstream-relative delta at upgrade |
| `execution/executor/src/tests/mod.rs` | Old delta absent; old text differs only under normalization |
| `mempool/src/tests/core_mempool_test.rs` | Old delta absent; old text differs only under normalization |
| `mempool/src/tests/mocks.rs` | Old delta absent; old text differs only under normalization |
| `mempool/src/tests/node.rs` | Old delta absent; old text differs only under normalization |
| `mempool/src/tests/test_framework.rs` | Old delta absent; old text differs only under normalization |
| `network/discovery/src/validator_set.rs` | Old delta absent; old text differs only under normalization |
| `network/framework/src/application/tests.rs` | Old delta absent; old text differs only under normalization |
| `network/framework/src/connectivity_manager/mod.rs` | Old delta absent; old text differs only under normalization |
| `network/framework/src/counters.rs` | Old delta absent; old text differs only under normalization |
| `network/framework/src/noise/handshake.rs` | Old delta absent; old text differs only under normalization |
| `network/framework/src/protocols/wire/messaging/v1/test.rs` | Old delta absent; old text differs only under normalization |
| `network/framework/src/testutils/builder.rs` | Old delta absent; old text differs only under normalization |
| `network/netcore/src/transport/proxy_protocol.rs` | Old delta absent; old text differs only under normalization |
| `rust-toolchain.toml` | Reworked or rebased delta; semantic review required |
| `scripts/pgo.sh` | New upstream-relative delta at upgrade |
| `secure/storage/src/policy.rs` | Old delta absent; old text differs only under normalization |
| `secure/storage/src/tests/vault.rs` | Old delta absent; old text differs only under normalization |
| `state-sync/aptos-data-client/src/latency_monitor.rs` | Old delta absent; old text differs only under normalization |
| `state-sync/aptos-data-client/src/tests/multi_fetch.rs` | Old delta absent; old text differs only under normalization |
| `state-sync/aptos-data-client/src/tests/priority.rs` | Old delta absent; old text differs only under normalization |
| `state-sync/inter-component/event-notifications/src/tests.rs` | Old delta absent; old text differs only under normalization |
| `state-sync/inter-component/mempool-notifications/src/lib.rs` | Old delta absent; old text differs only under normalization |
| `state-sync/state-sync-driver/src/tests/utils.rs` | Old delta absent; old text differs only under normalization |
| `state-sync/storage-service/server/src/tests/optimistic_fetch.rs` | Old delta absent; old text differs only under normalization |
| `state-sync/storage-service/server/src/tests/subscription.rs` | Old delta absent; old text differs only under normalization |
| `storage/aptosdb/src/ledger_db/persisted_auxiliary_info_db_test.rs` | Old delta absent; old text differs only under normalization |
| `storage/aptosdb/src/pruner/state_merkle_pruner/test.rs` | Old delta absent; old text differs only under normalization |
| `storage/backup/backup-cli/src/storage/command_adapter/mod.rs` | Old delta absent; old text differs only under normalization |
| `storage/indexer/src/db_v2.rs` | Old delta absent; old text differs only under normalization |
| `storage/jellyfish-merkle/src/lib.rs` | Old delta absent; old text differs only under normalization |
| `storage/jellyfish-merkle/src/node_type/node_type_test.rs` | Old delta absent; old text differs only under normalization |
| `storage/jellyfish-merkle/src/restore/mod.rs` | Old delta absent; old text differs only under normalization |
| `storage/schemadb/tests/iterator.rs` | Old delta absent; old text differs only under normalization |
| `storage/scratchpad/src/sparse_merkle/node.rs` | Old delta absent; old text differs only under normalization |
| `storage/scratchpad/src/sparse_merkle/sparse_merkle_test.rs` | Old delta absent; old text differs only under normalization |
| `storage/storage-interface/src/state_store/state_update_refs.rs` | Old delta absent; old text differs only under normalization |
| `testsuite/forge-cli/src/suites/indexer.rs` | Old delta absent; old text differs only under normalization |
| `testsuite/forge-cli/src/suites/realistic_environment.rs` | Old delta absent; old text differs only under normalization |
| `testsuite/forge-cli/src/suites/realistic_workloads.rs` | Old delta absent at original path; inspect replacement or relocation |
| `testsuite/forge-cli/src/suites/ungrouped.rs` | Old delta absent; old text differs only under normalization |
| `testsuite/smoke-test/Cargo.toml` | Old delta absent at original path; inspect replacement or relocation |
| `testsuite/smoke-test/src/aptos_cli/move.rs` | Old delta absent; old text differs only under normalization |
| `testsuite/smoke-test/src/consensus/helpers.rs` | Old delta absent; old text differs only under normalization |
| `testsuite/smoke-test/src/ibe/mod.rs` | Old delta absent at original path; inspect replacement or relocation |
| `testsuite/smoke-test/src/lib.rs` | Old delta absent at original path; inspect replacement or relocation |
| `testsuite/smoke-test/src/randomness/e2e_correctness.rs` | Old delta absent at original path; inspect replacement or relocation |
| `testsuite/smoke-test/src/randomness/ibe_mpk_on_chain.rs` | Old delta absent at original path; inspect replacement or relocation |
| `testsuite/smoke-test/src/randomness/mod.rs` | Old delta absent at original path; inspect replacement or relocation |
| `testsuite/smoke-test/src/rosetta.rs` | Old delta absent; old text differs only under normalization |
| `testsuite/smoke-test/src/timelock/deadline_reveal.rs` | Old delta absent at original path; inspect replacement or relocation |
| `testsuite/smoke-test/src/timelock/e2e_complete_workflow.rs` | Old delta absent at original path; inspect replacement or relocation |
| `testsuite/smoke-test/src/timelock/mod.rs` | Old delta absent at original path; inspect replacement or relocation |
| `testsuite/smoke-test/src/timelock/register_and_query.rs` | Old delta absent at original path; inspect replacement or relocation |
| `testsuite/smoke-test/src/transaction_filter.rs` | Old delta absent; old text differs only under normalization |
| `testsuite/testcases/src/multi_region_network_test.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/extensions/move-table-extension/src/lib.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-binary-format/src/binary_views.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-binary-format/src/serializer.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-bytecode-spec/tests/tests.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-bytecode-verifier/bytecode-verifier-tests/src/unit_tests/constants_tests.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-bytecode-verifier/src/absint.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-command-line-common/src/parser.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-compiler-v2/legacy-move-compiler/src/expansion/aliases.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-compiler-v2/legacy-move-compiler/src/expansion/ast.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-compiler-v2/legacy-move-compiler/src/expansion/translate.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-compiler-v2/legacy-move-compiler/src/parser/ast.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-compiler-v2/legacy-move-compiler/src/parser/syntax.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-compiler-v2/legacy-move-compiler/src/shared/mod.rs` | Old delta absent at original path; inspect replacement or relocation |
| `third_party/move/move-compiler-v2/src/bytecode_generator.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-compiler-v2/src/env_pipeline/inlining_optimization.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-compiler-v2/src/env_pipeline/lambda_lifter.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-compiler-v2/src/env_pipeline/recursive_struct_checker.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-compiler-v2/src/env_pipeline/unused_params_checker.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-compiler-v2/src/external_checks.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-compiler-v2/src/file_format_generator/function_generator.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-compiler-v2/src/logging.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-compiler-v2/src/pipeline/reference_safety/reference_safety_processor_v2.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-compiler-v2/src/pipeline/split_critical_edges_processor.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-compiler-v2/src/plan_builder.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-core/types/src/language_storage.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-core/types/src/unit_tests/value_test.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-core/types/src/value.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-ir-compiler/move-ir-to-bytecode/src/context.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-ir-compiler/move-ir-to-bytecode/syntax/src/syntax.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-ir/types/src/ast.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-model/bytecode/src/dataflow_analysis.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-model/bytecode/src/fat_loop.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-model/bytecode/src/function_target_pipeline.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-model/bytecode/src/stackless_bytecode.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-model/bytecode/src/stackless_bytecode_generator.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-model/bytecode/src/stackless_control_flow_graph.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-model/src/builder/binary_module_loader.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-model/src/builder/builtins.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-model/src/builder/exp_builder.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-model/src/builder/module_builder.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-model/src/exp_generator.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-model/src/exp_rewriter.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-model/src/model.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-model/src/sourcifier.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-model/src/spec_translator.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-prover/boogie-backend/src/boogie_helpers.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-prover/boogie-backend/src/bytecode_translator.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-prover/boogie-backend/src/prover_task_runner.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-prover/bytecode-pipeline/src/loop_analysis.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-prover/bytecode-pipeline/src/spec_instrumentation.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-prover/bytecode-pipeline/src/well_formed_instrumentation.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-prover/move-errmapgen/src/errmapgen.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-prover/tests/testsuite.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-stdlib/src/natives/bcs.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-stdlib/src/natives/hash.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-vm/integration-tests/src/tests/binary_format_version.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-vm/integration-tests/src/tests/function_arg_tests.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-vm/integration-tests/src/tests/module_storage_tests.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-vm/integration-tests/src/tests/native_tests.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-vm/integration-tests/src/tests/return_value_tests.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-vm/integration-tests/src/tests/vm_arguments_tests.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-vm/runtime/src/runtime_ref_checks.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-vm/runtime/src/storage/loader/eager.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-vm/runtime/src/storage/ty_depth_checker.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-vm/runtime/src/storage/ty_layout_converter.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-vm/runtime/src/storage/ty_tag_converter.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-vm/test-utils/src/gas_schedule.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-vm/types/src/loaded_data/runtime_access_specifiers_prop_tests.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-vm/types/src/loaded_data/runtime_types.rs` | Old delta absent at original path; inspect replacement or relocation |
| `third_party/move/move-vm/types/src/values/serialization_tests.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-vm/types/src/values/value_depth_tests.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/move-vm/types/src/values/values_impl.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/testing-infra/transactional-test-runner/src/templates.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/tools/move-bytecode-viewer/src/bytecode_viewer.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/tools/move-cli/src/base/docgen.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/tools/move-cli/src/base/errmap.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/tools/move-cli/src/base/prove.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/tools/move-coverage/src/bin/source-coverage.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/tools/move-coverage/src/summary.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/tools/move-linter/src/model_ast_lints/simpler_bool_expression.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/tools/move-package-resolver/src/identity.rs` | Old delta absent; old text differs only under normalization |
| `third_party/move/tools/move-package/tests/test_runner.rs` | Old delta absent; old text differs only under normalization |
| `tools/calc-dep-sizes/src/main.rs` | Old delta absent; old text differs only under normalization |
| `tools/compute-module-expansion-size/src/main.rs` | Old delta absent; old text differs only under normalization |
| `types/src/chain_id.rs` | Old delta absent; old text differs only under normalization |
| `types/src/contract_event.rs` | New upstream-relative delta at upgrade |
| `types/src/dkg/chunky_dkg.rs` | New upstream-relative delta at upgrade |
| `types/src/dkg/mod.rs` | Reworked or rebased delta; semantic review required |
| `types/src/dkg/real_dkg/mod.rs` | Old delta absent at original path; inspect replacement or relocation |
| `types/src/dkg/timelock_dkg.rs` | New upstream-relative delta at upgrade |
| `types/src/lib.rs` | New upstream-relative delta at upgrade |
| `types/src/network_address/mod.rs` | Old delta absent; old text differs only under normalization |
| `types/src/proof/position/position_test.rs` | Old delta absent; old text differs only under normalization |
| `types/src/proof/unit_tests/proof_test.rs` | Old delta absent; old text differs only under normalization |
| `types/src/timelock.rs` | New upstream-relative delta at upgrade |
| `types/src/transaction/authenticator.rs` | Old delta absent; old text differs only under normalization |
| `types/src/unit_tests/contract_event_test.rs` | Old delta absent; old text differs only under normalization |
| `types/src/validator_txn.rs` | Reworked or rebased delta; semantic review required |
| `types/src/validator_verifier.rs` | Old delta absent; old text differs only under normalization |
