# INFRA scout report

Partition: `source/docker-testnet/**`, `source/test-utils/**`, `source/atomica-zkp/**`, `source/scripts/**`, `.github/**`, `.githooks/**`, `scripts/**` and root files. Worktree: `~/tmp/superfield-worktrees/atomica/scout-remediation-seams` at `4ca0acd`.

Second wave. The first wave left 43 modified files and 4 new files in this partition. I reviewed every edit. All of them are comments, it.todo cases or uncalled stubs. I kept them. I tightened one marker (219 in `browser-commands.ts`, the lock helper is not exported). I added 15 CI markers in `test-web.yaml` for the unit job and the browser chunks. The first-wave edit to `scripts/check-test-coverage.js` adds two comment lines and nothing else, so it is behaviour neutral. I kept it.

Line numbers below are worktree lines after the markers, unless they say HEAD.

## Pin inventory (one fork revision, many copies)

Every product pin of the fork revision. "Mine" means it is in this partition and carries a 228 and a 243 marker.

| Pin | HEAD location | Mine | Checked by CI today |
| --- | --- | --- | --- |
| `APTOS_VERSION` env | `.github/workflows/test-web.yaml:32` | yes | Move Framework Pin compares it with `Move.toml` |
| hardcoded `binary-52beee31a6`, Aptos Testnet SDK job | `test-web.yaml:385` | yes | no |
| hardcoded tag, Browser Tests anvil | `test-web.yaml:646` | yes | no |
| hardcoded tag, Browser Tests docker | `test-web.yaml:791` | yes | no |
| `APTOS_PROOF_RELEASE`, `APTOS_PROOF_COMMIT` (full SHA), `IMAGE_NAME` tag | `test-web.yaml:995-997` | yes | no |
| hardcoded tag, two jobs | `.github/workflows/test-web.yml:54`, `:148` | yes | no |
| hardcoded tag | `.github/workflows/aptos-docker-testnet.yaml:54` | yes | no (gone if 239 lands first) |
| validator image digest, header and four services | `source/docker-testnet/config/docker-compose.yaml:6,25,74,117,160` | yes | no |
| same digest, five copies | `config/docker-compose-inline-genesis.yaml:6,27,84,135,186` | yes | no (gone if 239 lands first) |
| fallback digest | `docker-testnet/aptos-testnet/src/genesis.ts:120` | yes | no |
| fallback digest | `docker-testnet/typescript-sdk/src/genesis.ts:119` | yes | no (gone if 239 lands first) |
| digest in a comment | `docker-testnet/aptos-testnet/test/docker-testnet.test.ts:29` | yes | no |
| `AptosFramework` rev | `source/atomica-move-contracts/Move.toml:6` | no (MOVE) | Move Framework Pin |

The Move Unit Tests, Move Lint Warnings and Move Framework Pin jobs read `APTOS_VERSION` from the env. The other five install steps do not. The digest `c868815…` is the image of `binary-52beee31a6` (commit `914ed0d`, "pin the validator image to binary-52beee31a6").

A new revision needs three fork artifacts. The binary release is cut only by a push to `dev-atomica` that changes `*.rs`, `Cargo.toml` or `Cargo.lock` (`build-aptos-binary.yml`). A Move-only fork merge (226, 230, parts of 231) cuts no release, so it needs a `workflow_dispatch`. The validator image workflow listens for `release: published`, but the release is made with the default token, which fires no workflow, so the image needs a manual dispatch of `build-validator-image.yml`. Only then is a digest known for the compose file.

## 216 Invalid bids: collateral and bounds

**Sites marked:** 2 (ADD 1, TEST 1)

**Sites:**
- `.github/workflows/test-web.yaml:534` ADD — a commented-out "at least N Move tests ran" step above Run Move Tests.
- `.github/workflows/test-web.yaml:619` TEST — the bid-settle chunk runs 09 and 10 against the new rules.

**Issue text corrections:**
- The test plan says the Move Unit Tests job "reports more than zero tests in the auction modules". Nothing enforces that today. The forge job has a floor. The Move job has none.

**CI:**
- Move tests run in Move Unit Tests (gated). The browser cases run in Browser Tests (bid-settle, anvil) (gated) and (bid-settle, docker) (gated from ready-for-review).

## 217 One price unit

**Sites marked:** 5 (TEST 5)

**Sites:**
- `.github/test-coverage-exemptions.yaml:17`, `:20` TEST — `tests/SettlementStatus.test.tsx` and `tests/WithdrawWinnings.test.tsx` are browser-mode and exempt. No job runs them.
- `.github/workflows/test-web.yaml:226` TEST — the new SDK price test runs in the Unit Tests job with no workflow edit.
- `test-web.yaml:620`, `:639` TEST — bid-settle and happy-path chunks.

**CI:**
- A price assert for SettlementStatus or WithdrawWinnings must go in `tests/unit/`, or it never runs.

## 218 Caps and minimum lock sizes

**Sites marked:** 3 (EDIT 1, TEST 2)

**Sites:**
- `source/docker-testnet/aptos-testnet/src/browser-commands.ts:611` EDIT — the batch lock command feeds the seller-cap test. Its amounts must meet the minimums.
- `test-web.yaml:626` TEST — settle-100-bids, anvil. It took 10.5 of 45 minutes on main (run 43093915182).
- `test-web.yaml:783` TEST — settle-100-bids, docker. It took 18.1 of 60 minutes on main.

**Hidden costs:**
- 100 seller locks add 100 register and 100 `create_auction` transactions. On the Docker PoS chain each lock batch waits real 12 second slots. Check both timeouts.

## 219 Live cross-chain round-trip test

**Sites marked:** 23 markers plus 7 it.todo cases (ADD 4, EDIT 13, REMOVE 1, TEST 3, DOC 2)

**Stubs added:**
- `source/docker-testnet/aptos-testnet/test/auction-round-trip.test.ts` — new file, seven `it.todo` cases, one per acceptance assert.
- `source/docker-testnet/aptos-testnet/src/outcome-carrier.ts` `fetchAptosEventProof(aptosNodeUrl, version, eventIndex)`, `advanceLightClientTo(carrier, lightClient, aptosNodeUrl, targetEpoch)`, `recordAuctionOutcome(carrier, lockBox, aptosNodeUrl, proof)`, type `AptosEventProofResponse`.
- `source/docker-testnet/aptos-testnet/src/eth-derivable-account.ts` `submitAsEthAccount(aptos, ethPrivateKey, siweDomain, data): Promise<string>`.
- `source/docker-testnet/aptos-testnet/src/dual-chain-testnet.ts:162` `deployAptosLightClient(deployer, aptosNodeUrl): Promise<string>`.

**Sites:**
- `dual-chain-testnet.ts:55` EDIT — `contracts` gains `aptosLightClient`.
- `dual-chain-testnet.ts:67` EDIT — the relayer comment is stale (LockBox has no settlementAuthority). That account is the natural carrier. A second bidder (account 3) is needed.
- `dual-chain-testnet.ts:139` REMOVE — `NO_LIGHT_CLIENT`.
- `dual-chain-testnet.ts:223` EDIT — the anvil backend runs cancun, which has no EIP-2537 precompiles.
- `dual-chain-testnet.ts:259`, `:275`, `:308` EDIT — fund the second bidder; deploy the light client; move the Aptos start above the LockBox deploy.
- `browser-commands.ts:407` EDIT — `lockAndProve` serves three depositors. It needs the `pairBcsHex` parameter from pull request 213, and an export.
- `aptos-testnet/src/payloads.ts:119` EDIT — `getBidPayload` and `submitBid` there are stale and unused.
- `aptos-testnet/src/index.ts:1108` ADD — export the two new helpers when used.
- `aptos-testnet/test/lockbox-release.test.ts:24` EDIT — its header says release is forge-only.
- `ethereum-testnet/typescript-sdk/src/index.ts:216` EDIT — the "Deneb with Electra disabled" comment is wrong. The Docker genesis has `ELECTRA_FORK_EPOCH=0`.
- `test-web.yaml:341` EDIT — job timeout. `:437` TEST, `:438` EDIT — the run step and its Ethereum backend. `:1063` EDIT — the Light Client Live image build is not needed here. `:1213` TEST — the gate already lists this job.
- `aptos-testnet/README.md:68`, `aptos-testnet/test/README.md:393` DOC.

**Issue text corrections:**
- The issue asks for "a validator image that serves `/v1/atomica/event_proof`, as the Aptos Light Client Live (docker) job builds". No image step is needed. The compose default digest is the `binary-52beee31a6` image, and that fork commit serves `event_proof`, `epoch_change_proof` and `genesis_waypoint` (`api/src/atomica_proofs.rs:98,121,142`).
- The test must run on the Docker PoS Ethereum chain. `ETH_BACKEND` is unset in that job, so it already does. On anvil it would fail: anvil starts with `--hardfork cancun`.
- The `payloads.ts` touchpoint is a trap. Its builders are a stale third copy of the auction ABI. `submit_bid` takes six arguments on main, not two. Use the SDK builders.
- The issue names no Node-side signer. `create_auction` and `submit_bid` must be signed by the depositor's Ethereum-derivable account (SIWE). The SDK path needs `window.ethereum`, so a Node signer is new work.
- `lockAndProve` is module private. The test must call it through the browser command or export it.
- The light client deploy in `aptos-light-client-live.ts` shells out to `forge script`. The testnet setup deploys with ethers from forge artifacts, so a second deploy path is new code.

**Hidden costs:**
- The Aptos Testnet SDK job took 20.8 of 45 minutes on main. The round trip adds a dual-chain boot, three locks, three proofs and a timelock reveal. The timeout needs review.
- The vitest config sets `isolate: false` and one worker. All files share the testnet singletons.
- The outcome carrier is the third copy of the proof encoding (after `aptos-light-client-live.ts` and the SDK carrier of issue 195).

**Cross-issue pressure:**
- Needs pull request 213 merged first: per-lock outcome records, `settle_locks` and the `pairBcsHex` lock parameter.
- If 243 lands first, the window close is up to 15.5 hours away. The round trip cannot reach a reveal without the test cap of 243's open question 1.
- 221 changes the lock call and 222 the release rules this test asserts. Landing 219 first gives those two a live regression test. Landing it after saves one rewrite.

**CI:**
- New file is credited today: `bun scripts/check-test-coverage.js --verbose` shows `auction-round-trip.test.ts <- test-web.yaml / aptos-testnet-sdk`. That job is in the Required Checks gate, docker tier, so it is skipped on drafts.

## 220 Window ids follow the 07:45 and 16:15 closes

**Sites marked:** 3 (EDIT 2, TEST 1)

**Sites:**
- `browser-commands.ts:394` EDIT — `testLockBinding` uses the SDK `currentWindowId` mirror and the host clock.
- `aptos-testnet/test/lockbox-release.test.ts:220` EDIT — reads `eth_lock_deadline` back; no constant here changes.
- `test-web.yaml:613` TEST — auction chunk.

**Issue text corrections:**
- `browser-commands.ts` and `lockbox-release.test.ts` are not in the touchpoints. They follow the SDK mirror, so they need no code edit if the mirror moves with the Move formula.

## 221 LockBox computes the deadline from the window id

**Sites marked:** 12 (EDIT 10, TEST 2)

**Sites:**
- `browser-commands.ts:154` EDIT — `EthLockProofResult.deadline`.
- `browser-commands.ts:388` EDIT — `LOCKBOX_LOCK_ABI`.
- `browser-commands.ts:395` EDIT — `testLockBinding` deadline and the window check against `block.timestamp`.
- `browser-commands.ts:462` EDIT — the `lock()` call.
- `browser-commands.ts:492` EDIT — anvil mining moves `block.timestamp` ahead.
- `ethereum-testnet/typescript-sdk/src/index.ts:636` EDIT — `anvil_mine` with a 12 second interval moves the anvil clock ahead for good.
- `lockbox-release.test.ts:49` EDIT `LOCKBOX_ABI`; `:94` EDIT `register()`; `:244` EDIT the wrong-deadline case.
- `test-web.yaml:441` TEST, `:640` TEST, `:1024` EDIT — forge fmt list must name any new forge test file.

**Hidden costs:**
- Once `LockBox.lock` checks the window against `block.timestamp`, three clocks must agree: host, Ethereum block, Aptos. On anvil each proof mines 12 blocks 12 seconds apart. After a few proofs the anvil clock can be minutes ahead. A lock near a close can fail on Ethereum and pass on Aptos.

**CI:**
- New forge test files run only if they match the `--match-path` glob and are added to the fmt list.

## 222 LockBox pays every leaf

**Sites marked:** 2 (EDIT 2)

**Sites:**
- `test-web.yaml:1025` EDIT — forge fmt list and match path for a new `reclaimUnpayable` test file.
- `lockbox-release.test.ts:50` EDIT — `LOCKBOX_ABI` gains `reclaimUnpayable` only if the live test covers it.

## 224 Pair allowlist

**Sites marked:** 4 (ADD 2, EDIT 1, TEST 1)

**Stubs added:**
- `browser-commands.ts:372` `allowTestPairCommand(baseChain, baseToken, quoteChain, quoteToken): Promise<{ pairBcsHex: string }>`.

**Sites:**
- `browser-commands.ts:179` ADD — declare `allowTestPair` in the vitest browser module.
- `browser-commands.ts:396` EDIT — the empty pair default is not on the allowlist.
- `test-web.yaml:610` TEST — auction chunk.

**Issue text corrections:**
- A new browser command must also be registered in `source/atomica-web-components/vitest.config.ts`. The issue does not name that file.

**Cross-issue pressure:**
- Pull request 213 changes the same `testLockBinding` default to `"0x"` and adds `pairBcsHex`. 224 then changes the default to the launch pair.

## 225 Only the auction package registers a timelock (fork)

**Sites marked:** 2 (EDIT 2)

**Sites:**
- `source/docker-testnet/config/generate-genesis.sh:88` EDIT — with no `timelock_registrar` in the layout, every `register_timelock` aborts.
- `aptos-testnet/src/index.ts:125` EDIT — the same, from the SDK side.

**Cross-issue pressure:**
- This is the biggest trap in the plan. Any product pin move to a fork revision that contains 225 breaks every timelock registration on the product testnet until 243's genesis work lands. So 228's pin move (for 227) must either pick a fork revision from before 225, or carry 243's genesis change with it.

## 228 Open bids from ciphertexts

**Sites marked:** 20 (EDIT 14, TEST 4, DOC 2)

**Sites:**
- Every pin in the table above, except `Move.toml`.
- `test-web.yaml:472` EDIT — Move Framework Pin passes only when `Move.toml` and `APTOS_VERSION` move together.
- `test-web.yaml:541` TEST — Move tests need the fork's price-plaintext golden ciphertexts and the decrypt native.
- `test-web.yaml:621`, `:627`, `:641` TEST — bid-settle, settle-100-bids, happy-path.
- `aptos-testnet/src/payloads.ts:120` EDIT — one more stale `submit_bid` builder.
- `config/README.md:52`, `:171` DOC — the image section and the trigger list are stale.

**Issue text corrections:**
- The issue lists `APTOS_VERSION` in `test-web.yml` and `aptos-docker-testnet.yaml`. Those are hardcoded shell variables, not env. It misses the three hardcoded install steps in `test-web.yaml` (HEAD `:385`, `:646`, `:791`), the two fallback digests in `genesis.ts` files and the inline-genesis compose file.

**Hidden costs:**
- The pin needs a binary release and a validator image (see Pin inventory). The image needs a manual dispatch.

**Cross-issue pressure:**
- Shares every pin line with 243. See 225 for the ordering trap.

## 231 Align chain epochs (fork)

**Sites marked:** 2 (ADD 1, EDIT 1)

**Sites:**
- `generate-genesis.sh:90` EDIT — `epoch_duration_secs: 86400` and the "first epoch ends at the first block" rule change.
- `aptos-testnet/src/genesis.ts:196` ADD — pass the boundary layout values to the script.

**Hidden costs:**
- Once the product pins a revision with 231, live tests must not register a timelock within 25 minutes of an epoch end. The testnet layout must pick boundaries that keep CI clear of that.

## 232 getDerivedAddress lowercases

**Sites marked:** 1 (EDIT 1)

**Sites:**
- `aptos-testnet/src/siwe.ts:1` EDIT — re-export only. The hand lowercasing in `aptos-testnet/src/payloads.ts:17` and `:60` becomes redundant. No change is needed.

## 233 Bidder registers its FakeUSD lock

**Sites marked:** 2 (EDIT 1, TEST 1)

**Sites:**
- `lockbox-release.test.ts:95` EDIT — `register()` hand-builds a third copy of the register payload.
- `test-web.yaml:618` TEST — bid-settle chunk.

## 234 Client refuses a LockBox that differs from the pin

**Sites marked:** 3 (TEST 3)

**Sites:**
- `dual-chain-testnet.ts:336` TEST — `eth_proof::initialize` writes the pin. A fixture with the zero addresses of `source/.env.test` will be refused.
- `test-web.yaml:227` TEST — the new lock guard test runs with no workflow edit.
- `test-web.yaml:642` TEST — happy-path must still lock.

## 235 Client builds the bid identity locally

**Sites marked:** 3 (EDIT 2, TEST 1)

**Sites:**
- `dual-chain-testnet.ts:73` EDIT — expose all four validator API URLs for the extra-endpoint key check.
- `aptos-testnet/src/chain-config.ts:2` EDIT — a dead copy of the SDK `ChainConfig` (239 deletes it).
- `test-coverage-exemptions.yaml:48` TEST — `12a-bid-storage.test.tsx` is exempt and in no chunk.

**CI:**
- The issue's stored-opening case in `12a-bid-storage.test.tsx` never runs. Put it in `tests/unit/` or add the file to a chunk.

## 236 UI completes a trade

**Sites marked:** 14 (EDIT 9, TEST 5)

**Sites:**
- `test-web.yaml:632`, `:788` EDIT — `11-claim-and-reclaim` in both chunk lists.
- `test-web.yaml:638`, `:794` TEST — happy-path chunks.
- `test-web.yaml:700` EDIT — a renamed chunk must also go in the two `if:` chunk lists.
- `test-web.yaml:1214` EDIT — and in the gate list.
- `test-web.yaml:232` TEST — `ReleaseButton.test.tsx` runs with no workflow edit.
- `test-web.yaml:329` EDIT — the demo unit step names its files one by one.
- `test-web.yml:108` TEST — the only step the coverage guard credits for `14-happy-path`.
- `test-coverage-exemptions.yaml:46` EDIT, `:57` TEST.
- `scripts/check-test-coverage.js:306` EDIT — the guard does not expand `matrix.test_files`.
- `dual-chain-testnet.ts:224`, `ethereum-testnet/typescript-sdk/src/index.ts:217` EDIT — anvil must start on prague.

**Issue text corrections:**
- Release on the anvil tier needs anvil on `--hardfork prague`. Neither issue names `ethereum-testnet/typescript-sdk/src/index.ts`.
- The browser files count as covered only through the exemption list, because the guard does not expand the matrix.

## 237 Remove the beacon light client

**Sites marked:** 4 (EDIT 1, TEST 2, DOC 1)

**Sites:**
- `test-state-proofs.yml:25` EDIT — "Beacon-only tests self-skip" goes stale.
- `test-state-proofs.yml:26` TEST — this workflow has path filters and is not gated.
- `test-web.yaml:312` TEST — `tests/ibe.test.ts` is the only gated state-proofs test.
- `ethereum-testnet/README.md:93` DOC — the beacon data flow and two helpers with no caller.

**CI:**
- No required check proves that state-proofs still works without the beacon client, except the IBE test. The rest runs in the non-gated State Proof Verifier workflow.

## 238 Remove dead Move code

**Sites marked:** 15 (EDIT 5, REMOVE 8, TEST 2)

**Sites:**
- `dual-chain-testnet.ts:329`, `localnet.ts:230`, `deploy-atomica-contracts.test.ts:54` REMOVE — `registry::initialize`.
- `deploy-atomica-contracts.test.ts:79` EDIT — the expected module list and the registry assert.
- `localnet.ts:185`, `browser-commands.ts:253`, `typescript-sdk/src/index.ts:623` EDIT — comments naming registry.
- `test-web.yaml:631`, `:787` REMOVE — `12-fee-rebate` in both chunk lists.
- `test-coverage-exemptions.yaml:25`, `:50`, `:52` REMOVE — three fee-rebate files.
- `test-coverage-exemptions.yaml:58` TEST, `test-web.yaml:440` TEST.

**Issue text corrections:**
- The issue names only the `initialize` call at `deploy-atomica-contracts.test.ts:55`. The module list and the registry assert below it also name the module.
- The issue names two workflow lines. Three exemption lines also must go, or the guard fails on a missing file.
- `lock_receipt::initialize` (`dual-chain-testnet.ts:347`, `:355`) stays. 238 changes the stored struct, not the entry.

## 239 Remove unused SDKs, mocks, placeholders, atomica-zkp

**Sites marked:** 31 markers plus 1 it.todo case (REMOVE 19, DOC 7, EDIT 2, TEST 3)

**Stubs added:**
- `source/docker-testnet/aptos-testnet/test/timelock-genesis.test.ts` — new vitest file, one `it.todo` for 239 and one for 243.

**Sites:**
- REMOVE whole: `.github/workflows/aptos-docker-testnet.yaml`, `typescript-sdk/` (marked at README and the test file), `rust-sdk/` (at `Cargo.toml`), `source/atomica-zkp/` (at README), the four config files, the six `test-utils` files.
- REMOVE (missed by the issue): `aptos-testnet/src/ensureFramework.ts` and its export at `index.ts:1104`; `aptos-testnet/src/chain-config.ts`.
- EDIT: `localnet.ts:37` header names the old SDK; `test-web.yaml:342` job time.
- DOC: `docker-testnet/README.md:9`, `:111`, `:196`; `config/README.md:137`, `:156`; `aptos-testnet/README.md:67`; `aptos-testnet/test/README.md:394`.

**Verified safe to delete:**
- `typescript-sdk`: only `aptos-docker-testnet.yaml` runs it. Three demo scripts import its package name, but demo `tsconfig` includes only `src`, so nothing type-checks them.
- `rust-sdk`: no Cargo workspace, workflow or script names it. Its one test is `#[ignore]`.
- The four config files: only `docker-compose-inline-genesis.yaml` mounts `validator-entrypoint.sh` and `node-config.template.yaml`. Nothing reads `validator-config.yaml` or the inline compose file.
- `test-utils` mocks: no importer outside the folder. No package, tsconfig or lint config covers it. `browser-commands.ts` and `browser-utils/` stay (`tests/FakeEthMint.test.tsx` imports them).
- `atomica-zkp`: no workflow, Cargo workspace or package references it. Its `package.json` has no scripts.
- `ensureFramework.ts` reads `source/atomica-aptos` and `source/move-framework-fixtures`, which do not exist.
- Every test the old workflow ran, except timelock genesis, has a same-named copy in `aptos-testnet/test`.

**Issue text corrections:**
- `.github/workflows/README.md` does not mention `aptos-docker-testnet.yaml`. It needs no edit.
- `source/README.md` is in no scout partition. It names `atomica-zkp` and `test-utils`.
- The demo script `dual-testnet-orchestrator.ts` also imports `../test-utils/localnet`, and `aptos-funding.ts` imports `../test-utils/aptos-keys`. Neither file exists. Repointing the package import will not make these scripts run.
- The acceptance grep will also match the scout markers that name these paths. Strip the markers in the same change.

**Hidden costs:**
- The moved test adds one more testnet boot and an epoch wait to a job at 20.8 of 45 minutes.

**CI:**
- The new file is credited today: `timelock-genesis.test.ts <- test-web.yaml / aptos-testnet-sdk`. Deleting `aptos-docker-testnet.yaml` drops five files from the guard, which all go with the SDK. No other workflow or script breaks.

## 241 Remove the reserve price

**Sites marked:** 5 (EDIT 2, TEST 3)

**Sites:**
- `test-utils/TestAuctionOrchestrator.ts:70`, `test-utils/Types.ts:69` EDIT — a mock `minPrice` of an old EVM model, not `create_auction`'s. No edit is needed once 239 deletes them.
- `test-coverage-exemptions.yaml:37`, `:59` TEST — `03-approve-and-lock` and `selectors.test.tsx` never run in CI.
- `test-web.yaml:612` TEST — auction chunk.

**Issue text corrections:**
- The two `test-utils` touchpoints need no change. They are dead code that 239 deletes.

## 242 Canonical docs match the code

**Sites marked:** 2 (DOC 2)

**Sites:**
- `README.md:40` DOC — the rebate curve reads as product behaviour.
- `README.md:110` DOC — the status lines repeat the stale PRD block.

**Issue text corrections:**
- The root `README.md` repeats both stale passages. The issue does not list it.

## 243 create_auction registers the timelock

**Sites marked:** 26 markers plus 1 it.todo case (ADD 4, EDIT 20, TEST 1, DOC 1)

**Stubs added:**
- `aptos-testnet/src/genesis.ts:42` `timelockRegistrarAddress(packageAddress: string): string`.
- `test-web.yaml:490` ADD — a commented-out step that fails when a workflow names a `binary-` tag other than `APTOS_VERSION`.

**Sites:**
- Every pin in the table above.
- `generate-genesis.sh:89` EDIT — add `timelock_registrar` to the layout.
- `genesis.ts:29` EDIT `GenesisConfig`; `:195` ADD the env var to the script.
- `index.ts:124` EDIT — `DockerTestnet.new` passes the address.
- `dual-chain-testnet.ts:251` EDIT — the package address can come from `APTOS_ATOMICA_CONTRACT_ADDRESS`, so genesis must use the same rule.
- `localnet.ts:71` EDIT — `DEPLOYER_ADDR`.
- `deploy-atomica-contracts.test.ts:80` EDIT — it publishes under a random address. That package is not the registrar.
- `test-web.yaml:442` EDIT, `:500` ADD (no check ties the compose digest to the tag), `:611` TEST.

**Issue text corrections:**
- The registrar address is a sha3-256 of the package address and seed. `generate-genesis.sh` runs inside the validator image and cannot hash it. `genesis.ts` must derive it and pass it in.
- The new pin check as written in the scope catches `binary-` tags only. It misses `APTOS_PROOF_COMMIT`, the `IMAGE_NAME` tag and every digest.

**Cross-issue pressure:**
- Shares every pin with 228. If both fork revisions are ready together, move the pins once.
- Open question 1 (test cap) decides whether 219, 216, 217, 218 and 228 can still reach a reveal in CI.

## No sites in this partition

- 223: the product testnet runs chain id 4 (`generate-genesis.sh:23`, `index.ts:128`), which the issue exempts. Confirmed: no change.
- 226, 229, 230, 240: fork-only. No product pin must move for them. They ride along with any later pin move.
- 227: fork-only. Its product pin moves are marked under 228.

## Unmarkable sites

- `source/docker-testnet/typescript-sdk/package.json`, `tsconfig.json`, `eslint.config.mjs` (239): JSON or covered by the README marker of the deleted directory.
- `source/atomica-zkp/package.json`, `solidity/foundry.lock`, `solidity/bad_proof_data.json`, `data/*` (239): covered by the README marker.
- `source/docker-testnet/rust-sdk/src/lib.rs`, `tests/basic_test.rs` (239): covered by the `Cargo.toml` marker.

## Seen outside my partition

- `docs/decisions/aptos-validator-timelock.md:530` says `aptos-docker-testnet.yaml` runs the timelock genesis test (239). The issue does not list it.
- `source/README.md:10`, `:13` name `atomica-zkp` and `test-utils` (239). No scout owns that file.
- `source/atomica-web-components/vitest.config.ts` must register any new browser command (224 `allowTestPair`).
- `source/atomica-demo/scripts/dual-testnet-orchestrator.ts:25` and `aptos-funding.ts:8` import files that do not exist (239).

## Check results

All local runs, not CI.

- `bun <scratch>/yaml-same.js <worktree> <9 YAML files>`: every file `SAME` (parsed YAML at HEAD equals the working copy, so no workflow behaviour changed).
- `python3 -c 'import yaml,sys; yaml.safe_load(open(sys.argv[1]))'` on the five `.github` YAML files: all parse.
- `bun scripts/check-test-coverage.js --verbose`: "Test files under source/: 118. Run by a CI job: 84. Exempt: 34. Test coverage guard passed."
- `bun scripts/check-docs.js`: "Documentation rules check passed."
- `bash -n` on `generate-genesis.sh` and `validator-entrypoint.sh`: pass.
- `source/docker-testnet/aptos-testnet`: `bun run build` pass, `bun run lint -- --max-warnings=0` pass, `bun run format:check` "All matched files use Prettier code style!"
- `source/docker-testnet/ethereum-testnet/typescript-sdk`: `bun run build` pass, prettier check pass.
- `source/docker-testnet/typescript-sdk`: no `node_modules`. Prettier check of the three edited files with its `.prettierrc` passes. Not built.
- `source/test-utils`: no lint or format config. Prettier flags these files at HEAD too, so the markers add nothing new.
- Pull request 213 (head `b3b7dbc`): `git merge-file` of its `browser-commands.ts` onto the marked file merges with no conflict. My markers at `:394-396` and `:407` sit on the `testLockBinding` doc and above `lockAndProve`, which 213 rewrites. They survive the merge but must be reread against 213's new text.
- `git status --short`: every changed path in this partition is a marker, a todo file or a stub. No tracked `dist/` was dirtied.

## Suggested order

1. 239 first. It deletes four pin copies (old workflow, inline compose, old `genesis.ts`) and the dead `chain-config.ts`, so 228 and 243 touch fewer files. It is independent of the Move work.
2. Pull request 213, then 219. 219 needs 213's outcome records. Landing 219 before 221 and 222 gives both a live release test.
3. 221 and 222 after 219, then 220, so the window formula changes once on a live-tested path.
4. 228 and 243 together, or 243 first. Any fork revision with 225 breaks testnet timelock registration until 243's genesis line lands. Move every pin once.
5. 231's pin move last, after the owner picks the epoch boundaries.
