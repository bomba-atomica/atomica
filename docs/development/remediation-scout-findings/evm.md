# EVM scout report

Partition: `source/evm-contracts/**` in the product worktree `scout-remediation-seams`.
All paths below are relative to `source/evm-contracts` unless they say otherwise.
Line numbers are worktree lines after the markers went in.

Second wave. The first wave left markers and stubs in eight files. I reviewed every one against the brief.
I kept all of them except one. I moved one marker and added one. I ran every check on the final state.

- Moved: the window id formula marker (220) in `script/DeployLockBox.s.sol`. It sat between the contract's NatSpec block and `contract DeployLockBox`. A plain comment there can detach the NatSpec. It now sits above the NatSpec block.
- Added: `test/integration/LockBoxAptosOutcome.t.sol:126` for the computed deadline issue (221). The golden test warps to the event's deadline before `reclaim`. That warp must reach the lock's own deadline.
- Kept: the `internal virtual` stubs in `LockBox.sol`. `virtual` is there only to stop solc warning 2018 ("can be restricted to pure"). The markers say each one becomes `public` or `external` and not virtual.

Totals: 88 markers. The window id formula (220) 2, the computed deadline (221) 46, the leaf rule (222) 31, the round-trip test (219) 8, the docs issue (242) 1.

## 219 Live cross-chain round-trip test

**Sites marked:** 8 (ADD 0, EDIT 8, REMOVE 0, TEST 0, DOC 0)

**Sites:**
- `script/DeployAptosLightClient.s.sol:23` EDIT — the testnet setup deploys with ethers from forge artifacts. It must port the two node reads and the same-LedgerInfo check of this script.
- `script/DeployAptosLightClient.s.sol:56` EDIT — `_record` rewrites the tracked file `test-results/deployment.json` on every run.
- `test-orchestration/src/aptos-light-client-live.ts:42` EDIT — the BCS reader, `parseLedgerInfo`, `readEpochState` and `structTag` are the proof encoding the carrier needs.
- `test-orchestration/src/aptos-light-client-live.ts:173` EDIT — `g1Uncompressed` and `g2Encode` move with them. The receiving package then needs `@noble/curves` 1.9.1.
- `test-orchestration/src/aptos-light-client-live.ts:233` EDIT — `loadAbi` reads forge artifacts. The carrier needs the same read for LockBox.
- `test-orchestration/src/aptos-light-client-live.ts:248` EDIT — `deployLightClient` shells out to `forge script`.
- `test-orchestration/src/aptos-light-client-live.ts:344` EDIT — the validator set map, `signed()` and the `advanceEpoch` loop are the carrier's epoch advance.
- `test-orchestration/src/aptos-light-client-live.ts:402` EDIT — this object is the `EventProof` that `LockBox.recordOutcome` takes.

**Issue text corrections:**
- `AptosLightClient.sol` and `LockBox.sol` are read only, as the issue says. Their ABIs need no change for this test.
- The issue says to reuse the logic in `aptos-light-client-live.ts`. That file is a script, not a module. Nothing exports from it, and `aptos-testnet` does not depend on `test-orchestration`. Reuse means copy or a new shared module.

**Hidden costs:**
- `AptosLightClient` is compiled for `evm_version = "prague"` (`foundry.toml`). It needs the EIP-2537 BLS precompiles. The anvil backend of the dual-chain testnet runs cancun. The INFRA scout marked that site. The round trip must run on the Docker PoS chain, or anvil must move to prague.
- The setup runs `forge build` in this folder (`dual-chain-testnet.ts:115`). A cold full build took 63 to 66 seconds here with 4 threads.
- `test-results/deployment.json` is tracked. It holds addresses of the retired design. Any CI run of the deploy script dirties it.
- This becomes the third copy of the proof encoding, after this script and the SDK carrier of the SDK unwind issue (195).

**Cross-issue pressure:**
- The computed deadline issue (221) changes `lock` and `auctionKey`. The leaf rule issue (222) changes what `releaseByOutcome` accepts. Land 219 first to give both a live regression test, or after them to write it once.

**CI:**
- `aptos-light-client-live.ts` runs only in "Aptos Light Client Live (docker)". That job is gated on ready-for-review. A refactor of it is not covered on drafts.

## 220 Window ids follow the 07:45 and 16:15 UTC closes

**Sites marked:** 2 (ADD 1, EDIT 1)

**Sites:**
- `script/DeployLockBox.s.sol:11` ADD — a fixture script beside this one. It deploys from anvil account 0, locks 10 FakeETH at nonce 0 into the fixture window, and prints `eth_getProof` of the commitment slot.
- `src/escrow/LockBox.sol:102` EDIT — the stub constants 86 400, 27 900 and 58 500 of the computed deadline issue (221) copy this formula.

**Issue text corrections:**
- The issue names no EVM touchpoint. Today none is needed, because LockBox takes the deadline from the caller.
- The Move fixture in `eth_lock_registration_tests.move` pins LockBox at `0x9fE4…a6e0`. That is anvil account 0, nonce 2. FakeETH is nonce 0 and FakeUSD nonce 1. `DeployLockBox.s.sol` deploys in that order, so it can regenerate the fixture. It needs a `LIGHT_CLIENT` env var, but any nonzero address works for a fixture.

**Hidden costs:**
- No tool makes the fixture today. The script is new work.
- If the fixture script is written before 221, it calls `lock` with a deadline. After 221 it must drop that argument.

**Cross-issue pressure:**
- 221 freezes this formula in an immutable contract. 220 must land first.

**CI:**
- None in this partition. The script would run by hand only.

## 221 LockBox computes the lock deadline from the window id

**Sites marked:** 46 (ADD 7, EDIT 27, REMOVE 4, TEST 7, DOC 1)

**Stubs added:**
- `src/escrow/LockBox.sol:103-105` constants `WINDOW_DAY_SECS = 86_400`, `MORNING_CLOSE_SECS = 27_900`, `AFTERNOON_CLOSE_SECS = 58_500` (internal now, public later).
- `src/escrow/LockBox.sol:108` constant `RECLAIM_DELAY = 259_200`.
- `src/escrow/LockBox.sol:167` `error WindowClosed(uint64 windowId, uint64 current)`.
- `src/escrow/LockBox.sol:169` `error WindowTooFarAhead(uint64 windowId, uint64 current)`.
- `src/escrow/LockBox.sol:206` `currentWindowId() internal view virtual returns (uint64)`. It becomes `public view`.
- `src/escrow/LockBox.sol:211` `windowClose(uint64) internal pure returns (uint64)`. It becomes `public pure`.
- `src/escrow/LockBox.sol:216` `lockDeadline(uint64) internal pure returns (uint64)`. It becomes `public pure`.
- `src/escrow/LockBox.sol:165` `error NotImplemented()`, shared with 222. It is scout scaffolding with a REMOVE marker for both issues.

**Sites:**
- `src/escrow/LockBox.sol:9` DOC — "Auction binding" in the contract header.
- `src/escrow/LockBox.sol:64` EDIT — `Lock.deadline` stays. Its only valid value becomes `lockDeadline(windowId)`.
- `src/escrow/LockBox.sol:123` EDIT — `OutcomeRecorded.deadline`: emit the computed one, or drop it.
- `src/escrow/LockBox.sol:148` REMOVE — `DeadlinePassed`.
- `src/escrow/LockBox.sol:163` REMOVE — the scaffolding error.
- `src/escrow/LockBox.sol:199` EDIT — `auctionKey(windowId, pairHash)`.
- `src/escrow/LockBox.sol:239` EDIT — `lock` signature and NatSpec.
- `src/escrow/LockBox.sol:253` EDIT — the deadline check becomes the window bounds.
- `src/escrow/LockBox.sol:277` EDIT — `recordOutcome` keys without the event's deadline.
- `src/escrow/LockBox.sol:299`, `:337` EDIT — the key in `releaseByOutcome` and `reclaim`.
- `src/escrow/LockBox.sol:375` EDIT — `_decodeOutcome` keeps the layout. The deadline is decoded and ignored.
- `test/unit/LockBox.t.sol:32`, `:39` EDIT — `WINDOW = 42` and the setUp deadline.
- `test/unit/LockBox.t.sol:56` EDIT — 12 `auctionKey` calls and 7 `lock` calls drop the deadline.
- `test/unit/LockBox.t.sol:63` EDIT — `_lockInto` drops `dl`.
- `test/unit/LockBox.t.sol:208` EDIT — `test_lockAuctionKeyDependsOnDeadline`.
- `test/unit/LockBox.t.sol:214`, `:221` REMOVE — the two `DeadlinePassed` tests.
- `test/unit/LockBox.t.sol:241-245` TEST — computed deadline, closed window, two ahead, current and next, shared table.
- `test/unit/LockBox.t.sol:296` TEST — key by window and pair, event deadline ignored.
- `test/unit/LockBox.t.sol:389` EDIT — `test_releaseByOutcomeIgnoresOutcomeOfOtherAuction` uses `deadline + 1` as "another auction".
- `test/unit/LockBox.t.sol:574` EDIT — `test_reclaimOnlyVoidsItsOwnAuction` locks `WINDOW + 1` with the same deadline.
- `test/invariant/LockBox.invariant.t.sol:24`, `:27`, `:62`, `:134`, `:183`, `:205` EDIT — fixed windows 10 and 11, one shared deadline, the lock handler, the reclaim warp, `_key`, and the handler constructor.
- `test/integration/LockBoxAptosOutcome.t.sol:55` EDIT — `_lock` drops `d`.
- `test/integration/LockBoxAptosOutcome.t.sol:97` EDIT — the golden test locks into window 42.
- `test/integration/LockBoxAptosOutcome.t.sol:126` EDIT — the warp before `reclaim`.
- `test/integration/LockBoxAptosOutcome.t.sol:147` EDIT — `auctionKey` in the below-quorum test.
- `test/integration/LockBoxAptosOutcome.t.sol:167` EDIT — window 7 is closed at the warped time.
- `test/integration/LockBoxAptosOutcome.t.sol:220` TEST — a signed event whose deadline differs still records under the new key.

**Issue text corrections:**
- The external ABI change is narrower than the issue suggests. Only `lock` and `auctionKey` change, and three views are added. `releaseByOutcome` and `reclaim` keep their signatures, because the `Lock` struct keeps `deadline`. The `Locked` event does not change. So `lockFromReceipt` and the SDK release bindings need no change.
- `OutcomeRecorded` is not named in the issue. It carries `deadline`, which is no longer part of the key. Dropping it changes topic0, so keep it and emit the computed value or the event's value.
- `test/utils/OutcomeTreeBuilder.sol` is a touchpoint that needs no change. `outcomeBcs` keeps the deadline field, because the layout stays.
- `script/DeployLockBox.s.sol` needs no change for 221. The constructor does not change. It needs a change only if the deploy should log the window constants.
- The issue's line numbers for `LockBox.sol` and `LockBox.t.sol` are right on `main`. The integration lock calls are at `:170-172` on main, not `:168-172`. The issue misses the golden test's lock at main `:98` and the `_lock` helper at main `:55-61`.
- The header says "Aptos accepts only `deadline == auction::eth_lock_deadline(windowId)`". That function lives in `eth_proof`, not `auction`. Fix the name when this text is rewritten.

**Hidden costs:**
- Every LockBox test assumes a fixed window id. Unit tests warp to 1 700 000 000, where window 42 closed in 1970. The golden vector pins window 42, so its test must warp to 1970 (window 42 closes at second 1 842 300) to lock, then reclaim at `lockDeadline(42)` = 2 101 500.
- The golden event pairs window 42 with `eth_lock_deadline` 1 767 225 600. No formula gives that. The vector is pinned by the fork, so it stays. `recordOutcome` must ignore the field, or this test cannot pass.
- The invariant handler warps time forward in `reclaim`. After that, window ids fixed at setup are closed. The handler must pick windows at the current time and skip a closed one, or fail-on-revert breaks the run.
- The shared (window id, close, deadline) table needs a new JSON file in the SDK partition. `foundry.toml` already lets forge read `../atomica-sdk/tests/fixtures`, so no config change is needed.
- `windowClose(w)` overflows `uint64` for window ids near `2^64`. `lock` bounds the window, so this never reaches storage. The public view should still state it reverts there.
- One LockBox redeploy changes the address every client and fixture reads.

**Cross-issue pressure:**
- 222 edits the same functions. `releaseByOutcome` line `:300` (key) sits four lines above the sum loop 222 replaces. Both rewrite the invariant handler and `LockBox.t.sol`. Ship both in one pull request, or land one and rebase the other.
- The light client age limit of the SDK unwind issue (195) meets the golden test. The test locks in 1970 and records a 2026 LedgerInfo. If the age check rejects a LedgerInfo from the future, warp forward before `recordOutcome`.
- The reclaim delay (owner decision 36) is frozen here. The MOVE scout found that pull request 213's constants put a floor of about 48 hours under it.

**CI:**
- "EVM Contract Tests (forge)" runs `LockBoxTest`, `LockBoxInvariantTest` and `LockBoxAptosOutcomeTest`, with a floor of 60 tests and four named suites. New cases in these files run with no workflow change.
- A new forge test file must match the job's `--match-path` glob and be added to its `forge fmt --check` list, or it never runs. The INFRA scout marked that step.

**Questions answered or sharpened by the code:**
- Should `reclaim` read `l.deadline` or `lockDeadline(l.windowId)`? Either is right. The commitment binds `l.deadline`, and every new lock stores the computed value.
- A lock sent in the last seconds of a window can be mined in the next window. It then reverts with `WindowClosed`. No funds are lost. The client should target the next window near a close.

## 222 LockBox pays every leaf: remainder to depositor, unpayable leaf reclaims

**Sites marked:** 31 (ADD 5, EDIT 8, REMOVE 1, TEST 14, DOC 3)

**Stubs added:**
- `src/escrow/LockBox.sol:140` `event LockReclaimedUnpayable(bytes32 indexed lockId, bytes32 indexed auctionKey, address indexed depositor, uint256 amount)`.
- `src/escrow/LockBox.sol:171` `error LeafPayable(bytes32 lockId)`.
- `src/escrow/LockBox.sol:352` `reclaimUnpayable(Lock calldata, OutcomeTree.Payout[] calldata, OutcomeTree.LeafProof calldata) internal virtual`. It becomes `external`.
- `src/escrow/LockBox.sol:371` `_leafUnpayable(uint256, OutcomeTree.Payout[] calldata) internal pure returns (bool, uint256)`.
- `src/escrow/LockBox.sol:165` `error NotImplemented()`, shared with 221.

**Sites:**
- `src/escrow/LockBox.sol:10`, `:11` DOC — the "two ways" and "All or nothing" header text.
- `src/escrow/OutcomeTree.sol:4` DOC — what a leaf means. No hash changes.
- `src/escrow/LockBox.sol:134` EDIT — `LockReleased` may carry the remainder.
- `src/escrow/LockBox.sol:157` EDIT — `PayoutSumMismatch` only for a sum above the amount.
- `src/escrow/LockBox.sol:164` REMOVE — the scaffolding error.
- `src/escrow/LockBox.sol:286` EDIT — the `payouts` NatSpec.
- `src/escrow/LockBox.sol:304` EDIT — the sum loop becomes the shared unpayable test.
- `src/escrow/LockBox.sol:319` ADD — send the remainder to the depositor.
- `test/unit/LockBox.t.sol:351` EDIT — `test_releaseByOutcomeRevertsOnPayoutSumMismatch`.
- `test/unit/LockBox.t.sol:401-404` TEST — short, empty, exact and over-sum release.
- `test/unit/LockBox.t.sol:584-590` TEST — seven `reclaimUnpayable` cases.
- `test/unit/LockBox.t.sol:646` TEST — an empty payout list as its own test.
- `test/invariant/LockBox.invariant.t.sol:77`, `:120`, `:223` EDIT — the outcome handler, the release handler, `afterInvariant`.
- `test/invariant/LockBox.invariant.t.sol:147`, `:257` TEST — a `reclaimUnpayable` handler and `invariant_everyInTreeLockCanClose`.

**Issue text corrections:**
- `test_releaseByOutcomeRevertsOnPayoutSumMismatch` (main `:336`) is a real break. It sends 9 of 10 ether. Under the new rule that is a payable short sum. The call then fails the proof with `InvalidProof`, not `PayoutSumMismatch`. The test needs an over-sum leaf that is in the tree.
- `test_releaseByOutcomeRevertsOnZeroRecipient` (main `:364`) needs no change if `releaseByOutcome` keeps raising `ZeroRecipient`.
- `test_reclaimOfLockInTreeReverts` (main `:433-442`) needs no change. `reclaim` keeps its rule.
- `test/utils/OutcomeTreeBuilder.sol` needs no change. It already hashes any payout list, including an empty one and a list whose sum overflows.
- The issue does not say what status `reclaimUnpayable` sets. Reuse `Reclaimed`. A new enum value changes the SDK `LOCK_STATUS` map.
- The issue does not say whether `reclaimUnpayable` sets `auctionReclaimed`. It must not. The outcome is already recorded.

**Hidden costs:**
- The overflow case needs `unchecked` addition with a carry check. Checked addition reverts with a panic, which would make the leaf frozen again.
- The invariant suite runs with fail-on-revert, 64 runs and depth 60. The release handler must skip unpayable leaves, or every run fails.
- The shared outcome tree fixture stays unchanged. Its case count of 4 is asserted here (`test_vectorsMatchSolidity`), in four Move tests and in the SDK. Add new cases as separate tests, not as fixture rows.

**Cross-issue pressure:**
- Same functions and test files as 221. Ship both in one LockBox redeploy with the SDK unwind issue (195).
- After pull request 213, the Move docs of `record_outcome`, `finalize` and `E_UNPAYABLE_OUTCOME` say LockBox needs an exact sum. The MOVE scout recorded that. The Move builder can stay stricter.

**CI:**
- "EVM Contract Tests (forge)" runs all new cases in the existing files. A new file needs the glob and the fmt list, as for 221.

**Questions answered or sharpened by the code:**
- Order of checks in `reclaimUnpayable`: open lock, recorded outcome, Merkle proof, then unpayable. The leaf hash covers the payout list, so the proof needs no sum.
- A remainder sent to the depositor is safe from a forged short leaf. The leaf hash binds the payout list, so nobody can shorten a certified leaf.

## 242 Canonical docs match the code

**Sites marked:** 1 (DOC 1)

**Sites:**
- `src/escrow/LockBox.sol:12` DOC — the header says "no admin, relayer, owner or upgrade key". A recorded outcome trusts the Aptos package upgrade key.

**Issue text corrections:**
- The issue scopes only five docs and puts "any code change" out of scope. This NatSpec repeats the trust sentence. It changes only if the owner names the upgrade key (decision 30). Widen the scope to code comments, or leave it.

## No sites in this partition

216, 217, 218, 223, 224, 225, 226, 227, 228, 229, 230, 231, 232, 233, 234, 235, 236, 237, 238, 239, 240, 241, 243.

Notes on some of them:
- The minimum lock size issue (218) puts a LockBox minimum out of scope. LockBox accepts any nonzero amount. A lock below the Aptos minimum is accepted on Ethereum, refused on Aptos, and waits for the reclaim deadline.
- The price unit issue (217) and the bid validity issue (216): `FakeUSD.MAX_MINT_AMOUNT` is 10 000 USD per mint call. Every test that needs more collateral needs several mints.
- The pair allowlist issue (224): LockBox treats `pairHash` as opaque. A lock bound to the old empty pair cannot join a window and goes home by `reclaim`.
- The UI happy path issue (236): LockBox has no view that lists the locks of an auction. The release button must read `Locked` events.
- The cleanup issue (239) leaves the retired contracts (`src/DepositBox.sol`, `src/Settlement.sol`, `src/BLSVerifier.sol`, `src/archived/`, `test-orchestration/src/index.ts`) to the SDK unwind issue (195).

## Unmarkable sites

- `test/fixtures/aptos/aptos_outcome_proof_vectors.json` (221): the golden event pairs window 42 with `eth_lock_deadline` 1 767 225 600. It is generated by the fork and must not change. JSON holds no comment.
- `test-results/deployment.json` (219): tracked, and rewritten by `DeployAptosLightClient._record`. It holds addresses of the retired design.
- `out/LockBox.sol/LockBox.json` (221, 222): generated and ignored by git. The dual-chain testnet and `atomica-demo/scripts/deploy-lockbox-real.ts` read its ABI.

## Seen outside my partition

- The scout stubs add five ABI entries to the LockBox artifact: errors `NotImplemented`, `WindowClosed`, `WindowTooFarAhead`, `LeafPayable`, and event `LockReclaimedUnpayable`. Readers of `out/LockBox.sol/LockBox.json` see them. No test compares that ABI. The function ABI and the deployed bytecode are unchanged.
- The Move fixture pins the LockBox address `0x9fE4…a6e0` (anvil account 0, nonce 2). If it is regenerated from the dual-chain setup after 219, where the light client deploys first, that address changes.

## Check results

All run from `source/evm-contracts` on the final state, forge 1.8.3, solc 0.8.24. Local runs, not CI.

- `forge build --threads 4`: exit 0. "Compiler run successful!" (3 files from cache).
- `forge build --force --threads 4`: exit 0. "Compiling 80 files with Solc 0.8.24 … Compiler run successful with warnings". The six solc warnings are the same six as the first wave's baseline log of `main` (DepositTypes, MockProofs, Deploy.s.sol, DeploymentVerification). None is in a touched file. Forge lint notes per file are equal to the baseline (LockBox 6, OutcomeTree 1).
- Bytecode check: `main` and worktree copies of `src`, built with `FOUNDRY_CBOR_METADATA=false FOUNDRY_BYTECODE_HASH=none forge build --threads 4 src/escrow/LockBox.sol src/aptos/AptosLightClient.sol`. Deployed bytecode is identical for LockBox, OutcomeTree and AptosLightClient. The LockBox function ABI is identical.
- `forge fmt --check src/aptos src/escrow test/unit/aptos test/unit/LockBox.t.sol test/invariant test/integration/LockBoxAptosOutcome.t.sol test/utils/MockAptosLightClient.sol test/utils/OutcomeTreeBuilder.sol script/DeployAptosLightClient.s.sol script/DeployLockBox.s.sol`: exit 0.
- `forge test --threads 4 --match-path 'test/{unit/aptos/*,unit/LockBox.t.sol,invariant/LockBox*,integration/LockBoxAptosOutcome.t.sol}' -vv`: exit 0. "Ran 7 test suites … 84 tests passed, 0 failed, 0 skipped (84 total tests)". Same count as the baseline. `LockBoxTest`, `OutcomeTreeVectorsTest`, `LockBoxInvariantTest` and `LockBoxAptosOutcomeTest` all ran.
- `test-orchestration`: `bun install` skipped, because `node_modules` exists and its postinstall builds an INFRA package. `bun run build`: exit 0 (a no-op echo). `bun run lint`: exit 0. `bun run format:check`: exit 0, "All matched files use Prettier code style!".
- `git status --short -- source/evm-contracts`: 8 modified files, all intended. No tracked build output changed.

## Suggested order

1. The window id formula (220). It fixes the numbers LockBox will freeze.
2. The computed deadline (221) and the leaf rule (222) together, in one LockBox redeploy with the SDK unwind issue (195). They edit the same functions, the same invariant handler and the same unit test file. One pull request avoids two rebases and two redeploys.
3. The round-trip test (219) either before step 2, as a live regression net, or right after it, to write the lock call once. After is cheaper.
4. The docs issue (242) at any time. Its LockBox site is a comment.
