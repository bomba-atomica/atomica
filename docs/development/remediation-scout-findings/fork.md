# FORK scout report

Partition: the fork worktree `~/tmp/superfield-worktrees/atomica-aptos/scout-remediation-seams`, branch `adhoc/scout-remediation-seams`, base `dev-atomica` `52beee31a6`.

Third pass. Two earlier fork scouts left 56 modified files and no report. I reviewed every diff line. All added lines were `//`, `#` or `<!-- -->` markers, except one new uncalled Rust stub and one empty HTML comment. I kept the markers. I made these fixes:

- `.github/workflows/README.md`: removed an empty `<!--  -->` line.
- `crates/aptos-dkg/src/ibe/ciphertext.rs`: the stub `decrypt_bid_ct` carried `///` doc comments. They are now `//` comments, so rustdoc output does not change.
- `crates/aptos-dkg/src/ibe/golden_vectors.rs:786`: the 240 marker named the literal legacy folder path. The 240 acceptance grep would have matched the marker. It now says "the legacy vector folder".

I added four markers: 221 in `types/src/unit_tests/atomica_outcome_proof_vectors_test.rs`, 226 in the share handler (`aptos-vm/src/validator_txns/timelock.rs`, a "no change" site), and 240 in the module doc of `ibe_golden_vector_tests.move`. Final state: 57 modified files, 0 untracked files, 319 markers.

The 14 lines the diff shows as removed are all Markdown lines that gained an inline `<!-- -->` marker at the end. Their rendered text is unchanged.

## Behaviour neutrality

- Rust: every added line is a `//` comment, except the stub `pub fn decrypt_bid_ct(_dk, _identity, _ad, _ct) -> Result<Vec<u8>, IbeError>` in `aptos-dkg`. Nothing calls it. It returns `Err(IbeError::DecryptionFailed)`. It is `pub`, so it raises no dead-code lint.
- Workflows: each of the four edited workflow files parses to the same YAML data as at `HEAD` (checked with `yaml.safe_load` on both versions). The commented-out steps change nothing.
- Shell and Python: comments only. `bash -n` and `py_compile` pass.
- Framework Move: comments only. Compiled bytecode is byte-identical: all 160 `.mv` files of AptosFramework, AptosStdlib and MoveStdlib have the same SHA-256 at `HEAD` and in the worktree.
- **But comment-only framework edits still change the package bytes that ship.** `head.mrb` is built with `with_srcs = true` (`aptos-move/framework/src/main.rs:92`). `extract_metadata` zips each module's source text into the bundle (`built_package.rs:650`). The source digest also hashes every file under `sources/`. I confirmed it: `package-metadata.bcs` hashes to `c71e780e…` at `HEAD` and `1a138f7f…` in the worktree. So the stub merge makes `head.mrb` stale. "Cached framework packages are fresh" fails until `cached-packages.zip` from that run is committed. The genesis package registry then holds new metadata, so the genesis output and waypoint change. Module bytecode, ABIs and the SDK builder do not change.
- Move test files (`aptos-framework/tests/*.move`) and the `ibe_gas.data` test package are not in `head.mrb`. The release build is not in dev mode, so the digest skips `tests/`.

### Framework source files still touched (comment-only)

- `aptos-move/framework/aptos-framework/sources/block.move` (231)
- `aptos-move/framework/aptos-framework/sources/genesis.move` (223, 225, 231)
- `aptos-move/framework/aptos-framework/sources/ibe_config.move` (225, 226, 230, 231, 243)
- `aptos-move/framework/aptos-framework/sources/reconfiguration_with_dkg.move` (231, 242)
- `aptos-move/framework/aptos-framework/sources/timelock_dkg.move` (223, 231)
- `aptos-move/framework/aptos-stdlib/sources/cryptography/ibe.move` (227, 228, 240)

Framework test files touched (not in `head.mrb`): `ibe_config_tests.move`, `ibe_golden_vector_tests.move`, `ibe_native_test.move`, `timelock_dkg_tests.move`.

To avoid the `head.mrb` refresh, a coordinator could drop the markers from those six source files. The cost is that `grep SCOUT(#N)` then misses the main sites of 225, 226, 230 and 231. I kept them, because every one of those issues refreshes `head.mrb` anyway.


## 221 LockBox computes the lock deadline

**Sites marked:** 2 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 2)

**Sites:**
- `atomica/golden_vectors/README.md:58` DOC — stale sentence. The product fixes this layout now, and the computed-deadline change keeps the `eth_lock_deadline` field, so these vectors stay valid.
- `types/src/unit_tests/atomica_outcome_proof_vectors_test.rs:89` DOC — the doc below is stale. The product fixes this layout, and LockBox's auction key drops the deadline (`keccak256(abi.encode(windowId, pairHash))`). The `eth_lock_deadline` field stays, so the vectors stay valid.

**Issue text corrections:**
- The issue names no fork file. The fork pins the `AuctionOutcome` layout in `types/src/unit_tests/atomica_outcome_proof_vectors_test.rs` and `atomica/golden_vectors/README.md`. Their text says the product has not fixed the layout, and the test doc says the auction key includes the deadline. Both are stale after 221. The vectors stay valid, because 221 keeps the `eth_lock_deadline` field.

**Hidden costs:**
- None in code. A doc fix rides with any later fork pull request.

## 223 Reject a timelock DKG result without a pinned hash

**Sites marked:** 44 (ADD 5, EDIT 29, REMOVE 0, TEST 3, DOC 7)

**Sites:**
- `.github/workflows/README.md:188` DOC — the crypto-crates-tests.yml row below gains the aptos-vm-genesis tests.
- `.github/workflows/crypto-crates-tests.yml:107` EDIT — raise the guard minimum of the step below from 16 to 18 (two new session tests).
- `.github/workflows/crypto-crates-tests.yml:141` ADD — guarded step for the vm-genesis tests. No workflow runs this crate today. Issue 231 needs the same step: add it once.
- `.github/workflows/debug-tests.yml:129` EDIT — the chain id 77 swarm below must set `timelock_public_parameters_hash` in its layout, or it gets no key after the change.
- `aptos-move/aptos-vm/src/validator_txns/timelock_dkg.rs:20` DOC — the module doc above says the hash is compared when governance has set it. It becomes: an absent hash rejects the result, except on chain id 4.
- `aptos-move/aptos-vm/src/validator_txns/timelock_dkg.rs:64` EDIT — add `ParametersHashMissing = 0x10508`, the next free `invalid_argument` code of this handler.
- `aptos-move/aptos-vm/src/validator_txns/timelock_dkg.rs:88` EDIT — map `ResultRejection::ParametersHashMissing`. This match is exhaustive: the new variant does not compile until this arm exists.
- `aptos-move/aptos-vm/src/validator_txns/timelock_dkg.rs:177` EDIT — `None` is now a rejection inside `check_timelock_dkg_result` on every chain id but 4. The discarded transaction stays in each validator's pool until the session is cleared at the epoch change.
- `aptos-move/framework/aptos-framework/sources/genesis.move:423` EDIT — genesis also calls `timelock_dkg::set_expected_public_parameters_hash` when the layout carries `timelock_public_parameters_hash`. vm-genesis calls this function by name with one signer argument, so a new argument changes both sides.
- `aptos-move/framework/aptos-framework/sources/timelock_dkg.move:87` DOC — the doc below changes: an absent hash rejects the result on every chain except chain id 4, and genesis can set the hash.
- `aptos-move/framework/aptos-framework/sources/timelock_dkg.move:112` EDIT — not named in the issue. After the change, clearing the hash on a chain other than chain id 4 stops every later timelock key. Fix this doc or remove the function.
- `aptos-move/framework/aptos-framework/tests/timelock_dkg_tests.move:169` EDIT — the name and the clear step describe an optional check. After the change an absent hash rejects every result off the test chain.
- `aptos-move/vm-genesis/src/lib.rs:133` ADD — optional field `timelock_public_parameters_hash` (32 bytes), next to `timelock_dkg_enabled`.
- `aptos-move/vm-genesis/src/lib.rs:381` EDIT — also write the expected hash when the field is set.
- `aptos-move/vm-genesis/src/lib.rs:468` EDIT — fail when `timelock_dkg_enabled` is true, the hash is unset and the chain id is not 4. This function gets no chain id today; both callers hold one and must pass it.
- `aptos-move/vm-genesis/src/lib.rs:850` EDIT — pass the hash to `genesis::enable_timelock_dkg`, or add a second `exec_function` for `timelock_dkg::set_expected_public_parameters_hash`.
- `aptos-move/vm-genesis/src/lib.rs:1569` EDIT — carry `timelock_public_parameters_hash` here.
- `aptos-move/vm-genesis/src/lib.rs:1628` EDIT — carry `timelock_public_parameters_hash` here.
- `aptos-move/vm-genesis/src/lib.rs:1660` TEST — genesis_with_timelock_dkg_and_no_hash_fails_off_the_test_chain, and genesis_writes_the_expected_public_parameters_hash (reads `0x1::timelock_dkg::ExpectedPublicParametersHash`). No workflow runs the tests of this crate today.
- `atomica/docker/tests/generate-genesis-host.sh:57` EDIT — this script has no TIMELOCK_DKG_ENABLED switch and writes no `timelock_dkg_enabled` line, so there is nothing to pin here unless the switch is added first.
- `atomica/docker/tests/generate-genesis.sh:97` EDIT — when TIMELOCK_DKG_ENABLED=true, add a `timelock_public_parameters_hash:` line read from atomica/timelock-params/timelock-public-parameters.sha3-256. Without it a chain id other than 4 fails genesis.
- `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md:84` DOC — `when it exists` becomes: an absent hash rejects the result, except on chain id 4. Genesis can pin the hash.
- `atomica/timelock-params/README.md:15` DOC — genesis pins this value too, through the layout field `timelock_public_parameters_hash`. The docker genesis scripts read this file.
- `crates/aptos-genesis/src/builder.rs:451` ADD — optional field `timelock_public_parameters_hash` (32 bytes), next to `timelock_dkg_enabled`.
- `crates/aptos-genesis/src/builder.rs:685` EDIT — carry `timelock_public_parameters_hash` here.
- `crates/aptos-genesis/src/config.rs:103` ADD — `#[serde(default)]` layout field `timelock_public_parameters_hash` (hex, 32 bytes).
- `crates/aptos-genesis/src/config.rs:159` EDIT — carry `timelock_public_parameters_hash` here.
- `crates/aptos-genesis/src/lib.rs:86` ADD — optional field `timelock_public_parameters_hash` (32 bytes), next to `timelock_dkg_enabled`.
- `crates/aptos-genesis/src/lib.rs:136` EDIT — carry `timelock_public_parameters_hash` here.
- `crates/aptos-genesis/src/lib.rs:180` EDIT — carry `timelock_public_parameters_hash` here.
- `crates/aptos-genesis/src/mainnet.rs:155` EDIT — carry `timelock_public_parameters_hash` here.
- `crates/aptos/src/genesis/mod.rs:267` EDIT — carry `timelock_public_parameters_hash` here.
- `crates/aptos/src/genesis/mod.rs:320` EDIT — carry `timelock_public_parameters_hash` here.
- `dkg/src/chunky/timelock_session_tests.rs:190` EDIT — this helper fixes `ChainId::test()`, and `sign` above signs for the test chain only. The chain id 77 test needs both as parameters, or a missing-hash check that runs before the signature check.
- `dkg/src/chunky/timelock_session_tests.rs:371` EDIT — still Ok, but only because the helper uses the test chain. Reword the comment below.
- `dkg/src/chunky/timelock_session_tests.rs:462` EDIT — still Ok on the test chain only. Reword the comment below.
- `dkg/src/chunky/timelock_session_tests.rs:467` TEST — missing_expected_hash_is_rejected_off_the_test_chain (chain id 77, `None`, expects ParametersHashMissing)
- `dkg/src/chunky/timelock_session_tests.rs:468` TEST — missing_expected_hash_is_accepted_on_the_test_chain
- `testsuite/smoke-test/src/timelock_e2e.rs:1161` EDIT — set the layout hash to `blob_hash`. Without it this chain id 77 swarm gets no timelock key after the change.
- `testsuite/smoke-test/src/timelock_e2e.rs:1191` EDIT — also assert that the view 0x1::timelock_dkg::expected_public_parameters_hash returns the shipped hash.
- `types/src/dkg/timelock_dkg.rs:219` DOC — the doc below says the hash is set by governance; genesis sets it too.
- `types/src/dkg/timelock_dkg.rs:704` EDIT — add `ParametersHashMissing`: no expected hash on chain and the chain id is not `ChainId::test()`. The only exhaustive match on this enum is in the VM handler.
- `types/src/dkg/timelock_dkg.rs:727` DOC — the doc below changes: `None` rejects the result on every chain except the test chain.
- `types/src/dkg/timelock_dkg.rs:772` EDIT — return `ParametersHashMissing` when `expected_params_hash` is `None` and `chain_id != ChainId::test()`. This check runs after the signature check, so a unit test on chain id 77 needs a certificate signed for chain 77, or the check moves to the top.

**Issue text corrections:**
- `chain_id` is already a parameter of `check_timelock_dkg_result`, so the new rule needs no new argument there.
- `validate_genesis_config` (vm-genesis `:468`) receives no chain id today. Both callers hold one. The genesis rule needs that signature change.
- `genesis::enable_timelock_dkg` is called by name from vm-genesis with one signer argument. Passing the hash changes both sides, or vm-genesis makes a second `exec_function` call to `timelock_dkg::set_expected_public_parameters_hash`.
- Not named: `timelock_dkg::clear_expected_public_parameters_hash` (`timelock_dkg.move:112`). After the change, a governance clear on a non-test chain stops every later timelock key. Its doc says it "stops the hash check".
- Not named: `timelock_dkg_tests::expected_parameters_hash_is_absent_until_governance_sets_it`. Its name describes the optional check.
- `generate-genesis-host.sh` has no `TIMELOCK_DKG_ENABLED` switch. Only `generate-genesis.sh` (`:113`) writes `timelock_dkg_enabled`.
- The test helper `check` in `timelock_session_tests.rs` hardcodes `ChainId::test()`, and its `sign` helper signs for the test chain. The new chain id 77 test needs both as parameters, because the hash check runs after the multisig check.
- Every `GenesisConfiguration` literal is marked: vm-genesis (2), aptos-genesis builder, lib (2), mainnet, and the `aptos` CLI (2). A new field that is not `Option` with `#[serde(default)]` breaks each of them.

**Hidden costs:**
- No CI job runs `aptos-vm-genesis` tests today. The new step is the first.
- A discarded `TimelockDKGResult` stays in each validator pool until the session clears at the epoch change. That is pool noise, not a stall.
- Framework Move change: `head.mrb` refresh from the CI artifact.

**Cross-issue pressure:**
- 225 and 231 add layout fields beside this one in the same seven struct literals and the same two docker scripts. Land them in one order, or the second and third rebase over each other.
- The crypto-crates `aptos-vm-genesis` step is shared with 231. Add it once.

**CI:**
- The session tests run in Crypto Crates Tests (required), step "Run timelock DKG session tests", guard 16 today.
- The chain id 77 swarm runs in Debug Smoke Tests (required).

**Questions answered or sharpened by the code:**
- Product testnet runs chain id 4, so it needs no hash. The fork docker scripts default to chain id 4 too, so their hash line matters only for a non-test chain.

## 225 Only the auction package registers a timelock

**Sites marked:** 52 (ADD 12, EDIT 31, REMOVE 0, TEST 5, DOC 4)

**Sites:**
- `.github/workflows/README.md:189` DOC — the crypto-crates-tests.yml row below gains the ibe_config Move unit tests.
- `.github/workflows/crypto-crates-tests.yml:147` ADD — guarded step for the ibe_config Move unit tests. Issues 226 and 230 need the same step: the first to merge adds it.
- `.github/workflows/debug-tests.yml:121` EDIT — these swarms register no timelock, so they pass without a registrar.
- `.github/workflows/debug-tests.yml:138` EDIT — the live reveal below sets the registrar at genesis and asserts a rejected registration from another account first.
- `.github/workflows/node-framework-tests.yml:124` EDIT — each filtered Rust test added to move_unit_test.rs raises the real count of the step below and compiles the framework test package once more in this job. The comment above is already one test behind.
- `.github/workflows/timelock-tests.yml:132` EDIT — these tests register a timelock through the harness; they run only here until issue 229 moves them into the required check.
- `aptos-move/e2e-move-tests/src/tests/timelock_dkg.rs:206` EDIT — not named in the issue. This account is not the registrar, so the abort becomes E_NOT_REGISTRAR unless the registrar check runs after `is_ready`, or the harness sets 0xa11ce as registrar first. No workflow runs `e2e-move-tests --lib timelock_dkg::` today.
- `aptos-move/e2e-move-tests/src/tests/timelock_share.rs:141` EDIT — make this account the registrar before the registration below, with `h.executor.exec("ibe_config", "set_timelock_registrar", ...)`. The harness runs genesis from head.mrb, so it needs the refreshed bundle.
- `aptos-move/framework/aptos-framework/sources/genesis.move:138` ADD — genesis step that calls `ibe_config::set_timelock_registrar` when the layout sets `timelock_registrar`. The VM calls genesis steps by name (vm-genesis), so this is a new private function like `enable_timelock_dkg`.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:49` DOC — lifecycle step 1 of the module doc above gains the rule that only the stored registrar may register.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:91` ADD — `const E_NOT_REGISTRAR: u64 = 17;` for a signer that is not the stored registrar, and for every signer while no registrar is set. Not declared here: any code change to a framework module changes genesis.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:132` ADD — new resource `struct TimelockRegistrar has key { registrar: address }` at @aptos_framework. While it is absent every registration aborts with `E_NOT_REGISTRAR`. New on-chain state, so it is not stubbed.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:198` EDIT — `sender` is always the registrar once the check lands.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:453` EDIT — aborts with `E_NOT_REGISTRAR` unless `signer::address_of(account)` equals the stored registrar. The body moves to `register_timelock_with_id` and this entry calls it.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:517` ADD — `public fun set_timelock_registrar(aptos_framework: &signer, registrar: address)`, framework signer only, called at genesis (layout field `timelock_registrar`) or by governance. A second call replaces the address.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:518` ADD — `#[view] public fun timelock_registrar(): Option<address>`, `none` while no registrar is set (needs `use std::option`).
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:520` ADD — `public fun register_timelock_with_id(account: &signer, deadline_us: u64): u64` with the registrar check and the body of `register_timelock`, which then calls it. A public framework function cannot be removed or change signature after release, so it is not stubbed here.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:887` EDIT — every Move test that registers needs a registrar first. Set one here or add a test-only helper; the product package tests register through the framework too.
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:69` EDIT — 37 tests register through this helper as @0xA and no registrar is set. Setup must make @0xA the registrar, or each of them aborts with E_NOT_REGISTRAR.
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:110` TEST — register_aborts_with_not_registrar_while_no_registrar_is_set
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:111` TEST — register_aborts_for_another_signer_and_succeeds_for_the_registrar
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:112` TEST — register_with_id_returns_the_next_id_and_the_event_carries_it
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:113` TEST — set_registrar_is_framework_only_and_a_second_call_replaces_the_address
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:114` EDIT — the order of the checks decides this abort code: with the registrar check first, a non-registrar sees E_NOT_REGISTRAR and not E_IBE_NOT_READY (2).
- `aptos-move/framework/aptos-framework/tests/timelock_dkg_tests.move:125` EDIT — this test registers with a plain account. Make it the registrar so the abort stays E_IBE_NOT_READY (2) and does not become E_NOT_REGISTRAR.
- `aptos-move/framework/tests/move_unit_test.rs:142` EDIT — the Tee writer and the `passed: N` parse of the test below are local to it. Lift them into a shared helper before a second filtered test copies them.
- `aptos-move/framework/tests/move_unit_test.rs:143` TEST — ibe_config_move_unit_tests: runs the Move tests of `ibe_config_tests` and fails below the number the file holds (46 today). Issues 226 and 230 need the same Rust test: the first to merge adds it, the others raise the floor.
- `aptos-move/vm-genesis/src/lib.rs:134` ADD — optional field `timelock_registrar` (address).
- `aptos-move/vm-genesis/src/lib.rs:382` ADD — genesis step that sets the registrar when the field is set.
- `aptos-move/vm-genesis/src/lib.rs:1570` EDIT — carry `timelock_registrar` here.
- `aptos-move/vm-genesis/src/lib.rs:1629` EDIT — carry `timelock_registrar` here.
- `atomica/docker/tests/generate-genesis-host.sh:58` EDIT — add a `timelock_registrar:` line.
- `atomica/docker/tests/generate-genesis.sh:98` EDIT — add a `timelock_registrar:` line.
- `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md:231` DOC — registration also aborts with `E_NOT_REGISTRAR` unless the signer is the stored registrar.
- `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md:233` DOC — record the registrar rule here. The line reference (176 to 215) is stale.
- `atomica/scripts/timelock-smoke-test.sh:84` EDIT — REGISTRAR_KEY must be the key of the on-chain registrar, and the network that timelock_testnet_for_script starts must set that registrar.
- `atomica/scripts/timelock-smoke-test.sh:146` EDIT — the same registrar rule for this second registration.
- `crates/aptos-genesis/src/builder.rs:452` ADD — optional field `timelock_registrar` (address).
- `crates/aptos-genesis/src/builder.rs:686` EDIT — carry `timelock_registrar` here.
- `crates/aptos-genesis/src/config.rs:104` ADD — `#[serde(default)]` layout field `timelock_registrar` (address).
- `crates/aptos-genesis/src/config.rs:160` EDIT — carry `timelock_registrar` here.
- `crates/aptos-genesis/src/lib.rs:87` ADD — optional field `timelock_registrar` (address).
- `crates/aptos-genesis/src/lib.rs:137` EDIT — carry `timelock_registrar` here.
- `crates/aptos-genesis/src/lib.rs:181` EDIT — carry `timelock_registrar` here.
- `crates/aptos-genesis/src/mainnet.rs:156` EDIT — carry `timelock_registrar` here.
- `crates/aptos/src/genesis/mod.rs:268` EDIT — carry `timelock_registrar` here.
- `crates/aptos/src/genesis/mod.rs:321` EDIT — carry `timelock_registrar` here.
- `testsuite/smoke-test/src/timelock_e2e.rs:163` EDIT — every caller must sign with the registrar account. Today each test registers with a fresh funded account.
- `testsuite/smoke-test/src/timelock_e2e.rs:273` EDIT — timelock_e2e and timelock_testnet_for_script turn the DKG on with this governance script, so it must also call ibe_config::set_timelock_registrar. Neither test runs in CI.
- `testsuite/smoke-test/src/timelock_e2e.rs:322` EDIT — set `conf.timelock_registrar` to the account the tests register with.
- `testsuite/smoke-test/src/timelock_e2e.rs:493` EDIT — `registrar` must be the on-chain registrar (three registrations in this test).
- `testsuite/smoke-test/src/timelock_e2e.rs:893` EDIT — first assert that a registration from another funded account fails with the E_NOT_REGISTRAR abort code, then register with the registrar.

**Issue text corrections:**
- Not named: `aptos-move/e2e-move-tests/src/tests/timelock_dkg.rs:206`. That test registers as `0xa11ce` and expects `E_IBE_NOT_READY` (2). With the registrar check first, it gets `E_NOT_REGISTRAR`. No workflow runs that test today.
- Not named: `timelock_dkg_tests::register_timelock_aborts_when_the_session_failed` expects abort 2. The same order question applies.
- `ibe_config_tests::register_aborts_when_not_ready` expects abort 2 as `@0xA`. The issue must state the check order: registrar first, or readiness first.
- 37 of the 46 `ibe_config_tests` tests register through the `register` helper as `@0xA`. Setup must set that registrar, or all 37 fail.
- The smoke test file also turns the DKG on by a governance script (`ENABLE_TIMELOCK_DKG_SCRIPT`) for `timelock_e2e` and `timelock_testnet_for_script`. Those paths need a registrar too. Neither runs in CI.
- `timelock_reveal_on_live_swarm` (`:893`) is the only CI smoke test that registers. The genesis flag and chain id 77 swarms register nothing.
- `set_timelock_registrar` and `register_timelock_with_id` are `public fun`, not `entry`. So `aptos_framework_sdk_builder.rs` does not change. Governance must call the setter from a script.

**Hidden costs:**
- New on-chain state (`TimelockRegistrar`) and a new error code. I did not stub them. A public framework function cannot be removed or change signature after release.
- The e2e harness runs genesis from `head.mrb`. The `timelock_share` VM tests that call `set_timelock_registrar` fail until the bundle is refreshed.
- `move_unit_test.rs` gains a filtered Rust test. Lift the `Tee` writer and the `passed:` parse into a helper before 226, 230 and 231 copy them.

**Cross-issue pressure:**
- The INFRA scout found the big trap: any product pin move to a fork revision with 225 breaks every timelock registration on the product testnet until the product genesis sets the registrar (243). 225 must ship to the product together with 243.
- 226 and 230 need the same `ibe_config` Rust test and crypto-crates step. The first to merge adds it. The others raise the floor.
- 223 and 231 edit the same layout literals and docker lines.

**CI:**
- `ibe_config_tests` run only in Node and Framework Tests (not required) today.
- `timelock_share::` VM tests run only in Timelock Tests (not required) until 229 moves them.
- The live reveal swarm runs in Debug Smoke Tests (required).

**Questions answered or sharpened by the code:**
- The registrar address must be known at genesis. The product registrar is a named object address under `@atomica` (243). The fork docker genesis needs that address as a literal, so the product package address must be fixed before the fork docker scripts can set it.

## 226 Timelock status reads expired at the reveal expiry

**Sites marked:** 24 (ADD 1, EDIT 14, REMOVE 0, TEST 7, DOC 2)

**Sites:**
- `.github/workflows/crypto-crates-tests.yml:151` ADD — the ibe_config Move unit test step above (shared with issue 225).
- `.github/workflows/debug-tests.yml:14` EDIT — this pull request filter has no Move paths. A fork pull request that changes only Move sources and head.mrb never starts this required check and waits forever. Issues 226 and 230 start it only through their workflow or move_unit_test.rs edits.
- `.github/workflows/node-framework-tests.yml:127` EDIT — the whole framework Move suite, including the new ibe_config tests, runs here; this workflow is not a required check.
- `aptos-move/aptos-vm/src/validator_txns/timelock.rs:477` EDIT — no change. `submit_dk_shares` in step 3 already aborts at or past `reveal_expiry_us` (code 15), so step 4 runs only while the stored and the effective status agree.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:50` DOC — the Lifecycle and Epoch rule sections of the module doc above gain the read rule: an unrevealed timelock reads Expired(reveal-window-elapsed) from the first block at or past `reveal_expiry_us`.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:576` EDIT — decide whether share submission keeps reading the stored status (abort stays 15 past the window) or reads `effective_status` (abort becomes 11). The test `submit_after_reveal_window_aborts` pins 15.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:617` EDIT — aborts with `E_NOT_PENDING` (11) at or past `reveal_expiry_us`. `finalize_timelock_reveal` and `fail_timelock_key_check` call this first, so they abort here before `finalize_internal` reaches `E_REVEAL_WINDOW_ELAPSED` (15).
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:666` EDIT — `is_reconstructable` reads false at or past `reveal_expiry_us`, also with threshold weight stored.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:755` EDIT — also return `Expired { reason: REASON_REVEAL_WINDOW_ELAPSED }` for a stored `Pending` timelock of the current epoch once `timestamp::now_microseconds() >= info.reveal_expiry_us`. The epoch-ended override keeps priority.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:811` EDIT — `get_status` returns 2 from the first block at or past `reveal_expiry_us`, before the queue reaches the entry. The product `refund_expired_window` reads this view.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:825` EDIT — `get_expiry_reason` returns 2 (reveal-window-elapsed) for the same read.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:861` EDIT — `is_expired` agrees with `get_status` under the new read rule.
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:394` TEST — status_reads_expired_at_reveal_expiry_without_running_the_queue
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:395` TEST — status_reads_pending_one_microsecond_before_reveal_expiry
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:396` TEST — undrained_51st_timelock_reads_expired_with_reason_2
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:397` TEST — revealed_timelock_never_reads_expired_after_reveal_expiry
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:398` TEST — earlier_epoch_pending_reads_epoch_ended_even_past_reveal_expiry
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:399` TEST — is_reconstructable_is_false_at_reveal_expiry_with_threshold_weight
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:411` EDIT — the read at 70 * MIN - 1 stays 0. The read at 70 * MIN is 2 even before on_new_block_for_testing runs, so the queue call no longer proves anything through get_status.
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:439` EDIT — pins abort 15 from the stored status. It becomes 11 if assert_can_submit starts to read effective_status.
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:475` EDIT — this expectation flips: id 50 is not drained yet and now reads 2. Assert the stored state another way (share count or event count) to keep testing the batch bound of 50.
- `aptos-move/framework/tests/move_unit_test.rs:144` TEST — the same Rust test as issue 225 (ibe_config_move_unit_tests), with the floor raised by six.
- `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md:229` DOC — add the read rule: from the first block at or past `reveal_expiry_us` every read is Expired(reveal-window-elapsed), before the queue writes the status.
- `dkg/src/timelock_share_service.rs:179` EDIT — no change: the service reads the stored status and has its own reveal-window gate in `DerivableTimelock::authorize`.

**Issue text corrections:**
- `get_reconstruction_inputs` already reads `effective_status`. After the change it aborts with `E_NOT_PENDING` (11) past the window. `finalize_timelock_reveal` and `fail_timelock_key_check` call it first, so `E_REVEAL_WINDOW_ELAPSED` (15) in `finalize_internal` becomes unreachable from those paths.
- `assert_can_submit` reads the stored status, not `effective_status`. The issue does not say whether it changes. `submit_after_reveal_window_aborts` pins 15. Keep the stored read to keep 15.
- The share handler needs no change. `submit_dk_shares` already aborts past `reveal_expiry_us`, so its reconstruction step only runs while the stored and the effective status agree.
- Existing tests that flip: `on_new_block_expires_in_bounded_batches` asserts `get_status(50) == 0` after one queue run. It reads 2 after the change. The test must check the batch bound another way. `reveal_window_expiry_marks_expired_and_drops_shares` no longer proves the queue ran through `get_status`.

**Hidden costs:**
- No product change: `refund_expired_window` already reads `get_status` (the MOVE scout agrees).
- A fork merge that changes only Move sources and `head.mrb` does not start Debug Smoke Tests: its pull request path filter has no Move paths (`debug-tests.yml:14`). This issue starts it only through its workflow or `move_unit_test.rs` edits. The INFRA scout adds that a Move-only fork merge cuts no binary release either.

**Cross-issue pressure:**
- Shares the `ibe_config` Rust test and crypto-crates step with 225 and 230.
- 230 edits `expire` and the queue loop next to these lines. They do not conflict in logic.

**CI:**
- `ibe_config_tests` run only in Node and Framework Tests (not required) until 225, 226 or 230 adds the filtered step.

## 227 Native that decrypts a V2 bid

**Sites marked:** 32 (ADD 10, EDIT 6, REMOVE 0, TEST 11, DOC 5)

**Stubs added:**
- `crates/aptos-dkg/src/ibe/ciphertext.rs` `pub fn decrypt_bid_ct(_dk: &[u8], _identity: &[u8], _ad: &[u8], _ct: &[u8]) -> Result<Vec<u8>, IbeError>` — byte-level entry for the native. Returns `Err(IbeError::DecryptionFailed)`. Nothing calls it.

**Sites:**
- `.github/workflows/README.md:190` DOC — the crypto-crates-tests.yml row below gains the ibe gas VM tests and the ibe Move unit tests.
- `.github/workflows/crypto-crates-tests.yml:159` ADD — guarded steps for the ibe gas VM tests and the ibe Move unit tests. No workflow runs `ibe_gas::` today. A filter that ends in `::` must be quoted in YAML.
- `.github/workflows/node-framework-tests.yml:125` EDIT — the same for the filtered ibe test.
- `aptos-move/e2e-move-tests/src/tests/ibe_gas.data/p/sources/test.move:12` ADD — entry `decrypt(dk, identity, ad, ct)` that calls ibe::decrypt_bid once, and entry `decrypt_many(dk, identity, ads, cts)` that decrypts 100 bids in one transaction.
- `aptos-move/e2e-move-tests/src/tests/ibe_gas.rs:110` TEST — decrypt_bid_costs_more_than_verify_bid_ct_and_grows_with_the_ciphertext_body
- `aptos-move/e2e-move-tests/src/tests/ibe_gas.rs:111` TEST — hundred_decrypts_in_one_transaction_against_max_execution_gas (asserts the largest batch that fits equals a constant, which the doc of ibe::decrypt_bid repeats). The harness runs genesis from head.mrb, so these tests fail until the bundle is refreshed.
- `aptos-move/framework/aptos-framework/tests/ibe_golden_vector_tests.move:238` EDIT — this test only reads the recorded flags (the opening is checked in Rust). With the native it calls decrypt_bid on case 11 and expects none.
- `aptos-move/framework/aptos-framework/tests/ibe_golden_vector_tests.move:239` TEST — decrypt_bid_agrees_with_bid_case_opens_for_every_golden_case. The fixtures record one plaintext only (bid_plaintext), which is enough: case 0 is the only case that opens.
- `aptos-move/framework/aptos-framework/tests/ibe_golden_vector_tests.move:240` TEST — price_bids_decrypt_to_their_little_endian_price_under_their_own_bidder_only, and the bad-length bid decrypts to a plaintext that is not 8 bytes.
- `aptos-move/framework/aptos-framework/tests/ibe_native_test.move:203` TEST — decrypt_bid_opens_the_valid_bid
- `aptos-move/framework/aptos-framework/tests/ibe_native_test.move:204` TEST — decrypt_bid_returns_none_for_the_other_key_and_for_a_flipped_byte_in_each_field_and_in_ad
- `aptos-move/framework/aptos-framework/tests/ibe_native_test.move:205` TEST — decrypt_bid_returns_none_for_an_empty_ciphertext_a_47_byte_dk_and_a_31_byte_identity
- `aptos-move/framework/aptos-stdlib/sources/cryptography/ibe.move:19` DOC — the module table above gains a `decrypt_bid` row (spec section 6) and the stale Cargo feature name `natives-port-timelock` goes.
- `aptos-move/framework/aptos-stdlib/sources/cryptography/ibe.move:78` ADD — `public fun decrypt_bid(dk: vector<u8>, identity: vector<u8>, ad: vector<u8>, ct: vector<u8>): Option<vector<u8>>` that calls the native `decrypt_bid_internal` and never aborts on bad input. A public stdlib function cannot be removed after release, so it is not stubbed here.
- `aptos-move/framework/aptos-stdlib/sources/cryptography/ibe.move:97` ADD — `native fun decrypt_bid_internal(dk: vector<u8>, identity: vector<u8>, ad: vector<u8>, ct: vector<u8>): Option<vector<u8>>;` goes here, in the same commit that registers `native_decrypt_bid` in `timelock::make_all`. A native declared without its Rust side breaks loading of this module.
- `aptos-move/framework/natives/src/timelock.rs:21` DOC — the gas table in the module doc above gains a `decrypt_bid_internal` row.
- `aptos-move/framework/natives/src/timelock.rs:204` ADD — `fn native_decrypt_bid(context, ty_args, args)` for `ibe::decrypt_bid_internal(dk, identity, ad, ct)`. It pops four byte vectors, charges gas before any decoding, calls `aptos_dkg::ibe::decrypt_bid_ct` and returns the plaintext or a failure flag. It never aborts on bad input. No Rust stub here: this crate is consensus code, and the stub would be dead until the Move declaration lands in the same commit.
- `aptos-move/framework/natives/src/timelock.rs:205` EDIT — `Option` is an enum in this move-stdlib (`public enum Option`), so a native cannot cheaply return one. Return `(bool, vector<u8>)` and let `ibe::decrypt_bid` build the `Option` in Move.
- `aptos-move/framework/natives/src/timelock.rs:206` EDIT — gas comes from existing parameters only: validated G1 and G2 decode, strict Ed25519 with per-byte hashing, one pairing, and a per-byte charge over `ct` and `ad`. No existing parameter prices HKDF or AES-GCM, so the per-byte parameter must be chosen and named.
- `aptos-move/framework/natives/src/timelock.rs:208` ADD — register `("decrypt_bid_internal", native_decrypt_bid)` in the table below, in the same commit as the Move native declaration.
- `aptos-move/framework/tests/move_unit_test.rs:147` TEST — a filtered Rust test for the Move tests of `ibe_native_test` and `ibe_golden_vector_tests`. One filter string cannot select both without `ibe_config_tests`, and the cargo filter `ibe` would also run ibe_config_move_unit_tests, so pick the names with care.
- `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md:184` DOC — section 6 states that the chain can decrypt a bid: `ibe::decrypt_bid` runs the step below on chain and returns none for a failed tag.
- `atomica/golden_vectors/README.md:20` DOC — add the price bid cases and what the product reads from them.
- `crates/aptos-dkg/src/ibe/ciphertext.rs:246` ADD — byte-level entry of the `decrypt_bid_internal` native: decode `dk` with `decode_g1`, check the 32-byte identity, parse `ct` with `BidCiphertext::from_bytes`, then call `decrypt_bid`.
- `crates/aptos-dkg/src/ibe/golden_vectors.rs:70` ADD — constants of the price bid cases: three bidder bytes, their u64 prices, and one plaintext that is not 8 bytes.
- `crates/aptos-dkg/src/ibe/golden_vectors.rs:550` ADD — a sibling `price_bid_cases()` with its own RNG seed. Drawing from the rng below before the existing cases would change their bytes and break the byte-identical criterion.
- `crates/aptos-dkg/src/ibe/golden_vectors.rs:742` EDIT — a new JSON section for the price bids, and a version bump. The product keeps byte copies of this file (state-proofs fixtures, SDK tests) that must be refreshed.
- `crates/aptos-dkg/src/ibe/golden_vectors.rs:1016` ADD — Move accessors for the price bids. The issue names none and the product tests need them. Proposed: `price_bid_bidders(): vector<address>`, `price_bid_prices(): vector<u64>`, `price_bid_cts()`, `price_bid_ads()`, `bad_length_bid_ct()`, `bad_length_bid_ad()`.
- `crates/aptos-dkg/src/ibe/golden_vectors.rs:1081` TEST — existing_bid_cases_are_byte_identical_after_the_price_bids_are_added (pins the 15 existing case ciphertexts).
- `crates/aptos-dkg/src/ibe/golden_vectors.rs:1097` TEST — extend with the price bids: each decrypts to its 8-byte little-endian price under its own bidder's associated data and fails under another bidder's.
- `crates/aptos-dkg/src/ibe/tests.rs:679` TEST — byte_level_decrypt_matches_typed_decrypt_and_fails_for_each_malformed_input (47-byte dk, 31-byte identity, empty ct, wrong ad).
- `crates/aptos-dkg/src/ibe/tests.rs:725` EDIT — `ibe_native_test.move` has no plaintext fixture for its ciphertext. Print one here, or test decryption on the golden fixtures only.

**Issue text corrections:**
- `Option` is a Move `enum` in this move-stdlib (`public enum Option`). A native cannot cheaply build one. Return `(bool, vector<u8>)` from the native and build the `Option` in Move.
- No existing gas parameter prices HKDF or AES-GCM. "Existing parameters only" means reusing a per-byte hash charge. Name the one you reuse.
- The golden fixtures record one plaintext (`bid_plaintext`). Case 0 is the only golden case that opens, so the "every case whose flag is true" test covers one case.
- `ibe_native_test.move` has no plaintext fixture for its ciphertext. The ignored generator in `ibe/tests.rs:725` must print one, or decrypt tests use the golden fixtures only.
- The new price cases need their own RNG seed. Drawing from the existing rng before the old cases changes their bytes and breaks the byte-identical criterion.
- The issue names no Move accessors for the price cases. The product tests need them in `ibe_golden_vector_fixtures.move` (generated).
- The cargo filter `ibe` also matches `ibe_config_move_unit_tests` (225). Pick distinct Rust test names.
- Stale doc: the `ibe.move` module table names a Cargo feature `natives-port-timelock` that does not exist.

**Hidden costs:**
- A Move `native fun` declared without its Rust registration breaks loading of `aptos_std::ibe`. Declare and register in one commit.
- The e2e gas tests run genesis from `head.mrb`. They fail on the first push until the refreshed bundle is committed.
- The JSON vectors change. The product keeps byte copies (`state-proofs/typescript/tests/fixtures/ibe_v2_golden_vectors.json`, inline constants in `sealed-bid.test.ts`). The SDK scout marked those.
- No workflow runs `ibe_gas::` today.

**Cross-issue pressure:**
- 240 removes the reconstruct native from the same files: `ibe.move`, `natives/src/timelock.rs`, `ibe_native_test.move`, `ibe_gas.rs`, `ibe_gas.data`. Land 240 first, then 227 adds into a smaller file.
- 228 (product) needs this native and a pin bump.

**CI:**
- `cargo test -p aptos-dkg` runs in Crypto Crates Tests (required). The Move ibe tests run only in Node and Framework Tests (not required) today.

## 228 Auction opens bids from ciphertexts

**Sites marked:** 5 (ADD 0, EDIT 4, REMOVE 0, TEST 0, DOC 1)

**Sites:**
- `aptos-move/framework/aptos-stdlib/sources/cryptography/ibe.move:79` EDIT — the product `auction::open_bids` calls `decrypt_bid` once per bid with the key and identity from the timelock registry.
- `aptos-move/framework/natives/src/timelock.rs:207` EDIT — the product `auction::open_bids` pays this charge once per bid; the 100-bid gas test bounds the batch size it may pass.
- `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md:185` DOC — the product auction opens bids with `ibe::decrypt_bid`; the bid plaintext is the 8-byte little-endian price.
- `crates/aptos-dkg/src/ibe/ciphertext.rs:247` EDIT — the product auction reaches this function through `aptos_std::ibe::decrypt_bid` when it opens bids on chain.
- `crates/aptos-dkg/src/ibe/golden_vectors.rs:1017` EDIT — the product Move tests import these accessors from `aptos_framework::ibe_golden_vector_fixtures` at the pinned framework rev.

**Issue text corrections:**
- The fork side is 227. The fork sites here only record what the product reads: `ibe::decrypt_bid`, the per-bid gas charge and the price fixtures.

**Hidden costs:**
- The 100-bid gas test in 227 sets the batch size `open_bids` may take.

**Cross-issue pressure:**
- 228 bumps the product framework pin. Any fork revision past 225 breaks product timelock registration unless 243 ships in the same bump.

## 229 Share verifier called directly

**Sites marked:** 25 (ADD 1, EDIT 7, REMOVE 13, TEST 1, DOC 3)

**Sites:**
- `.github/workflows/README.md:191` DOC — the crypto-crates-tests.yml row below gains the TimelockShare VM tests.
- `.github/workflows/crypto-crates-tests.yml:167` ADD — guarded step for the TimelockShare VM tests, which run only in the non-required Timelock Tests workflow today.
- `.github/workflows/timelock-tests.yml:131` EDIT — the floor of 9 stays (one test removed, one added). Once Crypto Crates Tests runs these tests, this job repeats them.
- `aptos-move/aptos-vm/src/validator_txns/mod.rs:74` REMOVE — all six re-exports. The issue names the two lines; `ShareCheckError`, `ShareCheckRequest` and `TimelockShareVerifier` go with them.
- `aptos-move/aptos-vm/src/validator_txns/timelock.rs:29` DOC — step 3 of the module doc above loses the verifier trait, the install call and the fail-closed sentence. The handler calls `aptos_dkg::ibe::verify_player_shares` directly.
- `aptos-move/aptos-vm/src/validator_txns/timelock.rs:79` REMOVE — failure code `ShareVerifierUnavailable` (0x30401).
- `aptos-move/aptos-vm/src/validator_txns/timelock.rs:90` REMOVE — `ShareCheckRequest`. The issue does not name it; it only feeds the trait and is re-exported from `validator_txns/mod.rs`.
- `aptos-move/aptos-vm/src/validator_txns/timelock.rs:112` REMOVE — `ShareCheckError`. The issue does not name it; it goes with the trait.
- `aptos-move/aptos-vm/src/validator_txns/timelock.rs:116` REMOVE — trait `TimelockShareVerifier`.
- `aptos-move/aptos-vm/src/validator_txns/timelock.rs:128` REMOVE — `BonehFranklinShareVerifier`. Its one-line body moves into the handler.
- `aptos-move/aptos-vm/src/validator_txns/timelock.rs:142` REMOVE — `install_boneh_franklin_share_verifier`.
- `aptos-move/aptos-vm/src/validator_txns/timelock.rs:148` REMOVE — the process global, with `set_timelock_share_verifier` and `current_share_verifier` below and the `std::sync::{Arc, RwLock}` import.
- `aptos-move/aptos-vm/src/validator_txns/timelock.rs:375` REMOVE — the verifier lookup and the `ShareVerifierUnavailable` discard.
- `aptos-move/aptos-vm/src/validator_txns/timelock.rs:448` EDIT — call `ibe::verify_player_shares(&identity, &shares, &verification_keys)` here. A failure still drops the session and reports the rejected share.
- `aptos-move/aptos-vm/src/validator_txns/timelock.rs:648` REMOVE — `AcceptAll` and the test `no_verifier_means_fail_closed` below.
- `aptos-move/aptos-vm/src/validator_txns/timelock.rs:675` EDIT — drop this entry; the 0x3040x range then holds one code.
- `aptos-move/aptos-vm/src/validator_txns/timelock.rs:683` EDIT — the tests below go through `BonehFranklinShareVerifier` and `ShareCheckRequest`. Rewrite them on `ibe::verify_player_shares` or drop them: the `player_shares_*` tests of aptos-dkg cover the same cases. No CI job runs the unit tests of this file today.
- `aptos-move/e2e-move-tests/src/tests/timelock_share.rs:10` EDIT — the module doc above and the LOCK mutex below exist only for the process global. Every install and uninstall call in this file goes, 17 calls in all.
- `aptos-move/e2e-move-tests/src/tests/timelock_share.rs:25` REMOVE — this import.
- `aptos-move/e2e-move-tests/src/tests/timelock_share.rs:263` REMOVE — this test. The outcome no longer exists.
- `aptos-move/e2e-move-tests/src/tests/timelock_share.rs:296` EDIT — passes with no verifier setup call anywhere in the file.
- `aptos-move/e2e-move-tests/src/tests/timelock_share.rs:316` EDIT — passes with no verifier setup call: one TimelockShareRejectedEvent, nothing stored.
- `aptos-move/e2e-move-tests/src/tests/timelock_share.rs:474` TEST — one_valid_share_block_gives_equal_outputs_in_two_fresh_harnesses (no setup call).
- `aptos-node/src/lib.rs:699` REMOVE — the install call below and its comment.
- `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md:151` DOC — no wrapper, no install call and no code 0x30401 after the change.

**Issue text corrections:**
- The issue names two re-exports. `validator_txns/mod.rs` re-exports six symbols. `ShareCheckError`, `ShareCheckRequest` and `TimelockShareVerifier` go too.
- Not named: `ShareCheckRequest` and `ShareCheckError` exist only to feed the trait.
- `timelock_share.rs` has 17 install or uninstall calls, a process-wide `LOCK` mutex and a module doc that exist only for the global.
- The unit tests in `timelock.rs` (`:683` onward) go through `BonehFranklinShareVerifier`. Rewrite them on `ibe::verify_player_shares` or drop them. The `player_shares_*` tests in aptos-dkg cover the same cases.
- The code-range test (`:675`) lists `ShareVerifierUnavailable`. Drop that entry.

**Hidden costs:**
- No CI job runs the unit tests of `aptos-vm` today. Only the e2e `timelock_share::` tests prove the handler.

**Cross-issue pressure:**
- 225 and 230 edit `timelock_share.rs` too (registrar setup, expired event decode). Land 229 first: it removes the lock and setup lines the others would otherwise edit around.

**CI:**
- `timelock_share::` runs only in Timelock Tests (not required). The new crypto-crates step makes it required.

## 230 Keep and emit the submitter list on expiry

**Sites marked:** 22 (ADD 3, EDIT 12, REMOVE 0, TEST 6, DOC 1)

**Sites:**
- `.github/workflows/crypto-crates-tests.yml:94` TEST — the BCS mirror test of `TimelockInfoResource` (types/src/timelock.rs) runs in the step below and must pass unchanged.
- `.github/workflows/crypto-crates-tests.yml:152` ADD — the ibe_config Move unit test step above (shared with issue 225).
- `.github/workflows/node-framework-tests.yml:128` EDIT — the same: the new ibe_config expiry tests run here and in the shared Crypto Crates step only.
- `aptos-move/e2e-move-tests/src/tests/timelock_share.rs:462` EDIT — decode the event and assert its `submitters` equals the authors of the accepted share transactions. No Rust mirror of this event exists yet, so the test needs one.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:177` EDIT — this list survives `expire()`. The field keeps its position: `TimelockInfoResource` (types/src/timelock.rs) mirrors the layout in BCS.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:227` EDIT — gains `submitters: vector<address>`. This changes the BCS layout of the event for every client and indexer that decodes it.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:692` EDIT — fill `submitters` from `info.submitters` (key-check-failed expiry). Read the list before or after `expire`, which now keeps it.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:699` EDIT — keep `info.submitters`. Still clear `submitted_shares`, `validator_indices`, `validator_weights` and `share_count`.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:740` EDIT — fill `submitters` from `info.submitters` (reveal-window-elapsed and epoch-ended expiry).
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:871` ADD — `#[view] public fun get_submitters(timelock_id: u64): vector<address>`, the validators whose share sets were accepted, in submission order. The list survives expiry for every reason; the stored shares are still dropped.
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:349` EDIT — also assert get_submitters and the event list for the key-check-failed expiry (reason 3).
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:412` EDIT — add get_submitters and event assertions (reason 2). The share count assertion stays.
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:413` TEST — expired_by_reveal_window_keeps_and_emits_two_submitters_in_submission_order
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:414` TEST — expired_by_epoch_end_keeps_and_emits_submitters
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:415` TEST — expired_by_key_check_keeps_and_emits_submitters
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:416` TEST — expired_with_no_accepted_share_has_an_empty_list_and_an_empty_event_list
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:483` EDIT — also assert get_submitters after the queue drains (reason 1).
- `aptos-move/framework/tests/move_unit_test.rs:145` TEST — the same Rust test as issue 225 (ibe_config_move_unit_tests), with the floor raised by four.
- `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md:211` DOC — the submitter list survives expiry, `TimelockExpiredEvent` carries it and `get_submitters` returns it.
- `dkg/src/timelock_share_service.rs:178` EDIT — no change: this reads `submitters` only while the stored status is Pending, so a list kept after expiry does not change the service.
- `types/src/timelock.rs:45` EDIT — no change: this mirror pins the `TimelockInfo` layout. Keeping `submitters` after expiry must not move a field.
- `types/src/timelock.rs:46` ADD — a Rust mirror of `TimelockExpiredEvent` with `submitters` for the e2e event assertion in timelock_share.rs. None exists today.

**Issue text corrections:**
- No Rust mirror of `TimelockExpiredEvent` exists. The e2e acceptance criterion (decode the event and check `submitters`) needs a new mirror type.
- The share service needs no change. It reads `submitters` only while the stored status is `Pending`.

**Hidden costs:**
- `TimelockExpiredEvent` gains a field. That changes its BCS layout for every client and indexer. No product source decodes it today (grep of the product worktree).
- Expired timelocks keep their submitter vectors in the table. That is a small permanent storage cost per expired timelock.

**Cross-issue pressure:**
- Shares the `ibe_config` Rust test and crypto-crates step with 225 and 226.

**CI:**
- The mirror test runs in Crypto Crates Tests, step "Run aptos-types tests" (required).

## 231 Align chain epochs and signal a missing key

**Sites marked:** 68 (ADD 9, EDIT 48, REMOVE 0, TEST 8, DOC 3)

**Sites:**
- `.github/workflows/README.md:192` DOC — the crypto-crates-tests.yml row below gains the timelock_dkg Move unit tests.
- `.github/workflows/crypto-crates-tests.yml:145` ADD — the aptos-vm-genesis step above also runs the epoch boundary check test.
- `.github/workflows/crypto-crates-tests.yml:154` ADD — guarded step for the timelock_dkg Move unit tests.
- `.github/workflows/debug-tests.yml:120` EDIT — the two genesis flag tests below gain the missing-key event assertions; the swarms need the UTC boundary layout values once the trigger changes.
- `.github/workflows/node-framework-tests.yml:126` EDIT — the same for the filtered timelock_dkg test.
- `aptos-move/aptos-transaction-simulation-session/src/session.rs:415` EDIT — not named in the issue. The simulation session computes the epoch boundary as `last_reconfiguration_time + epoch_interval`.
- `aptos-move/aptos-vm/src/validator_txns/timelock_dkg.rs:198` EDIT — with UTC-anchored epochs the handler passes what `ibe_config` needs for the next boundary, not `block::get_epoch_interval_secs`.
- `aptos-move/e2e-move-test-harness/src/lib.rs:834` EDIT — not named in the issue. The test harness forces an epoch change by passing `last_reconfiguration_time + epoch_interval`. If UTC boundaries replace the interval rule for every chain, every harness test that changes epochs breaks, so the boundary rule must be opt-in.
- `aptos-move/e2e-move-tests/src/tests/timelock_dkg.rs:194` TEST — also assert one `TimelockKeyMissingEvent` with the new epoch in the reconfiguration output of `end_epoch`.
- `aptos-move/framework/aptos-framework/sources/block.move:25` EDIT — do not add the UTC boundaries as a field here. `types/src/account_config/events/new_block.rs` mirrors this layout in BCS. Use a new resource.
- `aptos-move/framework/aptos-framework/sources/block.move:134` EDIT — decide what a governance change of the interval means once epochs end at fixed UTC times.
- `aptos-move/framework/aptos-framework/sources/block.move:150` EDIT — the `TimelockDKGResult` handler reads this view to fill `TimelockEpochConfig.epoch_interval_us`. With UTC boundaries it needs the boundary values instead.
- `aptos-move/framework/aptos-framework/sources/block.move:235` EDIT — legacy prologue. This trigger calls `reconfiguration::reconfigure()` directly and never reaches `timelock_dkg::on_new_epoch`, so it emits no missing-key event. Decide whether it also moves to the UTC boundary.
- `aptos-move/framework/aptos-framework/sources/block.move:267` EDIT — start the reconfiguration at the first block at or past the next configured UTC boundary, not at `last_reconfiguration_time + epoch_interval` (owner questions 1 and 2). This path runs `try_start`, which starts no timelock DKG.
- `aptos-move/framework/aptos-framework/sources/block.move:306` EDIT — start the reconfiguration at the first block at or past the next configured UTC boundary (owner questions 1 and 2).
- `aptos-move/framework/aptos-framework/sources/block.move:343` EDIT — start the reconfiguration at the first block at or past the next configured UTC boundary (owner questions 1 and 2). This is the prologue a chain with decryption on runs.
- `aptos-move/framework/aptos-framework/sources/genesis.move:139` ADD — genesis step that stores the UTC epoch boundaries from the layout.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:102` EDIT — the guard stays 15 minutes, but genesis must keep every epoch boundary at least guard plus reveal window (25 minutes) away from the 07:45 and 16:15 UTC closes.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:142` EDIT — with UTC-anchored epochs the end is the next configured boundary, not start plus interval. `TimelockEpochConfigResource` (types/src/dkg/timelock_dkg.rs) mirrors this struct in BCS, so a changed field changes both.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:440` EDIT — returns the next configured UTC epoch boundary instead of `last_reconfiguration_time + epoch_interval_us`, so the guard and `reveal_expiry_us` use the real epoch end.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:466` EDIT — `epoch_end` becomes the next UTC boundary, so a deadline at 07:45 or 16:15 UTC passes the guard in the epoch that holds it.
- `aptos-move/framework/aptos-framework/sources/reconfiguration_with_dkg.move:41` EDIT — owner question 4: this path never calls `timelock_dkg::start`, so the next epoch has no timelock key.
- `aptos-move/framework/aptos-framework/sources/reconfiguration_with_dkg.move:133` EDIT — the only call of `on_new_epoch`. The missing-key event is emitted inside it, in this reconfiguration transaction, and must never abort it.
- `aptos-move/framework/aptos-framework/sources/reconfiguration_with_dkg.move:154` EDIT — the watchdog comment above assumes the reconfiguration starts at `last_reconfiguration_time + epoch_interval`. Restate it for a start at the UTC boundary.
- `aptos-move/framework/aptos-framework/sources/timelock_dkg.move:58` ADD — `#[event] struct TimelockKeyMissingEvent has drop, store { epoch: u64 }`, emitted in the reconfiguration transaction by `on_new_epoch` when the feature is on and no `TimelockEpochConfig` was written for the new epoch. A new event type is new framework code, so it is not declared here.
- `aptos-move/framework/aptos-framework/sources/timelock_dkg.move:180` EDIT — owner question 4: only `try_start_with_chunky_dkg` calls this. A reconfiguration through `try_start` gives an epoch with no key, which the new event then reports.
- `aptos-move/framework/aptos-framework/sources/timelock_dkg.move:260` EDIT — emit `TimelockKeyMissingEvent { epoch }` on every path below that writes no config while the feature is on. The function does not read `state.enabled` today, so the feature-off case needs a new check.
- `aptos-move/framework/aptos-framework/sources/timelock_dkg.move:268` EDIT — emit here when `state.enabled`: no session completed for the new epoch.
- `aptos-move/framework/aptos-framework/sources/timelock_dkg.move:272` EDIT — emit here too: a config that waits for a later epoch leaves this epoch without a key.
- `aptos-move/framework/aptos-framework/sources/timelock_dkg.move:275` EDIT — emit here: a stale config was dropped.
- `aptos-move/framework/aptos-framework/sources/timelock_dkg.move:278` EDIT — emit here: `ibe_config` refuses the config. The epoch change must still not abort.
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:167` EDIT — EPOCH_INTERVAL with time 0 as the epoch start models the interval rule. The boundary rule needs a UTC-anchored setup for this test and the next one.
- `aptos-move/framework/aptos-framework/tests/ibe_config_tests.move:168` TEST — register_accepts_0745_and_1615_utc_deadlines_in_the_epoch_that_holds_them (reveal_expiry_us equals the deadline plus 10 minutes).
- `aptos-move/framework/aptos-framework/tests/timelock_dkg_tests.move:93` EDIT — also assert exactly one TimelockKeyMissingEvent with the new epoch.
- `aptos-move/framework/aptos-framework/tests/timelock_dkg_tests.move:94` TEST — no_key_missing_event_when_the_session_completed
- `aptos-move/framework/aptos-framework/tests/timelock_dkg_tests.move:95` TEST — no_key_missing_event_while_the_feature_is_off
- `aptos-move/framework/aptos-framework/tests/timelock_dkg_tests.move:96` TEST — key_missing_event_for_a_config_of_another_epoch_and_for_a_refused_config (the epoch change does not abort)
- `aptos-move/framework/aptos-framework/tests/timelock_dkg_tests.move:97` TEST — block_prologue_starts_the_reconfiguration_at_the_first_block_at_or_past_the_utc_boundary (also when the last epoch started late). This one needs the block prologue, so it may belong in a new block test file.
- `aptos-move/framework/aptos-framework/tests/timelock_dkg_tests.move:109` EDIT — assert the missing-key event here too (stale config).
- `aptos-move/framework/tests/move_unit_test.rs:146` TEST — timelock_dkg_move_unit_tests: runs the Move tests of `timelock_dkg_tests` (12 today).
- `aptos-move/vm-genesis/src/lib.rs:135` ADD — fields for the UTC epoch boundaries (shape depends on owner question 1).
- `aptos-move/vm-genesis/src/lib.rs:383` ADD — genesis step that stores the epoch boundaries.
- `aptos-move/vm-genesis/src/lib.rs:469` EDIT — fail when a configured epoch boundary is within 25 minutes of 07:45 or 16:15 UTC.
- `aptos-move/vm-genesis/src/lib.rs:589` EDIT — the interval is the only epoch input at genesis today. The boundaries are a second input, and `validate_genesis_config` must check the two agree.
- `aptos-move/vm-genesis/src/lib.rs:1571` EDIT — carry the UTC epoch boundary values here.
- `aptos-move/vm-genesis/src/lib.rs:1630` EDIT — carry the UTC epoch boundary values here.
- `aptos-move/vm-genesis/src/lib.rs:1661` TEST — genesis_rejects_an_epoch_boundary_within_25_minutes_of_a_close.
- `atomica/docker/tests/generate-genesis-host.sh:59` EDIT — add the epoch boundary values next to `epoch_duration_secs: 7200`.
- `atomica/docker/tests/generate-genesis.sh:99` EDIT — add the epoch boundary values next to `epoch_duration_secs: 7200`.
- `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md:247` DOC — `epoch_end_us` becomes the next configured UTC boundary. State the alignment rule: every boundary is at least 25 minutes from 07:45 and 16:15 UTC.
- `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md:253` DOC — restate the longest bid window for the chosen epoch length (12 hours assumed).
- `crates/aptos-genesis/src/builder.rs:453` ADD — fields for the UTC epoch boundaries (shape depends on owner question 1).
- `crates/aptos-genesis/src/builder.rs:687` EDIT — carry the UTC epoch boundary values here.
- `crates/aptos-genesis/src/config.rs:105` ADD — `#[serde(default)]` layout fields for the UTC epoch boundaries.
- `crates/aptos-genesis/src/config.rs:161` EDIT — carry the UTC epoch boundary values here.
- `crates/aptos-genesis/src/lib.rs:88` ADD — fields for the UTC epoch boundaries (shape depends on owner question 1).
- `crates/aptos-genesis/src/lib.rs:138` EDIT — carry the UTC epoch boundary values here.
- `crates/aptos-genesis/src/lib.rs:182` EDIT — carry the UTC epoch boundary values here.
- `crates/aptos-genesis/src/mainnet.rs:157` EDIT — carry the UTC epoch boundary values here.
- `crates/aptos/src/genesis/mod.rs:269` EDIT — carry the UTC epoch boundary values here.
- `crates/aptos/src/genesis/mod.rs:322` EDIT — carry the UTC epoch boundary values here.
- `crates/aptos/src/node/mod.rs:1472` EDIT — not named in the issue. `aptos node show-epoch-info` reports the next epoch start as `last_reconfig + epoch_interval`.
- `execution/executor-benchmark/src/transaction_generator.rs:243` EDIT — not named in the issue. The executor benchmark derives the epoch change time from the interval.
- `testsuite/smoke-test/src/timelock_e2e.rs:323` EDIT — set the epoch boundary values so the 20 and 30 minute test epochs still change.
- `testsuite/smoke-test/src/timelock_e2e.rs:1053` EDIT — also assert that no TimelockKeyMissingEvent exists for epoch 2.
- `testsuite/smoke-test/src/timelock_e2e.rs:1070` EDIT — also assert that no TimelockKeyMissingEvent exists with the flag unset.
- `types/src/dkg/timelock_dkg.rs:181` EDIT — BCS mirror of `timelock_dkg::PendingTimelockConfig`. Keep `epoch_interval_us` and put the UTC boundaries in a new resource, so neither this layout nor `TimelockEpochConfig` moves.
- `types/src/dkg/timelock_dkg.rs:791` EDIT — BCS mirror of `ibe_config::TimelockEpochConfig`. A field the epoch alignment adds, drops or renames changes here in the same commit, or every node fails to read the config.

**Issue text corrections:**
- `on_new_epoch` does not read `state.enabled` today. The "no event while the feature is off" rule needs a new check.
- The legacy prologue (`block.move:235`) calls `reconfiguration::reconfigure()` directly and never reaches `on_new_epoch`. It emits no event on that path.
- The `try_start` prologue (`block.move:267`) starts no timelock DKG (owner question 4).
- `BlockResource` is mirrored in BCS by `types/src/account_config/events/new_block.rs`. Do not add the boundaries as a field. Use a new resource.
- `TimelockEpochConfig.epoch_interval_us` and `PendingTimelockConfig` are mirrored in `types/src/dkg/timelock_dkg.rs`. Keep their layout.
- Not named, all derive the epoch end from the interval: the e2e test harness (`e2e-move-test-harness/src/lib.rs:834`), the simulation session (`session.rs:415`), `aptos node show-epoch-info` (`crates/aptos/src/node/mod.rs:1472`) and the executor benchmark (`transaction_generator.rs:243`). A boundary rule applied to every chain breaks every harness test that changes epochs. Make it opt-in.
- The reconfiguration watchdog comment (`reconfiguration_with_dkg.move:154`) assumes a start at `last_reconfiguration_time + epoch_interval`.
- `ibe_config_tests` models the epoch start as time 0 plus `EPOCH_INTERVAL`. The UTC tests need a new setup.
- `timelock_dkg_tests` holds 12 tests today. They pass with the CLI filter run below.

**Hidden costs:**
- Owner questions 1 to 3 block the alignment half. The event half is ready.
- A new event type is new framework code. I did not declare it.
- Smoke tests use 20 and 30 minute epochs. They need boundary values that still change epochs, or the rule must be opt-in.

**Cross-issue pressure:**
- 223 and 225 add layout fields in the same struct literals and docker lines.
- 243 (product) surfaces `E_DEADLINE_AFTER_EPOCH_END` (9) from the same guard.
- The product testnet uses a 24 hour epoch (UI scout). Product live tests must stay 25 minutes clear of a boundary once the pin moves.

**CI:**
- `timelock_dkg_tests` run only in Node and Framework Tests (not required) today. The genesis flag swarms run in Debug Smoke Tests (required).

## 240 Remove the retired prototype, legacy vectors and unused native

**Sites marked:** 32 (ADD 0, EDIT 4, REMOVE 17, TEST 0, DOC 11)

**Sites:**
- `.github/workflows/README.md:193` DOC — the timelock-tests.yml row below names the prototype. It becomes the TimelockShare VM tests row; the row never listed that job.
- `.github/workflows/timelock-tests.yml:3` REMOVE — the header paragraph about the `timelock` prototype job (through "Remove that job when the prototype folder is deleted").
- `.github/workflows/timelock-tests.yml:23` REMOVE — push path filter of the prototype.
- `.github/workflows/timelock-tests.yml:38` REMOVE — pull request path filter of the prototype.
- `.github/workflows/timelock-tests.yml:65` REMOVE — the whole `timelock` job (format check and tests of the prototype crate).
- `aptos-move/e2e-move-tests/src/tests/ibe_gas.data/p/sources/test.move:18` REMOVE — the reconstruct entry, with the G1 and vector imports it alone uses.
- `aptos-move/e2e-move-tests/src/tests/ibe_gas.rs:53` REMOVE — this helper and the SHARES fixture above. The issue names line 98 only.
- `aptos-move/e2e-move-tests/src/tests/ibe_gas.rs:99` REMOVE — the reconstruct gas assertions through the end of this test.
- `aptos-move/framework/aptos-framework/tests/ibe_golden_vector_tests.move:10` DOC — the module doc above names the weighted reconstruction native, which goes.
- `aptos-move/framework/aptos-framework/tests/ibe_golden_vector_tests.move:165` REMOVE — this section. The issue names line 167 only; the helper and its three tests go: threshold_sets_rebuild_the_key, below_threshold_aborts, one_wrong_share_gives_a_key_that_fails_the_check. The Rust golden tests keep covering reconstruction.
- `aptos-move/framework/aptos-framework/tests/ibe_native_test.move:43` REMOVE — this helper, the ten reconstruct tests and a_bad_share_gives_a_key_that_fails_the_check (through the end of the reconstruct section), and the shares, weights and non_subgroup_g1 fixtures above that they alone use.
- `aptos-move/framework/aptos-stdlib/sources/cryptography/ibe.move:20` DOC — the module table and the abort code paragraph above lose `reconstruct_ibe_dk`.
- `aptos-move/framework/aptos-stdlib/sources/cryptography/ibe.move:21` REMOVE — `reconstruct_ibe_dk` has no caller outside tests; the `TimelockShare` handler rebuilds the key in Rust.
- `aptos-move/framework/aptos-stdlib/sources/cryptography/ibe.move:81` REMOVE — native declaration of the unused reconstruction native.
- `aptos-move/framework/natives/src/timelock.rs:22` DOC — the gas table row of `reconstruct_ibe_dk_internal` goes.
- `aptos-move/framework/natives/src/timelock.rs:23` EDIT — `IbeError` and `MAX_TOTAL_WEIGHT` are imported only for the reconstruction native.
- `aptos-move/framework/natives/src/timelock.rs:36` REMOVE — both abort codes of the reconstruction native.
- `aptos-move/framework/natives/src/timelock.rs:43` REMOVE — not named in the issue: `FR_MULS_PER_G1_SCALAR_MUL`, `abort_reconstruction`, `invalid` and `log2_ceil` serve only the reconstruction native. Left behind, they fail Clippy Lints as dead code.
- `aptos-move/framework/natives/src/timelock.rs:62` REMOVE — `native_reconstruct_ibe_dk` and its banner comment.
- `aptos-move/framework/natives/src/timelock.rs:214` REMOVE — this table entry. The `as RawSafeNative` cast moves to the first remaining entry.
- `atomica/docs/decisions/aptos-upgrade-crypto-review-packet.md:11` DOC — three places in this packet name the prototype folder (here, the test run line in section 0, and section 8c). Each points at the last fork commit that held it.
- `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md:32` DOC — the reconstruct native goes. The path given here is also stale: the natives live in aptos-move/framework/natives/src/timelock.rs.
- `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md:157` DOC — `kept behind the ibe::reconstruct_ibe_dk native` is no longer true. The issue names lines 32 and 268 only.
- `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md:271` DOC — point at the last fork commit that held the prototype.
- `atomica/docs/testing/ibe-golden-tests-summary.md:43` DOC — not named in the issue. This summary and the plan and technical notes under atomica/docs describe the removed native as live.
- `atomica/golden_vectors/README.md:12` DOC — this line goes with the folder.
- `atomica/proto-fptx-timelock/README.md:1` REMOVE — whole directory atomica/proto-fptx-timelock (Cargo.toml, Cargo.lock, rust-toolchain.toml, src, tests). It is not a workspace member.
- `atomica/scripts/generate_move_fixtures.py:2` REMOVE — whole file. Not named in the issue: this script reads only the legacy V1 vector format, and the path in its usage text no longer exists.
- `crates/aptos-dkg/src/ibe/golden_vectors.rs:786` EDIT — the header text below names the legacy vector folder in two lines. Changing it regenerates `ibe_golden_vector_fixtures.move`, a shipped framework module, so head.mrb goes stale.
- `crates/aptos-dkg/src/ibe/golden_vectors.rs:787` EDIT — `reconstruction_sets`, `below_threshold_sets`, `poisoned_shares` and `poisoned_dk` lose their only Move readers when the reconstruction tests go. Drop the accessors or keep them on purpose.
- `crates/aptos-dkg/src/ibe/mod.rs:469` DOC — the doc below names the removed native. The function stays: the `TimelockShare` handler calls it.
- `crates/aptos-dkg/src/ibe/tests.rs:726` EDIT — this ignored generator prints the fixtures of `ibe_native_test.move`, including the reconstruction shares. Trim it with the tests.

**Issue text corrections:**
- Not named: `FR_MULS_PER_G1_SCALAR_MUL`, `abort_reconstruction`, `invalid` and `log2_ceil` in `natives/src/timelock.rs` serve only the reconstruction native. Left behind they fail Clippy Lints as dead code. The import of `IbeError` and `MAX_TOTAL_WEIGHT` goes too.
- Not named: `atomica/scripts/generate_move_fixtures.py` reads only the V1 vector format. Its usage path does not exist.
- The issue names `ibe_golden_vector_tests.move:167` only. The whole reconstruction section goes: one helper and three tests. The module doc names the native too.
- The issue names `ibe_gas.rs:98` only. The `reconstruct` helper, the `SHARES` fixture and the `reconstruct` entry in `ibe_gas.data` go too.
- `ibe_native_test.move` loses ten reconstruct tests, one bad-share test and the fixtures they alone use.
- The generated fixture accessors `reconstruction_sets`, `below_threshold_sets`, `poisoned_shares` and `poisoned_dk` lose their only Move readers.
- Spec section 2 (`:32`) also gives a stale path for the natives. Spec `:157` says the key stays behind the native. The issue names only `:32` and `:268`.
- `atomica/docs/testing/ibe-golden-tests-summary.md` describes the native as live.
- The acceptance grep `git grep -nE 'proto-fptx-timelock|legacy-v1/'` excludes `atomica/docs`, but scout markers outside docs must be gone too. I reworded the one marker that matched.

**Hidden costs:**
- Changing the generated header text regenerates `ibe_golden_vector_fixtures.move`, a shipped framework module. That alone makes `head.mrb` stale.
- `aptos_dkg::ibe::reconstruct_ibe_dk_from_g1_shares` stays. The handler calls it.

**Cross-issue pressure:**
- 227 adds to the same files. Land 240 first.

**CI:**
- The `timelock` prototype job in Timelock Tests is not required. Its removal speeds that workflow.

## 242 Canonical docs match the code

**Sites marked:** 4 (ADD 0, EDIT 2, REMOVE 0, TEST 0, DOC 2)

**Sites:**
- `aptos-move/framework/aptos-framework/sources/reconfiguration_with_dkg.move:97` EDIT — the timelock session takes `chunky_dkg_config::current()`, shared with the mempool session (secrecy 1/2 and reconstruction 2/3 of stake by default). A 67 percent secrecy bound for bids needs its own config or changes both sessions (owner decision 31).
- `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md:103` DOC — this spec never states the secrecy bound. It is 1/2 of stake by default, from the chunky DKG config the timelock session shares with the mempool session. The PRD sentence on bid secrecy depends on it.
- `atomica/docs/definitions.md:74` DOC — reconstruction needs 2/3 of stake. Secrecy holds only against at most 1/2 of stake (fork default); this file does not say so.
- `types/src/on_chain_config/chunky_dkg_config.rs:28` EDIT — the default below (secrecy 1/2, reconstruction 2/3 of stake) is what the timelock DKG gets, because it shares this config with the mempool session. Only if the owner picks the 67 percent secrecy bound does this change (owner decision 31).

**Issue text corrections:**
- The fork secrecy bound is 1/2 of stake by default. The timelock session takes `chunky_dkg_config::current()`, shared with the mempool session. No fork doc states the secrecy bound. `atomica/docs/definitions.md` gives only the 2/3 reconstruction threshold.

**Hidden costs:**
- If the owner picks a 67 percent secrecy bound (decision 31), the fork needs its own timelock DKG config or changes both sessions. That is a new fork issue, not a doc change.

## 243 create_auction registers the window's timelock

**Sites marked:** 9 (ADD 0, EDIT 8, REMOVE 0, TEST 0, DOC 1)

**Sites:**
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:92` EDIT — the product `auction::create_auction` surfaces this code (17) when the stored registrar is not the package's registrar object.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:199` EDIT — the product live test asserts that `sender` of the window's registration is the auction package's registrar address.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:454` EDIT — the product SDK, UI and test helpers stop calling this entry; a direct call from the operator account must abort with `E_NOT_REGISTRAR`.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:467` EDIT — the product `create_auction` surfaces `E_DEADLINE_AFTER_EPOCH_END` (9) from this guard when the window close is later than 15 minutes before the epoch end.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:519` EDIT — the product live test compares `timelock_registrar()` with `auction::timelock_registrar_address` and the SDK registrar address.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:521` EDIT — the product `auction::create_auction` calls `register_timelock_with_id` with its registrar object signer and stores the returned id for the window id.
- `aptos-move/framework/aptos-framework/sources/ibe_config.move:865` EDIT — the product Move tests read this before `create_auction` to pin the id that `register_timelock_with_id` returns.
- `atomica/docs/decisions/aptos-upgrade-ibe-chunky-spec.md:233` DOC — the registrar is the auction package's named object address, one timelock per window id.
- `crates/aptos-genesis/src/config.rs:106` EDIT — the product docker genesis writes `timelock_registrar` into this layout, with the named object address of `@atomica`.

**Issue text corrections:**
- The fork side is 225. These markers record where the product reads the fork: `register_timelock_with_id`, `timelock_registrar()`, `get_next_timelock_id`, error codes 17 and 9, and the `timelock_registrar` layout field.

**Cross-issue pressure:**
- Must ship with the fork revision that holds 225, in one product pin move (INFRA lesson). The product docker genesis must write `timelock_registrar`.

## No sites in this partition

216, 217, 218, 219, 220, 222, 224, 232, 233, 234, 235, 236, 237, 238, 239, 241.

I searched the fork for each of their symbols (`LockBox`, `lock_deadline`, `window_close`, `getDerivedAddress`, `reserve_price`, `claimed_locks`, `FakeUSD`, `price_commit`, `pair_hash`, `state-proofs`). The only hits were the `AuctionOutcome` vectors (marked under 221) and unrelated upstream code.

## Unmarkable sites

- `atomica/golden_vectors/legacy-v1/` (240): holds only `ibe_golden_vectors.json` and `ibe_golden_vectors.txt`. No README. The folder is listed here and in the `atomica/golden_vectors/README.md` marker.
- `atomica/proto-fptx-timelock/` (240): the whole directory goes. Marked once in its `README.md`.
- `aptos-move/framework/aptos-framework/sources/ibe_golden_vector_fixtures.move` (227, 240): generated by `golden_vectors.rs`. A hand edit breaks `regeneration_reproduces_checked_in_bytes`. The generator is marked instead.
- `atomica/golden_vectors/ibe_v2_golden_vectors.json` (227): generated JSON.
- `aptos-move/framework/cached-packages/src/head.mrb` (223, 225, 226, 227, 230, 231, 240): binary. It also goes stale with this stub merge (see Behaviour neutrality).
- `aptos-move/framework/cached-packages/src/aptos_framework_sdk_builder.rs` (225): generated. It changes only if a new function is an `entry`. The planned 225 functions are `public fun`, so it should not change.

## Seen outside my partition

- Product docker genesis (`source/docker-testnet/config/generate-genesis.sh`) runs chain id 4, so 223 needs no product change. It must write `timelock_registrar` for 225 and 243. The INFRA scout marked it.
- The product golden vector copy `source/state-proofs/typescript/tests/fixtures/ibe_v2_golden_vectors.json` must be recopied after 227. The SDK scout marked it.

## Check results

All runs are local, not CI. Rust runs used `CARGO_BUILD_JOBS=4 CARGO_TARGET_DIR=~/tmp/cargo-target-atomica-aptos`.

- `rustfmt +nightly --edition 2024 --check <the 30 touched .rs files>`: pass (exit 0). `cargo +nightly fmt -- --check` on single files needs the edition flag. With `--edition 2021` rustfmt fails on an existing let chain in `types/src/dkg/timelock_dkg.rs:773`. The repo `rustfmt.toml` sets `edition = "2024"`.
- `cargo clippy --no-deps --all-targets -p aptos-types -p aptos-dkg -p aptos-vm -p aptos-vm-genesis -p aptos-genesis -p aptos-dkg-runtime -p aptos-move-e2e-test-harness -p e2e-move-tests -p aptos-framework -p aptos-framework-natives -p aptos-transaction-simulation-session -- <xclippy flags from .cargo/config.toml>`: pass (exit 0, 38 s). This also type-checks those 11 crates.
- The same command without `--no-deps` fails before it reaches any touched crate: `aptos-metrics-core` (untouched) gives three `clippy::useless_conversion` errors under `-Dwarnings`. That is a base-state finding on this host, not caused by the stubs.
- Not run here: `aptos-node`, `aptos` (CLI), `smoke-test`, `aptos-executor-benchmark`. They depend on `dw-sys`, which needs `libdw`. This host lacks `libdw.pc` (the earlier scout's log shows the build-script panic). Their edits are `//` comment lines only, and rustfmt passes on them. CI's Clippy Lints job installs `libdw-dev` and covers them.
- `cargo test -p aptos-dkg --lib ibe::`: 24 passed, 0 failed, 3 ignored. This includes `golden_vectors::regeneration_reproduces_checked_in_bytes` and `checked_in_vectors_verify`.
- Move unit tests, run with the product `aptos` CLI 9.5.0 on a copy of the worktree framework (no build debris in the worktree): `aptos move test --package-dir aptos-move/framework/aptos-framework --skip-fetch-latest-git-deps --named-addresses aptos_framework=0x1 --filter ibe`: 77 of 77 passed. `--filter timelock_dkg`: 12 of 12 passed.
- Bytecode comparison: `aptos move compile` of the framework at `HEAD` and in the worktree. All 160 `.mv` files are byte-identical. Warning count is the same (3).
- Metadata comparison: the same compile with `--save-metadata --included-artifacts all`. `package-metadata.bcs` differs (`c71e780e…` against `1a138f7f…`). So `head.mrb` changes.
- Workflows: `yaml.safe_load` of each edited workflow equals `yaml.safe_load` of its `HEAD` version: `crypto-crates-tests.yml`, `debug-tests.yml`, `node-framework-tests.yml`, `timelock-tests.yml`.
- `bash -n` on the three touched shell scripts and `python3 -m py_compile atomica/scripts/generate_move_fixtures.py`: pass.
- Skipped as too heavy or forbidden here: swarms and smoke tests, `cargo test -p aptos-framework --test move_unit_test` (it builds the full framework test binary; the CLI run above covers the same Move tests), and the `cached-packages` regeneration.
- `git status --short`: 57 modified files, all inside the fork worktree, all intended. No untracked files.

## Suggested order

1. **240** (remove the prototype and the reconstruct native). It shrinks `ibe.move`, `natives/src/timelock.rs`, the ibe Move tests and the gas test before 227 adds to them. It is low risk.
2. **229** (verifier called directly). Rust only. It removes the lock and the 17 setup calls in `timelock_share.rs` that 225 and 230 would otherwise edit around. It moves `timelock_share::` into the required check, which 225 and 230 then rely on.
3. **226** (status reads expired), then **230** (submitter list). Both are small `ibe_config` changes. The first adds the shared `ibe_config` Rust test and crypto-crates step.
4. **223** (pinned parameters hash). It adds the first genesis layout field and the `aptos-vm-genesis` CI step.
5. **225** (registrar). It adds the second layout field. It must not reach a product pin before **243** is ready (INFRA lesson).
6. **227** (decrypt native). Independent of 223 and 225, but the product pin move for 228 then pulls in 225, so 228 and 243 move the pin together.
7. **231** (epoch alignment). The event half can land any time. The alignment half waits on owner questions 1 to 3 and touches the most shared genesis lines, so it goes last.

Every one of these except 229 changes framework Move sources and needs the `cached-packages.zip` refresh. Merging two of them in parallel makes the second one's `head.mrb` stale again. Merge them one at a time.
