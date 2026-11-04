# Aptos 1.49.6 Upgrade Review

**Date**: November 2, 2026; evidence recovery November 3; document audit November 4, 2026
**Status**: Review. No fix was merged. No heavy suite ran on the review host.
**Reviewed**:
- `bomba-atomica/atomica-aptos` at `e41b69f662` (`origin/dev-atomica`, the merge of the upgrade pr (17)). Its parents are `125d36b957` and `f7e4ead6f9`.
- `bomba-atomica/atomica` at `40d4a1b` (`origin/main`). This covers the alignment pr (146) through the CI split pr (151).

**Snapshot boundary (local, 2026-11-03)**: live `git ls-remote` still reports product `main` at `40d4a1bebc5a505d82857cde2965496ab63c0342` and fork `dev-atomica` at `e41b69f662cde4c40953b9576088f997bb31a126`. The documentation worktree starts at `96add40`; its only difference from the reviewed product snapshot is this report. All product file/line evidence below refers to `40d4a1b`; all fork file/line evidence refers to `e41b69f662` unless explicitly marked unreleased local.

**Related**: [Aptos Upgrade Cost Report](aptos-upgrade-cost-report.md), [Aptos Validator Timelock](../decisions/aptos-validator-timelock.md), [PRD](../specifications/prd.md)

**Labels**:
- **local** means a code read, a git query, or a light test run on the review host. Light tests are Move unit tests, Vitest unit suites, and one small debug `cargo test`.
- **CI** means a GitHub Actions run log or registry metadata.

No commit message, PR body, or doc written by the upgrade agent was taken as evidence.

**Review scope**: this is a bounded source and CI review of the named snapshots. Recovery rechecked the decisive integration failures and corrected several earlier overstatements. Historical verification notes below are scoped to their cited evidence; they do not certify every changed hunk. The coverage table identifies unresolved questions.

---

## Go / no-go

**No-go.** A real sealed-bid auction with encrypted bids, settlement, and refunds does not work on this chain today.

Five things block it, and each one stops the flow by itself:

1. The chain never publishes a timelock key (finding 1).
2. No validator submits a reveal share (finding 2).
3. The reveal would fail even with shares (finding 3).
4. The SDK cannot create an auction (finding 4).
5. The shipped product client cannot generate V2 encrypted bids (finding 5).

Green CI hides all five. The browser suites assert that create, bid, and settle fail (finding 4).

**Riskiest unknown**: no successful live multi-validator timelock reveal was established by the reviewed source and available CI evidence. Fixes for findings 2 and 3, and a swarm smoke test, exist only as unpushed local commits on the review host's `dev-atomica` (finding 9). This review did not establish whether the timelock DKG, share service, and reveal work together on four or more validators.

---

## Findings, most severe first

| # | Finding | Verdict | Label |
|---|---|---|---|
| 1 | Timelock DKG is off at genesis, so no timelock key exists | broken | local |
| 2 | No node code submits `TimelockShare` transactions | broken | local |
| 3 | Reveal rebuilds the key with the wrong weights list | broken | local |
| 4 | `create_auction` payload has 5 arguments, not 6, and the browser tests swallow the failure | broken | local + CI |
| 5 | No bid encryptor and no off-chain decryptor in the product | broken | local + CI |
| 6 | Anyone can settle an empty auction, and an unregistered timelock is accepted | broken | local (Move tests) |
| 7 | Refunds and claims move no assets on Ethereum | broken | local |
| 8 | `TimelockDKGResult` execution reads a node-local file | broken | local |
| 9 | Release cut from `origin/dev-atomica` while 72 fix commits sat unpushed | suspect | local + CI |
| 10 | SDK and most web-component unit tests run in no CI job | broken | local + CI |
| 11 | State proof has no trusted root, and one lock can be registered twice | suspect | local |
| 12 | 2-hour epoch cannot hold the 4-hour bid window | suspect | local |
| 13 | Release node is built with `--features testing` | suspect | local + CI |
| 14 | Timelock parameters exist only as a test fallback on chain id 4 | suspect | local |
| 15 | Every live timelock test was dropped. The Move test bypass rests on a false premise | suspect | local |
| 16 | Required checks are narrow and misnamed, with a skip race | suspect | CI |
| 17 | Move contracts depend on the moving `dev-atomica` branch | suspect | local + CI |
| 18 | 10x gas loosening is real, but the default `maxGasAmount` did not grow | weakened-but-justified | local + CI |
| 19 | Healthcheck that accepts 503 only means "port open" | weakened-but-justified | local + CI |
| 20 | `validator-sync.test.ts` passes a halted or forked chain | suspect | CI |
| 21 | Committed `dist/` folders carry the old bid ABI | suspect | local |
| 22 | Pre-release image also tagged `latest`. A fallback uses `latest` | suspect | CI |
| 23 | Golden vectors use test PVSS parameters | weakened-but-justified | local + CI |
| 24 | Items verified as correct | verified | local + CI |

---

### 1. The timelock DKG is off at genesis. The chain never publishes a timelock key.

- **Claim checked**: the chain publishes a per-epoch timelock master public key (MPK) that bidders encrypt to.
- **Verdict**: **broken**. This is a regression. The old fork published an MPK every epoch through the randomness DKG (`aptos-vm/src/validator_txns/dkg.rs` at `125d36b957`).
- **Evidence (local)**:
  - `aptos-move/framework/aptos-framework/sources/timelock_dkg.move:82-96` at `e41b69f662` creates the state with `enabled: false`. The module says it is "off until governance calls `enable`".
  - `genesis.move` only calls `timelock_dkg::initialize`.
  - `git grep -n "timelock_dkg::enable" e41b69f662` finds only `tests/timelock_dkg_tests.move`. Neither repo's genesis script or SDK enables it (`source/docker-testnet/config/generate-genesis.sh:73-89`).
  - The chain of effects:
    1. No `TimelockDKGStartEvent` is emitted.
    2. So `ibe_config::is_ready()` stays false (`ibe_config.move:381-388`).
    3. So `register_timelock` aborts with `E_IBE_NOT_READY` (`ibe_config.move:447`), and `get_mpk` returns empty bytes.
- **Failure scenario**: an operator starts the Docker testnet or a real network from this genesis. Every auction that registers a timelock aborts. No bid can be sealed.
- **Fix**:
  - Enable the timelock DKG at genesis for Atomica networks, through a layout flag wired into vm-genesis.
  - Add a CI swarm test with 4 validators and a short epoch. It must wait for the second epoch and assert `is_ready()` and a 96-byte `get_mpk()`.

### 2. No validator ever submits a timelock key share.

- **Claim checked**: cost report A+ flow step 3, "validators … submit them through atomica's timelock validator transaction".
- **Verdict**: **broken**. The old fork had the same gap.
- **Evidence (local)**:
  - `git grep -n "TimelockShare" e41b69f662 -- '*.rs'` finds the type, the API conversion, the VM handler (`validator_txns/mod.rs:49`), the consensus gate (`consensus/src/util/mod.rs:27`), and tests. It finds no code in `dkg/`, `consensus/`, or `aptos-node/` that builds one or puts one in the validator-transaction pool.
  - `dkg/src/epoch_manager.rs:55-57` derives the shares into `TimelockServiceHandle`. Its comment says "A later share-submitting service reads it". `timelock_service_handle()` (`:142`) has no caller.
- **Failure scenario**: every timelock stays `Pending`. It is marked `Expired(reveal-window-elapsed)` 10 minutes after its deadline. No auction ever reveals.
- **Fix**: push the share service (local commit `351b0bbfb9`, see finding 9). Prove it in CI with a 4-validator swarm test that asserts status `Revealed` and `verify_decryption_key(dk, id, mpk)`.

### 3. Key reconstruction gets the wrong weights list. Every reveal below full weight fails for good.

- **Claim checked**: the final key check accepts the keys honest validators make.
- **Verdict**: **broken**, merged badly. Two reviewers found it on their own.
- **Evidence (local)**:
  - `ibe_config.move:587-603` at `e41b69f662`: `get_reconstruction_inputs` returns `info.validator_weights`. That list holds only the submitters' weights, in submission order (filled at `:530`).
  - `aptos-vm/src/validator_txns/timelock.rs:478-499` rebuilds as soon as `share_count >= reveal_threshold`. It passes that list to `crates/aptos-dkg/src/ibe/mod.rs:467` `reconstruct_ibe_dk_from_g1_shares`.
  - That function expects the full per-validator list. It fails with `WeightSumMismatch` unless the weights sum to the total weight.
  - Every Rust and Move test passes the full list (`ibe/tests.rs:69-72`, `ibe_golden_vector_tests.move:167-168`). The only reveal test in `e2e-move-tests/src/tests/timelock_share.rs` uses one validator, where both lists are equal.
- **Failure scenario**: 4 validators of weight 1, threshold 3. The third share triggers a rebuild with weights `[1,1,1]`. The sum 3 is not 4, so the rebuild fails. The timelock becomes `Expired(key-check-failed)` with its shares dropped (`ibe_config.move:640-666`). There is no retry.
- **Verification**: confirmed. The threshold for 4 validators is 3, so `is_reconstructable` (`ibe_config.move:628-637`) fires below full weight. Even a full-weight reveal breaks when weights are unequal and the submission order differs from the index order, because the list is positional.
- **Fix**: return `TimelockEpochConfig.weights`. The local commit `0cb29e2fcf` does this and is not on any remote branch. Add a VM test with 3 of 4 validators submitting out of index order. Run it in CI.

### 4. The SDK cannot create an auction, and the browser tests assert that it fails.

- **Claim checked**: the green `happy-path`, `bid-settle`, and `claim-reclaim-fees` browser jobs prove the auction flow on live chains.
- **Verdict**: **broken**. The arity bug predates the upgrade. PR 146 broke the bid helper and the swallow hid it.
- **Evidence**:
  - **local**: `source/atomica-move-contracts/sources/auction.move:338-346` `create_auction` takes 6 arguments after the signer, and `timelock_id` among them. It has done so since `c21f31f` (2026-05-18).
  - **local**: `source/atomica-sdk/src/aptos/payloads.ts:149` sends 5 arguments: `[windowId, pairBcs, lockId, minPrice, mpkBytes]`. The UI uses it (`AuctionCreator.tsx:55`, `useSellFlow.ts:367-394`). PR 146 edited this file and left the bug in place.
  - **local**: the test helper `tests/integration/helpers/auction-setup.ts:233-263` has the same 5-argument call. Its `submit_bid` helper (`:282-306`) still uses the shape that PR 146 replaced.
  - **local**: each call is wrapped in `.catch(() => {})`. Examples are `14-happy-path.test.tsx:362`, `10-settle.test.tsx:156`, and `11-claim-and-reclaim.test.tsx:155`. The comments blame `E_NOT_IMPLEMENTED`, which `auction.move:72` declares and no entry function throws.
  - **CI**: Browser Tests run [41422391934](https://github.com/bomba-atomica/atomica/actions/runs/41422391934), job `(happy-path, docker)`, logs `Enter the V2 bid ciphertext (hex)` and `Move abort … auction: E_AUCTION_NOT_FOUND(0x1)`. The passing tests are named "shows error … (Phase 3a scaffold)".
- **Verification**: confirmed. The call never reaches the chain. ts-sdk 5.2.1 throws `Too few arguments … expected 6 but got 5` on the client. A second builder in `docker-testnet/aptos-testnet/src/payloads.ts:119` sends only 4 arguments.
- **Failure scenario**: a seller clicks Create Auction. The SDK throws before any transaction is sent, and no window exists. CI stays green.
- **Fix**:
  1. Add `timelockId` to `getCreateAuctionPayload`, the UI, and the helpers.
  2. Update the `submit_bid` helper to the current ABI.
  3. Remove every `.catch(() => {})` around chain calls.
  4. Rewrite tests 09 to 14 to assert `get_window_status`, `get_bid_count`, `is_settled`, and receipt statuses.

### 5. The product lacks an integrated V2 bid encryptor and decryptor.

- **Claim checked**: bids are encrypted under the chain's timelock key and opened with the key the validators reveal. Also checked: whether encryption is faked.
- **Verdict**: **broken**. The inspected product submission path asks for externally generated V2 ciphertext; it does not implement encryption using the live key. No fake-encryption success path was found in those clients. Legacy crypto and test-key fixtures still exist elsewhere and do not supply this integration.
- **Evidence (local)**:
  - `AuctionBidder.tsx:11-17,128-132` says "The TypeScript client has no V2 encryptor yet". The user pastes ciphertext hex.
  - PR 146 (`0db1b90`) removed the old client `encrypt()`. That path used a 48-byte G1 MPK that the chain no longer uses.
  - `AuctionRevealer.tsx:12-21` takes cleartexts and salts typed in by hand. Move stores the revealed key and checks a price commitment (`auction.move:26-34`). No integrated product relayer decrypts those bids off chain.
  - The required check `Web Tests (integration)` runs only `state-proofs/typescript/tests/ibe.test.ts`. It tests the retired G1 scheme against its own master secret.
  - The only real V2 ciphertext is the golden fixture in Move unit tests (`auction_bid_wrapper_tests.move:173`).
  - Side note: `aptos_framework::ibe_golden_vector_fixtures` is not `#[test_only]`. It ships a fixture MPK and decryption key in the production framework. No production code reads it.
- **Verification (local)**: the fork supplies a real V2 Rust library function `encrypt_bid` (`crates/aptos-dkg/src/ibe/ciphertext.rs:184`). No shipped product binary or client binding to that function was found.
- **Failure scenario**: the shipped UI/SDK cannot generate V2 ciphertext from the live MPK or automatically open it with the revealed key. A custom client could call the Rust primitive, but that is not the deployed product flow.
- **Fix**: port the V2 wrapper (KEM, HKDF, AES-GCM, Ed25519) to TypeScript or WASM. Read `timelock::get_mpk` and `get_timelock_identity` from chain. Add a decrypt step that uses `get_decryption_key`. Replace the legacy `ibe.test.ts` with V2 golden-vector encrypt and decrypt tests.

### 6. Anyone can settle an empty auction before its deadline. An unregistered timelock is also accepted.

- **Claim checked**: settlement and refund are safe on chain.
- **Verdict**: **broken**, supported by the entry-function guards and the empty-bid count equality.
- **Evidence (local)**:
  - `auction.move:914-930` `settle` has no caller, deadline, or timelock check. With 0 bids the count check passes.
  - Afterward `submit_bid` aborts with `E_WINDOW_ALREADY_SETTLED` (`:493`). `refund_expired_window` aborts on `!settled` (`:699`). `settle` never releases the seller's receipt (`:945-990`).
  - `create_auction` (`:338-400`) does not check that `timelock_id` is registered.
  - The prior review recorded five passing temporary `review_` Move tests. Their exact sources/logs were not recovered for this document audit, so they are not treated as independently reproduced evidence. The source-level path above establishes the missing guards.
- **Verification (local)**: `settle` makes no `timelock::` call and ignores `_caller`. With zero bids and zero results, `result_count == bid_count` at `auction.move:937` passes. Recovery did not reproduce the prior temporary tests.
- **Failure scenario**: an attacker watches for `create_auction` and calls `settle` in the next block. The window takes no bids. The seller's lock receipt stays consumed with no refund.
- **Fix**:
  - Ordinary `settle` must require a finalized reveal and a passed deadline, with an explicit safe empty-auction rule. An `Expired` timelock must take the separate `refund_expired_window` path.
  - `settle` must release the seller's unsold supply.
  - `create_auction` must assert that the timelock is registered, `Pending`, in the current epoch, and has a future deadline.
  - Add durable regression tests for early empty settlement and invalid timelock registration.

### 7. Refunds and claims move no assets on Ethereum.

- **Claim checked**: the refund path works. The brief said it was unverified live.
- **Verdict**: **broken**, not just unverified.
- **Evidence (local)**:
  - On Aptos, `refund_expired_window` (`auction.move:688-720`) and the loser release in `settle` only flip `LockReceipt` status. Only Move unit tests cover them (`auction_bid_wrapper_tests.move:690-770`).
  - No SDK or relayer consumer of `AuctionRefunded` or `BidUnopened` was found in the reviewed snapshot.
  - `ClaimButton.tsx:101-115` calls `submitClaim(account, clearingPrice)`; SDK `payloads.ts:483-499` self-mints Aptos `fake_eth` rather than releasing Ethereum escrow. `ClaimButton.tsx:148-152` permanently disables reclaim. A displayed Claimed status is therefore not proof of escrow payout.
  - `evm-contracts/src/escrow/LockBox.sol:102-158` lets the locker `withdraw` after `MIN_LOCK_DURATION = 1 hours`, whatever the auction outcome.
  - `BLSVerifierTestnet.sol:135-150` `authorizeSettlement` only emits an event. `atomica-sdk/src/settlement/bridge.ts:502-537` `releaseBidderCollateral` calls it, so no funds move.
  - `withdrawWinnings`, described in `docs/architecture/v0-architecture.md` §3.5, does not exist.
  - `DepositBox` and `Settlement` have real transfers and pass their forge tests. The dual-chain fixture does not deploy them. The Aptos proofs target LockBox.
- **Failure scenario**: an auction settles with a winner. After 1 hour the seller calls `LockBox.withdraw` and keeps the ETH. The winner gets nothing. A winning bidder can withdraw their collateral the same way.
- **Fix**: make LockBox releases depend on a verified Aptos settlement or refund, or point the Aptos proofs at `DepositBox`. Add a live dual-chain test with three cases, refund, winner payout, and seller payout, and assert ERC-20 balances.

### 8. The `TimelockDKGResult` handler reads a node-local file during block execution.

- **Claim checked**: validator-transaction execution depends only on chain state. The fork states this rule at `timelock.rs:115-118`.
- **Verdict**: **broken** as a determinism design: validation depends on node-local configuration. The reviewed no-blob chain-ID-4 setup shares a fallback; explicit differing blobs can trigger the issue on any chain ID. A consistently configured non-test network need not diverge.
- **Evidence (local)**: `aptos-vm/src/validator_txns/timelock_dkg.rs` at `e41b69f662` passes `TIMELOCK_PUBLIC_PARAMETERS.as_ref().map(|p| p.blob_hash)` to `check_timelock_dkg_result`. That value is loaded from the per-node config `timelock_public_parameters_blob_path`. `types/src/dkg/timelock_dkg.rs:648-652` rejects on a mismatch and skips the check when the node has no blob.
- **Failure scenario**: validators with different blob files can validate the same transaction differently. Consensus impact depends on the voting-power split and execution disagreement; no particular halt threshold was reproduced.
- **Fix**: remove the local-hash comparison from execution. If the hash must be enforced, store the expected hash on chain.

### 9. The release was cut from `origin/dev-atomica` while 72 fix commits sat on a diverged local branch.

- **Claim checked**: the validator image runs the latest timelock work.
- **Verdict**: **suspect** as a process risk. The provenance itself is correct (finding 24).
- **Evidence (local)**:
  - The review host's local `dev-atomica` (`391873952b`) has 72 commits that `origin/dev-atomica` lacks. The diff is 37 files with +1,970 / −143 lines.
  - `git branch -r --contains 0cb29e2fcf` is empty.
  - **Verification**: the local branch is diverged, not ahead. `git merge-base origin/dev-atomica dev-atomica` is the upstream tag commit `b4359185dd`. Origin has 45 commits the local branch lacks, and those include the release merge `e41b69f662` itself and the `testing` guard change. The local branch would not build under the current release workflow. Landing the local work needs a real merge, not a push.
  - The commits are dated 2026-10-31. That is the day of the suspected host crash.
  - They include three relevant commits:
    - `0cb29e2fcf` fixes the weights (finding 3).
    - `351b0bbfb9` adds a timelock share service (finding 2).
    - `d7a315e7d6` adds a swarm smoke test, `testsuite/smoke-test/src/timelock_e2e.rs`. It enables the DKG by governance (`:266`), not at genesis, so finding 1 still holds for a fresh network. No workflow runs the smoke test, even on the local branch.
    - `351b0bbfb9` submits a share only when the node's timelock state is `Ready`, the timelock is pending in this epoch, the committed deadline has passed, and the reveal window is open. That matches the design.
  - This review did not read or test those commits in depth.
- **Failure scenario**: the work is lost if the host fails. Or it is merged later and silently changes what the product's Move CI compiles against (finding 17), while validators still run `e41b69f662`.
- **Fix**: push the local branch to a feature branch now, unmerged. Merge `origin/dev-atomica` into it in a worktree. Open a draft dev-atomica PR. Wire the timelock smoke test into a CI workflow. Then cut a new release and image, and bump all atomica pins in one PR.

### 10. The SDK and most web-component unit tests run in no CI job.

- **Claim checked**: unit tests for the code that PR 146 changed run in CI.
- **Verdict**: **broken** as coverage. The tests pass when run.
- **Evidence**:
  - **local**: no workflow runs `vitest` in `source/atomica-sdk`. That leaves 11 test files untested in CI, including `ibe-bid.test.ts`, `settlement-bridge.test.ts`, and `aptos-payloads.test.ts`.
  - **local**: CI names only 12 of the 47 test files in `atomica-web-components`. Nothing runs `test:unit`. PR 146 moved `AuctionBidder.test.tsx` and `AuctionRevealer.test.tsx` into the unrun `tests/unit/`.
  - **local**: before PR 150, `storage-key.test.ts` imported a path that does not exist. That proves the SDK tests had not run.
  - **local** runs: `bunx vitest run` in `atomica-sdk` gives `Tests 129 passed (129)`. `bunx vitest run --config vitest.unit.config.ts` in `atomica-web-components` gives `80 passed | 7 skipped (87)`.
- **Failure scenario**: a regression in the bid payload or settlement mapping merges with every required check green.
- **Fix**: add a required job that runs both suites on every PR. Add a guard that fails when a test file is in no job.

### 11. The state proof has no trusted root, and one lock can be registered twice.

- **Claim checked**: step 2 verifies the lock against a beacon or light-client root.
- **Verdict**: **suspect**. This matches the Demo trust model, where the operator is fully trusted.
- **Evidence (local)**:
  - `eth_proof.move:81-125` checks proofs against a `state_root` that the caller supplies. Nothing ties it to a block hash or a beacon header.
  - `storage_key` is not derived on chain. The LockBox address and token are not pinned.
  - `lock_id` hashes `block_hash` (`lock_receipt.move:265-295`). The same lock proven at two blocks gives two receipts.
  - The only guard is the signer rule (`lock_receipt.move:205-210`).
  - The TypeScript beacon tests never reach Aptos. The light-client test soft-passes on a 404 (`beacon/integration.test.ts:52`).
- **Failure scenario**: an operator registers one 10 FakeETH lock at blocks N and N+1. 20 FakeETH of supply is then auctioned against 10 locked.
- **Fix**: store trusted headers on Aptos and require `state_root` to match. Derive `storage_key` on chain. Pin the LockBox and token mapping. Derive `lock_id` from a LockBox nonce.

### 12. The 2-hour epoch cannot hold the PRD's 4-hour bid window.

- **Claim checked**: genesis values fit Atomica's auction schedule.
- **Verdict**: **suspect**. The value is the upstream default.
- **Evidence (local)**:
  - `generate-genesis.sh:79` sets `epoch_duration_secs: 7200`.
  - The PRD (`docs/specifications/prd.md:65-72`) sets a bid window of 12:15 to 16:15 UTC.
  - `ibe_config.move:452-460` requires a deadline at least 15 minutes before the end of the registering epoch.
  - Any epoch change expires every pending timelock of the old epoch (`ibe_config.move:722-729`).
- **Failure scenario**: the 12:15 auction registers a 16:15 deadline. `register_timelock` aborts with `E_DEADLINE_AFTER_EPOCH_END`.
- **Fix**: choose the epoch policy with the auction schedule, or support timelocks that span epochs. Record the choice in the validator timelock decision doc, which already lists the risk.

### 13. The release node is built with `--features testing`.

- **Claim checked**: production node safety guards survived the upgrade.
- **Verdict**: **suspect**. This carried over from the old fork.
- **Evidence**:
  - **CI**: the release run [41383834558](https://github.com/bomba-atomica/atomica-aptos/actions/runs/41383834558) builds with `--features testing`. The workflow is `build-aptos-binary.yml:122`.
  - **local**: `aptos-node/src/lib.rs:7-9` and `main.rs:13-18` remove the upstream `compile_error!` and `assert_no_test_natives` guards.
  - **local**: the `testing` feature pulls in `aptos-dkg-runtime/smoke-test`. With it, each randomness-DKG dealer seeds its RNG from its public address (`dkg/src/dkg_manager/mod.rs:320-324`). Randomness is on at genesis. The timelock dealer uses `thread_rng` (`dkg/src/chunky/dkg_manager/mod.rs:481`), so the timelock secret is not affected.
- **Failure scenario**: anyone can predict `aptos_framework::randomness` output. Atomica contracts do not use randomness today, so the impact is latent.
- **Fix**: build the release and image without `testing`. Ship a separate testing artifact for swarms. Restore the upstream guards.

### 14. Timelock parameters exist only as a test fallback on chain id 4.

- **Claim checked**: The deployed timelock has suitable public parameters on its intended chain ID.

- **Verdict**: **suspect**.
- **Evidence (local)**:
  - `types/src/dkg/timelock_dkg.rs:334-368` uses `TestKeyFallback`, seeded with the public constant `StdRng::seed_from_u64(300)`, on chain id 4. Other chain IDs get `NotAvailable` when no usable blob path is configured. A configured blob takes precedence even on chain ID 4.
  - No node template sets `timelock_public_parameters_blob_path`.
  - This review did not check whether the test parameters carry a recoverable setup secret.
- **Failure scenario**: moving to a real chain id disables the timelock session with no error.
- **Fix**: generate real parameters, ship them as a blob, set the path, pin the hash on chain, and fail at startup on a non-test chain without the blob.

### 15. Every live timelock test was dropped. The Move test bypass rests on a false premise.

- **Claim checked**: The upgrade retains executed live timelock coverage and honest unit-test checks.

- **Verdict**: **suspect**. Removed reveal-path coverage is not justified by the remaining unit tests.
- **Evidence (local)**:
  - The old fork had smoke tests under `testsuite/smoke-test/src/{ibe,timelock}` and `randomness/ibe_mpk_on_chain.rs`. `git grep -il "timelock\|ibe_config" e41b69f662 -- testsuite/` is empty.
  - `ibe_config.move:917-923` `finalize_for_testing` skips the pairing check. Its stated reason is that the native is unavailable in Move tests. That is false, because `tests/ibe_native_test.move:54` calls it.
  - Product tests use this bypass (`auction_bid_wrapper_tests.move:123-125`).
- **Failure scenario**: findings 1, 2, and 3 all pass the current suites.
- **Fix**: restore one CI swarm test that covers DKG, epoch config, registration, shares, reveal, and key check on 4 or more validators. Make `finalize_for_testing` run the real pairing check.

### 16. The required checks are narrow and misnamed. A skipped run can race the real one.

- **Claim checked**: the three required checks gate the protocol.
- **Verdict**: **suspect** (CI).
- **Evidence (CI)**: ruleset `11921934` requires `Web Tests (unit)`, `Web Tests (integration)`, and `Web Tests (meta)`, with `strict: false`. Run [41422391992](https://github.com/bomba-atomica/atomica/actions/runs/41422391992) at `40d4a1b`:

| Check | What it actually runs | Result |
|---|---|---|
| Web Tests (unit) | The Aptos Docker testnet SDK suite, which is a system test. Skipped on drafts. | 23 passed |
| Web Tests (integration) | Only `state-proofs/typescript/tests/ibe.test.ts`, the retired G1 scheme | 9 passed |
| Web Tests (meta) | 6 demo smoke files | 6 passed |

  - The browser, Move, EVM, Ethereum, and verifier workflows are not required. Browser Tests failed on main at `4fee0bf`, `0db1b90`, and `87a30f2` (runs 40989631975, 41397732675, 41398848063). Nothing blocked them.
  - Skipping `Web Tests (unit)` on drafts is acceptable by itself, because GitHub does not merge drafts.
  - On the CI split pr (151), SHA `f936881` had a skipped run (125184456449) and a real run (125184449722) of `Web Tests (unit)` for about 4 minutes.
  - **Recovery verification (CI)**: [skipped job](https://github.com/bomba-atomica/atomica/actions/runs/41417388925/job/125184456449) and [executed job](https://github.com/bomba-atomica/atomica/actions/runs/41417387468/job/125184449722) share SHA `f9368810d3c1c986ef5476c0148a2a1daaabc534`. The skipped conclusion coexisted with the real job for roughly 4 minutes 20 seconds. API timestamps for the skipped job are internally reversed; no normalization was assumed. This establishes overlap, not that GitHub would permit a merge or choose the skipped result as authoritative. The bypass remains an inferred risk. Main also had a failing Ethereum run at `e9ffd66` (41405800511).
- **Failure scenario**: the three required contexts can all pass while an optional browser or Move job fails. A merge during the overlapping skipped/executing checks is a separate unverified risk.
- **Fix**: gate on one aggregator job that always runs. Add the Move, SDK unit, and browser anvil jobs to it. Rename `Web Tests (unit)` to what it runs.

### 17. The Move contracts depend on the moving `dev-atomica` branch.

- **Claim checked**: the contracts pass against `dev-atomica` HEAD and against the validator commit.
- **Verdict**: verified for today, **suspect** going forward.
- **Evidence**:
  - **local**: the CLI was the release asset `aptos-e41b69f662` (aptos 9.5.0), run with a fresh `MOVE_HOME`.
  - **local**: with `rev = "dev-atomica"`, `aptos move compile --fail-on-warning` gave 0 warnings, and `aptos move test` gave `Total tests: 133; passed: 133`.
  - **local**: with `rev = "e41b69f662cde4c40953b9576088f997bb31a126"`, the results were the same, with the same test list. `git diff --stat e41b69f662 origin/dev-atomica -- aptos-move/framework` is empty.
  - **CI**: Move run [41422392158](https://github.com/bomba-atomica/atomica/actions/runs/41422392158) gives 133/133.
  - There is no `Move.lock`. Pushing finding 9's commits changes `ibe_config.move` under the contracts at once.
- **Fix**: pin `rev` to the full SHA of the deployed binary. Bump it in the same PR as the binary pin and image digest. Add a CI check that the two match.

### 18. The 10x gas loosening is real, but the default gas cap did not grow.

- **Claim checked**: the 10x looser bounds in `transfer.test.ts` and `deploy-contract.test.ts` reflect a real cost change.
- **Verdict**: **weakened-but-justified**, with a new risk.
- **Evidence**:
  - **local**: upstream `4cb1077a64` "[gas] Apply 10x multiplier to gas costs and storage fees" is in the range. For example, `min_transaction_gas_units` went from 2,760,000 to 27,600,000, and `storage_fee_per_state_slot` from 40,000 to 400,000. Atomica has no gas override.
  - The test comments say "gas schedule v49". The gas feature version is actually 53.
  - **CI**: measured gas use rose by the same factor:

| Operation | Before (`4fee0bf`, run 40989631899) | After (`40d4a1b`, run 41422391992) | Ratio |
|---|---|---|---|
| noop publish | 1,684 units | 17,242 units | 10.2x |
| atomica package publish | 26,153 units | 282,257 units | 10.8x (package grew 10%) |

  - **local**: Move fees are token-based, and `REBATE_COEFFICIENT = 0` (`auction.move:126`). No direct 10x network-gas scaling error was found in these token-fee paths; this is not a complete economic validation.
  - **local**: `atomica-sdk/src/transaction.ts:85-91` sets no `maxGasAmount`. ts-sdk therefore uses its default of 200,000 units. The package publish already exceeds that.
  - **local**: the last assertion in `transfer.test.ts:94` is a tautology.
- **Failure scenario (unverified risk)**: a large `settle` or `finalize_reveal` near `MAX_BIDS_PER_WINDOW = 100` could exceed the unchanged gas cap. No 100-bid measurement establishes that failure or whether it previously fit. Package-publish gas is not a substitute for measuring settlement.
- **Measurement limit (CI)**: historical noop publication is a controlled 686-byte comparison: 1,684 to 17,242 units, about 10.24x. The exact before/after transfer gas is not logged by the affected test and remains unverified.
- **Fix**: simulate before submit and set `maxGasAmount` from the result plus a margin. Add a live 100-bid settle test that logs `gas_used`.

### 19. The healthcheck that accepts 503 now only means "port open".

- **Claim checked**: The Compose healthcheck accurately establishes node readiness.

- **Verdict**: **weakened-but-justified** for tests. **Suspect** for operators.
- **Evidence (local)**:
  - `/v1/-/healthy` (`api/src/basic.rs:163-201`) checks staleness only when `duration_secs` is given. The compose check gives none.
  - A 503 means "DB is bootstrapping", or any indexer or storage read error (`api/src/context.rs:277-381`).
  - The test harness `waitForHealthy` (`aptos-testnet/src/index.ts:856-895`) requires successful HTTP from `/v1`, not the `/v1/-/healthy` endpoint. It logs block height without requiring it to advance.
- **Failure scenario**: `docker compose up --wait` reports a healthy validator whose database is permanently broken.
- **Fix**: use `depends_on: service_started` for the peer start order. Check `/v1/-/healthy?duration_secs=60` with a `start_period`. Require the block height to rise across two samples in the harness.

### 20. The rewritten `validator-sync.test.ts` passes a halted or forked chain.

- **Claim checked**: The revised test proves validators are live and agree on committed state.

- **Verdict**: **suspect** (CI).
- **Evidence**:
  - The new test (`aptos-testnet/test/validator-sync.test.ts:37-54`) waits for every validator to reach the starting max height. This replaces instantaneous skew with bounded catch-up; it is not uniformly stronger. A larger gap that closes can now pass, while a small gap that never closes can fail.
  - It never asserts progress or compares block hashes. CI printed `Block heights: 175, 175, 175, 175 (diff: 0)`. The epoch check only asserts equal epochs.
  - The Aptos Docker workflow, which is not required, runs a different file (`typescript-sdk/test/validator-sync.test.ts`).
  - **Verification**: the required `Web Tests (unit)` job also runs `block-production.test.ts`, which does catch a fully halted chain. A fork at equal height still passes.
- **Failure scenario**: a validator on a fork at the same height passes.
- **Fix**: require `maxHeight + 3` on every validator. Compare `block_hash` at a common height.

### 21. The committed `dist/` folders carry the old bid ABI.

- **Claim checked**: Consumers and CI execute fresh generated code rather than old committed artifacts.

- **Verdict**: **suspect**. CI rebuilds before use, so CI is not affected today.
- **Evidence (local)**:
  - `atomica-sdk/dist`, `atomica-web-components/dist`, and `docker-testnet/aptos-testnet/dist` are tracked, even though `.gitignore:38` lists `**/dist/`.
  - A fresh SDK build changes `payloads.js` by 140 lines. The committed `dist/components/AuctionBidder.js:83` still calls the old `submitBid(…, u, v, …)`.
  - CI builds in dependency order first (`test-web.yaml:44-72`, `test-browser.yaml:77-152`).
  - **Recovery check (local)**: a concrete unbuilt consumer is `source/atomica-demo/package.json:7`: `dev` runs plain `vite`. Its SDK dependency (`:21`) resolves package exports to `dist` (`source/atomica-sdk/package.json:21-23`); Vite has no SDK-to-source alias (`vite.config.ts:18-22`). Committed `dist/aptos/payloads.js:407-413` omits salts while `src/aptos/payloads.ts:613-617` includes them. The exported `dist/ibe/index.js` is absent. A fresh checkout started with `bun run dev` without dependency builds therefore reaches stale or missing exported artifacts. This is a source-resolution finding, not a browser runtime reproduction. Demo `prepare:deps` also omits an explicit SDK build (`package.json:12`).
- **Failure scenario**: a consumer that installs without building gets the pre-146 bid payload, and the chain rejects it.
- **Fix**: `git rm -r --cached` the three trees. Add a CI guard against tracked `dist/` files.

### 22. The pre-release image is also tagged `latest`, and one fallback uses `latest`.

- **Claim checked**: Release tagging and image selection preserve the intended prerelease and source boundary.

- **Verdict**: **suspect** (low).
- **Evidence (CI)**:
  - Image run [41392444083](https://github.com/bomba-atomica/atomica-aptos/actions/runs/41392444083) pushed `latest` for a pre-release.
  - The `revision` label is the workflow's own commit, not the binary's.
  - The release body says "Built: 2026-02-01". The run was on 2026-11-02.
  - `source/docker-testnet/aptos-testnet/src/genesis.ts:120` falls back to `validator:latest`. So does `typescript-sdk/src/genesis.ts:119`.
  - **Verification**: `:latest` equals `d2c49b0f…` today. The guard `enable=${{ github.event.release.prerelease == false }}` is always true on `workflow_dispatch`, because a null compares equal to false there. The "Built" date comes from `repository.updated_at`.
- **Failure scenario**: a consumer using the fallback silently picks up a prerelease or a later unrelated image through mutable `latest`.
- **Fix**: tag `latest` only for full releases. Label the image with the binary SHA. Replace the fallback with the pinned digest.

### 23. The golden vectors use test PVSS parameters.

- **Claim checked**: the vectors match what the upgraded code makes.
- **Verdict**: **weakened-but-justified**.
- **Evidence**:
  - **local**: the 1.38.5 vectors moved unchanged to `atomica/golden_vectors/legacy-v1/`. The new `ibe_v2_golden_vectors.json` came from `crates/aptos-dkg/src/ibe/golden_vectors.rs`.
  - **local**: regenerating with `cargo test -j 4 -p aptos-dkg --lib ibe::golden_vectors::write_golden_vectors -- --ignored` left the JSON and `ibe_golden_vector_fixtures.move` byte-identical (`git status --porcelain` was empty).
  - **CI**: Crypto Crates Tests run [41383834699](https://github.com/bomba-atomica/atomica-aptos/actions/runs/41383834699) passes the same checks.
  - **local**: the generator uses `ell = 16` and a stand-in session id. Production uses `ell = 32` and `TimelockDKGSessionId` (`timelock_dkg.rs:356-361`). No SDK test encrypts or decrypts a vector bid.
  - **local**: the SIWE generator was independently rerun in a scratch copy with `CARGO_TARGET_DIR="$HOME/tmp/atomica-review-vectors/target" cargo run --offline`; exit 0. Its JSON equals `source/atomica-sdk/tests/fixtures/golden_vectors.json`; byte comparison differs only by a final newline. This generator duplicates SIWE BCS structures, not the live fork implementation, so the match proves serialization-fixture consistency only. It writes to a dead `atomica-web` path.
- **Failure scenario**: fixture compatibility passes while production parameter loading or session binding fails; the vector test does not exercise those deployment paths.
- **Fix**: add one vector made with the deployment `ell` and session id. Add an SDK decrypt test against the vector bids. Point the SIWE generator at `atomica-sdk/tests/fixtures`.

### 24. Items verified as correct

- **Claim checked**: The supporting merge, cryptography, provenance, backend, and CI claims listed below hold within the cited evidence.

- **Verdict**: **verified** only for the explicitly scoped positive claims below; embedded gaps retain their stated limitations.
- **Failure scenario to guard against**: provenance or backend checks can stay green while protocol integration is broken. These facts must not be promoted into end-to-end success.
- **Recommended preservation**: retain the executed checks, repair the noted skip/readiness gaps, and add live outcome assertions before release approval.

- **Survived the merge (local)**:
  - No conflict markers were found in the reviewed delta. Exhaustive absence of new TODOs or network-input unwraps was not certified during recovery.
  - `scalar_elgamal` and the dual-output DKG were retired as the cost report planned.
  - `crypto_algebra` `new_element` and `get_handle` were dropped, which removes a handle-forging path.
- **A+ hardening exists (local, static read)**:
  - A per-share pairing check against on-chain verification keys (`timelock.rs:123-134`).
  - A final key check in Rust and again in Move (`ibe_config.move:611-617`).
  - A submission-time ciphertext check with a G2 subgroup test and a strict Ed25519 signature over associated data bound to the bidder and auction (`auction.move:408-505`).
- **Provenance (CI)**:
  - Release `binary-e41b69f662` was built by run 41383834558 at `e41b69f662`. Its `head.mrb` equals the committed one.
  - Image `sha256:d2c49b0f…b93a` has `org.opencontainers.image.revision=e41b69f662cde4c4…`.
  - `e2f417d6` is the first 8 hex digits of the Dockerfile's sha256, not a commit.
  - All 8 binary pins and 11 image refs on atomica `main` match.
- **Beacon tests on Docker (CI)**:
  - All 7 `[docker only]` tests pass on the Docker tier at the sampled ready-for-review run of pr (151) ([41417745591](https://github.com/bomba-atomica/atomica/actions/runs/41417745591)) and on main at `40d4a1b` (run 41422391981).
  - `should retrieve validator public keys` has zero assertions (`validator-connectivity.test.ts:76-85`). Empty keys therefore pass that case.
  - **Separate verifier weakness (CI)**: [State Proof Verifier main run (41422392005)](https://github.com/bomba-atomica/atomica/actions/runs/41422392005) reports Docker 129 passed while logging “Finality update not available yet” and a period-0 update 404. `source/state-proofs/typescript/test/beacon/integration.test.ts:48,76,91,102` permits unreachable/finality-error/empty-update/404 paths. This particular run executed optimistic-update assertions, so it was not zero assertions. It still did not prove finalized light-client verification. Require nonempty finalized updates, verified signatures, and an updated trusted root.
- **`cacheTimeout: -1` on test providers only (local read of ethers 6.17.0)**:
  - Users sign through `BrowserProvider`, and the wallet assigns the nonce.
  - The app's `JsonRpcProvider` instances are read-only. The default provider request cache can reuse a response for 250 ms. This does not bound user-visible staleness from polling, state updates, RPC latency, or chain propagation.
  - The demo scripts that use `Wallet` should use `NonceManager`. So should the relayer in `bridge.ts:439,516`, which uses a raw `Wallet`.
- **Anvil tier (CI + local)**:
  - It runs the same selected files against a different backend, with unsupported beacon assertions skipped. It provides fast JSON-RPC feedback, not identical consensus/finality coverage.
  - `source/docker-testnet/ethereum-testnet/typescript-sdk/src/index.ts:267-273` calls `anvil_setBalance`, then mines a block so the latest header state root includes the balance mutation before `eth_getProof` comparison. This validates the anvil funding setup; it does not establish Geth equivalence. Docker exercises actual Geth proof responses. An anvil-only pass can miss untested Geth formatting or finalized-root edge cases; both backends need pinned-block proof assertions.
  - The storage-key padding in pr (150) is test-only. Product keys come from `keccak256`.
  - The Ethereum Docker workflow is path-filtered (`ethereum-docker-testnet.yaml:8-18`), so the literal claim that it runs on every ready-for-review PR and every push to main is false. It did not run on main at `d24434c`.
- **Browser extension suite (local + CI)**: no active target workflow invokes `test:metamask` or `run-metamask-test.ts`; the retrieved main browser run does not run it. No evidence of prior successful CI coverage was found, so the exclusion cannot be called a demonstrated loss of formerly executed tests. Real MetaMask compatibility has no current CI coverage.
- **`atomica-crosschain-testing` (local)**:
  - Its `ethereum-testnet/rust-sdk/Cargo.toml` dependency is absent in the reviewed snapshot. No successful resolved build was established; this review does not certify every historical ref.
  - It held only a connectivity check and an `#[ignore]` stub.
  - Little coverage was lost. The claim in pr (146) that it "compiles" was never checked.
- **Skip inventory (local + CI)**:
  - No executable `test.only`, `it.only`, `describe.only`, `xit`, test-todo setting, or `passWithNoTests` was found in the scanned first-party tests/workflows, excluding generated dist and vendored libraries. This does not assert the absence of TODO comments.
  - No inspected test-bearing main-job log reports a zero-test run; this does not certify every historical job.
  - **Recovery evidence (CI)**: [EVM main run (41422392019)](https://github.com/bomba-atomica/atomica/actions/runs/41422392019) reports DeploymentVerification 9 passed / 2 skipped on each backend. `source/evm-contracts/test/e2e/DeploymentVerification.t.sol:272,334` explicitly skips basic ETH deposit and deposit confirmation. Its USDC deposit case (`:295-310`) can return without assertions when token/funding prerequisites are missing. The log records PASS but does not reveal whether that early return happened. This pre-existing false-green path should fail on missing resources, not return success.
  - Pr (146) added 7 empty `it.skip` tests (`tests/unit/hooks/sell-flow-state.test.tsx:171-191`). They cite a closed issue. Three older ones sit in `tests/SellFlow.resume.test.tsx:176-182`.
- **CI taxonomy scan (local)**:
  - **Recovery command (local)**: `AGENTS="${SUPERFIELD_AGENTS:-$HOME/.agents}"; bash "$AGENTS/scripts/auto/ci-taxonomy-scan.sh"` from the target worktree exits 1 with 9 workflows, 14 errors, 0 warnings because it reads stale principal `6ad6f93`. Those are not target results.
  - Explicit target-file fallback: `for wf in .github/workflows/*.yaml .github/workflows/*.yml; do bun "$AGENTS/agent-core/src/cli.ts" ci lint "$PWD/$wf"; done`. All commands exit 0: 10 workflows, 0 errors, 21 `sweep-missing-nightly` warnings.
  - The script resolves the repo from `--git-common-dir`. Run from a worktree, it scans the main checkout instead.
  - It grades triggers only, so it cannot see the unrun tests in finding 10.

---

## Live auction flow: executed tests versus actual outcomes

The rows below distinguish live infrastructure from a successful protocol assertion. **CI** run [Ethereum Consumers (41422391986)](https://github.com/bomba-atomica/atomica/actions/runs/41422391986) ran six happy-path tests on Docker and six on anvil. Its Docker log reports bid submission error, settlement error, and “not yet settled”, followed by six passing tests. Source references below are **local** inspection of the exact product snapshot, under `source/atomica-web-components/tests/integration/` unless otherwise stated.

| PRD step | Live-chain test and real assertion | Verdict and missing evidence |
|---|---|---|
| Seller locks ETH or ERC-20 | `14-happy-path.test.tsx:345-350` invokes the live FakeETH lock/proof helper. `:324-328` asserts a faucet balance increase. | **suspect** for the full escrow step: the lock is a setup prerequisite, not an asserted escrow conservation outcome. This is FakeETH ERC-20, not a demonstrated native-ETH auction. |
| State proof verified on Aptos | `14:350` registers the MPT proof using the deployer. Helper `helpers/auction-setup.ts:124-145` forwards caller-supplied root and proofs. | **broken** against the trustless PRD: no finalized beacon/light-client root assertion. Successful registration is not root authentication (finding 11). |
| Auction created | `14:355-364` catches creation failure; `:397-399` checks an Active UI badge. `07-create-auction.test.tsx:161-191` expects an error. | **broken**: no successful window-state assertion in these executed tests; SDK argument mismatch prevents creation (finding 4). |
| Encrypted bids submitted | `14:447` asserts generic Error; `09-submit-bid.test.tsx` does likewise. Current UI can reject missing ciphertext before a transaction is sent. | **broken**: no executed live-chain test creates V2 ciphertext using the live MPK and asserts accepted bid state. |
| Bids decrypted at expiry | No live successful round-trip test found in the reviewed source or retrieved runs. Move wrapper tests use fixture keys and test-only finalization. | **broken** integration; production decryption remains unproved. The ignored Rust smoke test consists of TODOs. |
| Auction settled | `14:510` expects Error; `:603` labels an expired UI timer Settled. | **broken**: no clearing-price, fills, or settled-chain-state success assertion. |
| Winner paid, losers refunded, fees reclaimed | `14:551-560` asserts not-settled status and disabled buttons. `11-claim-and-reclaim.test.tsx:168-176` repeats this. `12-fee-rebate.test.tsx:99-114` checks displayed values. | **broken** for integrated recovery: no escrow-to-recipient balance assertion. Isolated DepositBox timeout-refund unit tests do not establish the full auction path. |

**Recommended assertion boundary**: add a mandatory live round-trip that reads the actual MPK, submits encrypted bids, observes a validator-produced key, opens bids, settles, and verifies winner, loser, seller, and fee balances. Keep current error/UI tests with names that describe their actual assertions.

## Reproduced lightweight checks and their limits

**Local** recovery evidence: the released `aptos-e41b69f662` asset reports `aptos 9.5.0`. Framework source was exported with `git archive e41b69f662 aptos-move/framework`. A scratch copy of the product Move package changed only its AptosFramework dependency to that exported local path. This avoids dependency movement; it does not change contract source.

- `$HOME/tmp/atomica-review-bin/aptos-e41b69f662 move compile --package-dir $HOME/tmp/atomica-review-move/contracts --fail-on-warning --named-addresses atomica=0xcafe`: exit 0.
- `$HOME/tmp/atomica-review-bin/aptos-e41b69f662 move test --package-dir $HOME/tmp/atomica-review-move/contracts`: exit 0; 133 tests passed, zero failed.
- `cargo metadata --manifest-path source/atomica-crosschain-testing/Cargo.toml --no-deps --format-version 1 --offline`: exit 0, but does not resolve dependencies. Full offline metadata exits 101 on an uncached `futures-rs/backport` ref before reaching the independently confirmed absent `ethereum-testnet/rust-sdk/Cargo.toml`. Neither command is a successful build.

These are local checks. They do not establish validator share submission, live decryption, or Ethereum payout. No heavy swarm, release build, dual-chain suite, or browser suite ran during recovery.

**C6 qualification (local)**: `useSellFlow.ts:229` polls a read-only provider every 3 seconds; `:315` generates a proof at the explicit lock block. `useAuctionPoolTotals.ts:63` creates a fresh read provider; `usePoolEvents.ts:56-76` only subscribes to events. These paths do not allocate transaction nonces. Actual approve/lock uses `BrowserProvider` at `useSellFlow.ts:273-280`. Test-wallet nonce reuse does not prove user-wallet nonce reuse. Rapid latest-state reads remain a bounded cache-staleness risk; no application reproduction was performed. Apply an explicit read-after-write policy where necessary, and test wallet transactions separately.

## Fork delta inventory, configuration, and unresolved provenance limits

**A1 — local, suspect outside verified hotspots.** The [companion path inventory](aptos-1-49-6-path-inventory.md) enumerates the complete 577-path union of old fork-vs-upstream and new fork-vs-upstream deltas. Commands compare `aptos-node-v1.38.5..125d36b957` (498 paths) and `aptos-node-v1.49.6..e41b69f662` (260 paths). Mechanical classification: 39 identical existing files, 98 retained upstream-file deletions, 250 normalization-equal candidate formatting deltas, 66 old non-format deltas absent at their original path, 45 reworked deltas, 79 new deltas. An absent path can be an intentional relocation. The normalization removes all whitespace and trailing commas without parsing syntax, including potential string-literal content; its formatting classification is only a candidate label. Findings 1–3, 8, 13, 15, and 24 provide semantic evidence for the critical DKG, VM, framework, and crypto areas. **Every changed hunk has not received semantic certification**; claiming all Atomica edits survived correctly would exceed this evidence. Finish a hunk-level audit before treating the inventory as an upgrade sign-off.

**A5 — local, suspect deployment suitability.** `source/docker-testnet/config/generate-genesis.sh:167,199-203` enables BlockSTM v2 and sets hot-state values to 250000 items/shard, 100000 refresh versions, delete-on-restart true, compute-root-hash true. These match upstream defaults (fork `config/src/config/execution_config.rs:107`, `storage_config.rs:260-266`). They are node settings, not on-chain feature flags. Fork CLI genesis uses default gas with optional feature/randomness/chunky overrides (`crates/aptos/src/genesis/mod.rs:306-309`); VM genesis defaults missing randomness/chunky settings and features (`aptos-move/vm-genesis/src/lib.rs:344-360,606-607`). The gas schedule source is byte-identical to upstream 1.49.6. No deployed-network state query verified effective flags, schedule, or randomness config. Default parity is not proof of Atomica suitability, particularly with disabled timelock DKG and testing-feature randomness (findings 1, 12, 13). Recommend exporting effective genesis/state configuration in CI and asserting each intended Atomica override.

**A4 — CI provenance verified with limits.** Binary run [41383834558](https://github.com/bomba-atomica/atomica-aptos/actions/runs/41383834558) records full `e41b69f662cde4c40953b9576088f997bb31a126` checkout and node build. Image run [41392444083](https://github.com/bomba-atomica/atomica-aptos/actions/runs/41392444083) publishes digest `sha256:d2c49b0f2867a1ba317982ea9255f4050dcf579f9c9eb0a64d72984bc271b93a`. A fresh registry-label query using `docker buildx imagetools inspect ... --format '{{json .Image.Config.Labels}}'` confirms the full revision and version `e41b69f662-e2f417d6`. This proves checkout/build/publish/label consistency, not an independently reproducible binary-to-source attestation.

**LFS — suspect / unverified historical claim.** Cached local objects and prior local fsck do not prove that the fork server now serves all three formerly missing objects. No fresh-cache fork LFS fetch or independently verified historical manual-upload record was obtained in recovery. Test a fresh CI checkout with LFS fetch before calling that claim verified.

## Actual test execution at the reviewed main commit

All rows are **CI**, read from job logs at `40d4a1b`. Counts prove execution, not meaningful assertions on every branch.

| Workflow | Direct run | Executed tests |
|---|---|---|
| Aptos SDK smoke | [41422392185](https://github.com/bomba-atomica/atomica/actions/runs/41422392185) | 8 across four suites |
| Required Web checks | [41422391992](https://github.com/bomba-atomica/atomica/actions/runs/41422391992) | unit 23, integration 9, meta 6 |
| Move | [41422392158](https://github.com/bomba-atomica/atomica/actions/runs/41422392158) | 133 passed |
| Ethereum | [41422391981](https://github.com/bomba-atomica/atomica/actions/runs/41422391981) | Docker 16; anvil 9 passed / 7 skipped |
| State proofs | [41422392005](https://github.com/bomba-atomica/atomica/actions/runs/41422392005) | Docker 129; anvil 128 passed / 1 skipped |
| EVM | [41422392019](https://github.com/bomba-atomica/atomica/actions/runs/41422392019) | Each backend: unit 54, integration 2, deployment 9 passed / 2 skipped |
| Browser | [41422391934](https://github.com/bomba-atomica/atomica/actions/runs/41422391934) | Each backend: faucet-wallet 7, auction 10, bid-settle 9, claim-reclaim-fees 15, happy-path 6; anvil component 3 |
| Dedicated happy path | [41422391986](https://github.com/bomba-atomica/atomica/actions/runs/41422391986) | 6 per backend, duplicating an existing suite |

**C8 scan limit:** first-party test/workflow searches excluded generated dist and vendored libraries. No executable focused-test setting or `passWithNoTests` was found. Three pending resume tests, seven newly added pending hook tests, Docker-only cases, beacon conditional skips, two EVM skips, and the ignored Rust timelock stub remain. A bounded search of all eight retrieved test-workflow logs for zero-test summaries found none. Static scanning does not prove every conditional path contains an assertion; the USDC early return and validator-key logging case show why counts alone are insufficient.

## Agreement with the cost report

- **Agrees**:
  - The 10x gas multiplier (finding 18).
  - The retirement of `scalar_elgamal` and the dual-output DKG.
  - The A+ hardening items exist in code (finding 24).
  - The epoch-boundary risk is real (finding 12).
  - The `ibe_config` dependency of the Move contracts (finding 17).
- **Contradicts**:
  - A+ flow step 3 says validators submit shares. No code does (finding 2).
  - Gap 1 is closed for bad shares. The reveal now fails for honest shares instead (finding 3).
  - The report assumed the timelock secret comes from chunky DKG at every epoch. That DKG is off at genesis (finding 1).
  - Open question 5 is marked answered, saying the forge-facing code of `atomica-crosschain-testing` is compatible. No successful resolved build is established for the reviewed snapshot (finding 24).
- **New risks the report did not list**: findings 4 to 8, 13, and 14.

## Recommended order of work

1. Push the local `dev-atomica` commits to a feature branch, merge `origin/dev-atomica` into it, and open a draft fork PR (finding 9).
2. Enable the timelock DKG at genesis, and run a 4-validator timelock swarm test in fork CI (findings 1, 2, 3, 15).
3. Fix the `TimelockDKGResult` determinism bug, and build the release without `testing` (findings 8, 13).
4. Cut a new release and image. Pin the binary, image, and Move `rev` in one atomica PR (findings 17, 22).
5. Fix `create_auction` arity and the settle and timelock guards. Remove the swallowed errors (findings 4, 6).
6. Ship a V2 client encryptor and decryptor (finding 5).
7. Make SDK and unit tests required in CI (findings 10, 16).
8. Wire Ethereum releases to Aptos outcomes (finding 7).

## Requested-question coverage and remaining uncertainty

| Request | Answer location | Evidence boundary |
|---|---|---|
| A1 every Atomica delta | Companion inventory; findings 1–3, 8, 13, 15, 24 | Complete path union; exhaustive semantic hunk survival remains unverified |
| A2 design, keys, expiry, cost report | Findings 1–5, 12–15; cost-report comparison | Broken released integration; no live multi-validator reveal evidence |
| A3 fork/product regenerated vectors | Finding 23; lightweight-check section | CI regenerates fork V2 bytes; local SIWE JSON matches; production setup coverage limited |
| A4 binary/image/LFS | Findings 22, 24; provenance limits | Build and labels verified; fresh fork-server LFS fetch unverified |
| A5 genesis/config | Findings 1, 12–14, 18; configuration section | Defaults traced; actual deployed on-chain configuration unqueried |
| B1–B7 complete live auction | Seven-stage flow matrix; findings 4–7, 11 | CI executes failure/UI assertions, not successful protocol flow |
| B encryption/refund/Rust build | Findings 5, 7, 24; lightweight checks | V2 client absent; release path event-only; Rust dependency unresolved |
| B Move strict compile/current-vs-pin | Finding 17; lightweight checks | Local strict compile and 133 tests pass; remote HEAD equals exact pin |
| C1 gas and fees | Finding 18 | Noop 10.24x measured; exact transfer delta and 100-bid gas unverified |
| C2 503 health | Finding 19 | Readiness weakened; sampled chain still processed transactions |
| C3 validator sync | Finding 20 | Catch-up improvement; equal-height fork undetected; separate liveness test exists |
| C4 beacon Docker scheduling/logs | Finding 24; execution table | Sampled PR/main executed; path filters disprove universal scheduling; finality soft-pass remains |
| C5 extension exclusion | Finding 24 | No current workflow; prior successful CI coverage not established |
| C6 test-only cache disable | Finding 24; C6 qualification | App read providers do not choose nonces; rapid stale-read reproduction unperformed |
| C7 anvil vs Geth proofs | Finding 24; execution table | Both backends executed; anvil cannot prove finality or all Geth proof edge cases |
| C8 skips/empty tests/zero suites | Findings 10, 15, 24; scan limits | Concrete false-green paths found; scans bounded, not exhaustive path proof |
| C9 committed dist | Finding 21 | Demo dev resolves stale exports; tested CI rebuilds first |
| D required checks/draft | Finding 16 | Actual counts and skipped draft verified; merge bypass inferred, not observed |
| D Docker main and taxonomy | Execution table; finding 24 | Main Docker jobs executed; native scanner targeted wrong checkout, explicit fallback passed with 21 warnings |

## Final decision

**No-go for real encrypted sealed-bid auctions on the reviewed release.** Independent blockers remain in default key generation, validator share submission, reconstruction, client ABI/encryption, and Ethereum asset recovery. The single riskiest unknown is whether a corrected deployment can produce and use a valid timelock key on a live multi-validator network before the auction reveal deadline. A green fixture-based or error-accepting suite does not resolve that unknown.

This review establishes a no-go from concrete integration failures while leaving exhaustive delta semantics and live multi-validator recovery explicitly unverified.
