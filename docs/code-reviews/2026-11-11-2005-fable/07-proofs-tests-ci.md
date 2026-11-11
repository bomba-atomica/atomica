# Chapter 7: Proof Tooling, Tests and CI

**Scope:** `source/state-proofs`, `source/docker-testnet`, `source/atomica-zkp`, `source/golden-vectors`, the test suites, `.github/workflows` and `.githooks`.
**Method:** A delegated reviewer read the code at commit `cbd03f4`. I re-read the lines behind T-1 to T-5 at `main` commit `4ca0acd` and dropped what the LockBox merge (212) fixed. Nothing was built or run. A local hook is not CI, and no CI run was started for this review.

---

## Summary

| ID | Severity | Finding |
| --- | --- | --- |
| T-1 | High | No test runs lock, auction and release across both chains |
| T-2 | High | The off-chain beacon light client accepts unsigned updates |
| T-3 | High | The shipped lock-proof generator never runs against a chain in CI |
| T-4 | Medium | `verifyReceiptProof` ignores the receipt it claims to verify |
| T-5 | Medium | The "EVM e2e" job deploys and tests the retired contracts |
| T-6 | Medium | Proof and testnet workflows sit outside the required gate |
| T-7 | Medium | Several tests assert nothing |
| T-8 | Low | Test keys are silent defaults in exported code |
| T-9 | Low | `atomica-zkp` is a scaffold wired to nothing |
| T-10 | Low | Testnet validators observe Ethereum at `latest` through one RPC |

---

## T-1 High: no test runs lock, auction and release across both chains

**Evidence** (confirmed at `4ca0acd`)

- The live dual-chain test stops before release: "Outcome release (releaseByOutcome) and reclaim are covered by the forge LockBox unit, invariant and light client integration tests" (`source/docker-testnet/aptos-testnet/test/lockbox-release.test.ts:33-35`).
- The forge integration test uses a golden vector, not an outcome from a real auction.
- The live light client check proves an unrelated fee event (`source/evm-contracts/test-orchestration/src/aptos-light-client-live.ts:41`, before the merge).
- The browser happy path ends on Aptos with a faucet mint (Chapter 6, C-1).
- Nothing on Aptos emits `AuctionOutcome` yet (Chapter 3, A-9).

**Consequence**

Each half is tested. The join is not. A mismatch between the outcome the Move code will build and the payout LockBox makes would pass every check. The cross-window attack (Chapter 4, E-1) lives exactly in that join.

**Smallest fix**

Make one live test an acceptance criterion of the unwind issue (194): two bidders and one seller lock on Ethereum, the auction settles on Aptos, a carrier records the outcome, and the test asserts every Ethereum balance.

---

## T-2 High: the off-chain beacon light client accepts unsigned updates

**Evidence** (confirmed at `4ca0acd`)

- On a failed signature the code proceeds when any participation bit is set: "Proceeding anyway (Local/Demo mode)" (`source/state-proofs/typescript/src/beacon/sync.ts:83-93`).
- `verifyExecutionPayloadProof` is `return true` (`sync.ts:221-227`).
- The finality and sync committee branches are parsed and never checked.
- The CLI advertises "Verify with light client (trustless mode)".

**Reach**

This code is not in the on-chain path. Aptos reads validator-certified headers. The module is exported from the package and used by the `eth-verify` CLI and demo scripts. Anyone who uses it as a trust source can be fed a forged state root by one RPC.

**Smallest fix**

Delete `src/beacon` and the CLI commands that use it. The certified-header model replaced it.

---

## T-3 High: the shipped lock-proof generator never runs against a chain in CI

The browser tests build proofs with a separate helper (`source/docker-testnet/aptos-testnet/src/browser-commands.ts`, `generateEthLockProofCommand`). The shipped `generateLockedBalanceProof` (`source/atomica-sdk/src/ethereum/proofs/generator.ts`) is mocked in the unit tests that touch it (`tests/unit/SellFlow.resume.test.tsx`, `tests/unit/hooks/sell-flow-state.test.tsx`). The browser files that would exercise it (03 to 06) are exempt in `.github/test-coverage-exemptions.yaml`. A regression in the generator a user actually runs ships green.

**Smallest fix:** make the test helper call the shipped generator.

---

## T-4 Medium: `verifyReceiptProof` ignores the receipt

`source/state-proofs/typescript/src/receipt.ts:28` takes `_receipt` and never reads it. A forged receipt with real siblings returns true. Require the encoded target to equal `siblingReceipts[index]`, as the transaction verifier already does. Nothing on chain uses this function.

---

## T-5 Medium: the "EVM e2e" job deploys and tests the retired contracts

**Evidence** (confirmed at `4ca0acd`)

- `source/evm-contracts/test-orchestration/src/index.ts:184` runs `src/script/Deploy.s.sol:Deploy`. That is DepositBox, Settlement and BLSVerifier.
- Two cases in `test/e2e/DeploymentVerification.t.sol` are `vm.skip(true)` (before the merge: lines 272 and 334).
- The orchestrator's `results` object is never filled, so its summary always prints zero failures (before the merge: `index.ts:64`, `:305-307`).
- "EVM e2e tests (anvil)" and "(docker)" are required checks.

Two required checks spend their time on contracts the decision record retired. The real LockBox and light client suites run in "EVM Contract Tests (forge)" (`.github/workflows/test-web.yaml:971`), which has a test count floor.

**Smallest fix:** delete the retired contracts, their tests, `Deploy.s.sol` and the orchestrator. The SDK issue (195) lists the contracts. Add the orchestrator and the two jobs.

---

## T-6 Medium: proof and testnet workflows sit outside the required gate

The gate list in `.github/workflows/test-web.yaml` (the "Wait for every gated job" step) does not include "State Proof Verifier", "Aptos Docker Testnet Tests", "Ethereum Docker Testnet Tests" or "Test Web UI". The first three are path-filtered. A change that breaks proof verification through a shared dependency can merge.

`gh run list` showed "Test Web (TypeScript/Vitest)" as failed on the push of `cbd03f4` to `main`. I did not open the run. The run for `4ca0acd` had not finished when this review ended.

---

## T-7 Medium: tests that assert nothing

- `source/state-proofs/typescript/test/verifier.test.ts:6-27`, `:100-113`: asserts sit inside `if (result.valid)`.
- `test/mpt.test.ts:8-20`: "should verify valid MPT proof" asserts that the result is a boolean.
- `test/integration.test.ts:210-229`: named for a beacon check it never makes.
- `source/atomica-zkp/tests/solidity_verifier.rs:77-83`: a forge build failure returns early as a pass.
- `source/atomica-zkp/solidity/test/Verifier.t.sol:38-40`: the negative test returns when its fixture is missing.

(Line numbers before the merge.) Delete them. The live cases next to them already cover tampering.

---

## T-8 to T-10 Low

- **T-8.** `source/docker-testnet/aptos-testnet/src/aptos-keys.ts:15-26` and `dual-chain-testnet.ts` fall back to a deployer key that is committed to git. Shipped components import this package (Chapter 6). Throw when the variable is unset.
- **T-9.** `source/atomica-zkp/src/lib.rs` is two lines. The Solidity verifier is generated for a toy circuit that proves `advice == 42`. No workflow references the crate. Delete it until the ZK work starts.
- **T-10.** `source/docker-testnet/config/generate-genesis.sh:34` defaults the validators' Ethereum block tag to `latest`, and every validator reads one RPC. CI never sees two validators disagree on a header. The fork's own default is `finalized`. Add one test where a validator uses a different RPC.

---

## What each workflow leaves untested

| Workflow | Runs | Leaves untested |
| --- | --- | --- |
| `test-web.yaml` (required) | SDK and UI unit tests, Move unit tests and lint, browser files 01, 02, 07 to 14 and 16, the retired EVM stack, the LockBox and light client forge suites, one live light client check | Browser files 03 to 06 and 15. Release from a real outcome. The shipped proof generator. |
| `test-state-proofs.yml` (not required, path-filtered) | Lint, format, `bun test` on anvil and docker | A receipt outside the set. The signature bypass. Any Merkle branch check. |
| `aptos-docker-testnet.yaml` (not required, path-filtered) | Five files of the older `typescript-sdk` | Header attestation. Proof code. |
| `ethereum-docker-testnet.yaml` (not required) | SDK tests on anvil and docker | Verification against Aptos. |
| `lint-web.yaml`, `check-docs.yaml` | Lint, format, types, docs rules | Behaviour. |
| Five `*.todo` files | Nothing | `atomica-zkp`, an older Move job, Pages deploy. |
| `.githooks/pre-push` (local only) | Build, lint, format | Tests. The hook says so. |

---

## Security behaviours with no test that executes them

- A release on Ethereum from the outcome of a real auction.
- A bid with a receipt bound to another window (Chapter 4, E-1).
- A winning bid whose collateral is below its payment (Chapter 3, A-1).
- A bid whose quantity overflows the clearing sum (Chapter 3, A-2).
- A header attested by validators that disagree.
- A lock proof built against the wrong Ethereum chain.

---

## Duplication

- Two Aptos testnet SDKs: `source/docker-testnet/typescript-sdk` and `aptos-testnet`. They differ by about 20 lines in `genesis.ts`.
- `source/docker-testnet/rust-sdk` (507 lines, one ignored test) is referenced by nothing.
- Three lock-proof builders: the SDK generator, the browser command, and inline `eth_getProof` in the release test.
- Stale testnet configs that no SDK uses: `docker-compose-inline-genesis.yaml`, `validator-entrypoint.sh`, `node-config.template.yaml`, `validator-config.yaml`.

---

## What is solid

- Lock id and storage key derivation agree across Solidity, TypeScript and Move, and the lock proof carries no root of its own.
- The required-checks gate fails closed on a missing, unknown or skipped job.
- The coverage guard proves its own failure mode.
- The light client forge suite has real negative cases and a test count floor.
- The live light client check fails loudly and tests two forged signatures against a live validator set.
- The sign-in golden vectors are regenerated and diffed in CI.
- The client's IBE port is checked byte for byte against fork vectors.
- Docker-only tests report as skipped on anvil, not as passed.
