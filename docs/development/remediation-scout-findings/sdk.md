# SDK scout report

Partition: `source/atomica-sdk/**`, `source/state-proofs/**`, `source/golden-vectors/**`, `source/shared/**` in the worktree `scout-remediation-seams`.

This is the second wave. The first wave left 53 modified files and 3 new files here. I reviewed every edit. All of them keep behaviour, build, lint and format. I kept them, and I added or changed these:

- `source/atomica-sdk/src/ethereum/lockbox.ts:2` new marker for the computed deadline issue (221): the header says a lock names its auction by deadline.
- `source/atomica-sdk/src/aptos/payloads.ts:383` new marker for the pin guard issue (234): the guard must not pull the Aptos client into the `@atomica/sdk/ethereum` entry.
- `source/atomica-sdk/README.md:29` new DOC marker for the price unit issue (217).
- `source/atomica-sdk/tests/register-lock-payload.test.ts` two `it.todo` texts reworded, because the argument counts of the mpk removal (238), the reserve price removal (241) and the timelock registrar issue (243) depend on the order they land.

Line numbers below are in the worktree after the markers. Total: 246 marked sites across 19 issues.

## 216 Invalid bids: collateral covers price times quantity

**Sites marked:** 4 (ADD 0, EDIT 3, REMOVE 0, TEST 1, DOC 0)

**Sites:**
- `source/atomica-sdk/src/aptos/sealed-bid.ts:104` EDIT: `BidInfo` gains the validity flag.
- `source/atomica-sdk/src/aptos/sealed-bid.ts:115` EDIT: `getBidInfo` reads a positional tuple `(bidder, ciphertext, commitment, opened, price)`, and the new element must be read by position.
- `source/atomica-sdk/tests/sealed-bid.test.ts:80` EDIT: the mocked `get_bid_info` tuple gains the flag.
- `source/atomica-sdk/tests/sealed-bid.test.ts:176` TEST: `getBidInfo` returns the validity flag.

**Issue text corrections:**
- The issue names only `getBidInfo`. `decryptWindowBids` (`sealed-bid.ts:222`) uses `info.opened` to report `alreadyOpened`. An invalid bid counts as opened, so a preview shows it as opened with no hint that it is invalid. Decide whether `OpenedBid` carries the flag.
- The SDK has no reader for the new invalid-bid event. No SDK change is needed for it unless the UI shows it.

**Cross-issue pressure:**
- The commit and reveal removal (228) rewrites the same tuple: it drops `commitment`, so `opened` and `price` move up one place. Land 216 first, then 228 rewrites the reader once. If 228 lands first, 216's tuple index changes.

**CI:**
- `tests/sealed-bid.test.ts` runs in Unit Tests (atomica-sdk, atomica-web-components) with `bun run test` (vitest in headless Chromium).

## 217 One price unit across Move, SDK and UI

**Sites marked:** 17 (ADD 4, EDIT 9, REMOVE 0, TEST 3, DOC 1)

**Stubs added:**
- `source/atomica-sdk/src/price.ts` `parsePrice(text: string): bigint` — throws `NOT_IMPLEMENTED`.
- `source/atomica-sdk/src/price.ts` `formatPrice(price: bigint): string` — throws `NOT_IMPLEMENTED`.
- `source/atomica-sdk/tests/price.test.ts` — new file with three `it.todo` cases. The coverage guard maps it to `test-web.yaml / unit-tests`.

**Sites:**
- `source/atomica-sdk/src/price.ts:11`, `:16` ADD: the parser and the formatter.
- `source/atomica-sdk/src/price.ts:21` ADD: `quoteForFill` moves here.
- `source/atomica-sdk/src/index.ts:7` ADD: export both from the root `@atomica/sdk`.
- `source/atomica-sdk/src/settlement/bridge.ts:480` EDIT: `quoteForFill` doc names the unit. It is the only SDK code that turns a price into FakeUSD units.
- `source/atomica-sdk/src/aptos/payloads.ts:147` EDIT: `minPrice` of `getCreateAuctionPayload`.
- `source/atomica-sdk/src/aptos/payloads.ts:503` EDIT: `getSettlement().clearingPrice`.
- `source/atomica-sdk/src/aptos/payloads.ts:634` EDIT: `fetchRebates(clearingPrice)`.
- `source/atomica-sdk/src/aptos/payloads.ts:814` EDIT: cleartext prices of `getSubmitCleartextPayload`.
- `source/atomica-sdk/src/aptos/payloads.ts:855` EDIT: `price` of `getOpenBidPayload`.
- `source/atomica-sdk/src/aptos/sealed-bid.ts:176` EDIT: `sealBid(price)` takes `parsePrice` output.
- `source/atomica-sdk/tests/register-lock-payload.test.ts:236` EDIT: `MIN_PRICE = 500_000n` reads as micro-dollars.
- `source/atomica-sdk/tests/settlement-bridge.test.ts:633` EDIT: the only SDK test that pins the unit (`quoteForFill(ETH / 2n, 2010n)`).
- `source/atomica-sdk/tests/price.test.ts:11`, `:14`, `:17` TEST: parse and format cases, the throw cases, and the `quoteForFill` case.
- `source/atomica-sdk/README.md:29` DOC: add the two functions to the root export table.

**Issue text corrections:**
- The SDK parses and formats no price from text today. Every price parse and display is in the web components. The SDK only passes `bigint` prices through. So the SDK change is the two new functions and doc comments.
- `quoteForFill` lives in `settlement/bridge.ts`, which the open SDK unwind issue (195) rewrites. The browser tests import it from `@atomica/sdk/settlement/bridge`. Moving it to `price.ts` needs a re-export from `bridge.ts`, or 195 deletes it under the tests.
- `ethereum/balances.ts` has `parseUSDAmount` and `formatUSDBalance`. They scale by 6 decimals. They are token amount helpers, not price helpers. A price that goes through them is off by one million. I did not mark them, because they do not change. The issue should say they must never take a price.

**Hidden costs:**
- `package.json` needs no new `exports` entry if the functions go in the root index. A `./price` subpath would need one.

**Cross-issue pressure:**
- The reserve price removal (241) deletes `minPrice`. The mpk and rebate removal (238) deletes `fetchRebates`. The commit and reveal removal (228) deletes the open and cleartext builders. Five of the nine EDIT sites go away with those. Land 217 after them to avoid editing dead code.
- 195 deletes the relayer around `quoteForFill`. Land the move to `price.ts` before 195, or inside it.

**CI:**
- `tests/price.test.ts` runs in Unit Tests (atomica-sdk, atomica-web-components). `bun scripts/check-test-coverage.js` lists it under `test-web.yaml / unit-tests`.

## 218 Caps and minimum lock sizes per window

**Sites marked:** 3 (ADD 2, EDIT 0, REMOVE 0, TEST 1, DOC 0)

**Stubs added:**
- `source/atomica-sdk/src/aptos/payloads.ts` `interface WindowLimits { maxBidsPerWindow; maxSellerLocksPerWindow; minSellerLockAmount; minBidCollateral }`.
- `source/atomica-sdk/src/aptos/payloads.ts` `getWindowLimits(): Promise<WindowLimits>` — throws.

**Sites:**
- `source/atomica-sdk/src/aptos/payloads.ts:607`, `:615` ADD.
- `source/atomica-sdk/tests/aptos-view-queries.test.ts:226` TEST.

**Questions answered or sharpened by the code:**
- The view's Move name is not fixed yet. The reader's function path and tuple order must follow the MOVE scout's stub.

## 220 Window ids follow the 07:45 and 16:15 UTC closes

**Sites marked:** 11 (ADD 0, EDIT 9, REMOVE 0, TEST 2, DOC 0)

**Sites:**
- `source/atomica-sdk/src/ethereum/lock-binding.ts:13` EDIT: `WINDOW_EPOCH_SECS = 43_200n` becomes the day length.
- `source/atomica-sdk/src/ethereum/lock-binding.ts:16` EDIT: `WINDOW_SPLIT_SECS = 28_500n` becomes the two closes.
- `source/atomica-sdk/src/ethereum/lock-binding.ts:36` EDIT: `currentWindowId` formula.
- `source/atomica-sdk/src/ethereum/lock-binding.ts:45` EDIT: `windowCloseSecs` formula.
- `source/atomica-sdk/tests/ethereum/storage-key.test.ts:31` EDIT: `WINDOW = 83075n`. Under the new formula the anvil lock time falls in window 41538 (I checked: second 1794441599 is day 20768, t 86399).
- `source/atomica-sdk/tests/ethereum/storage-key.test.ts:52` EDIT: the deadline `1794700800n` and the commitment pin.
- `source/atomica-sdk/tests/ethereum/storage-key.test.ts:103` EDIT: the `eth_lock_deadline` block pins old closes and spells `28_500n`.
- `source/atomica-sdk/tests/register-lock-payload.test.ts:50`, `:114` EDIT: the mock proof uses window 83075 and deadline 1794700800.
- `source/atomica-sdk/tests/ethereum/storage-key.test.ts:127`, `:130` TEST: both sides of each close, and closes of windows 0 to 3.

**Issue text corrections:**
- The issue line ranges are right (`lock-binding.ts:14-16`, `storage-key.test.ts:102-110`).
- The issue misses `storage-key.test.ts:52-59`. That case pins a commitment read from a live LockBox on anvil. Its window and deadline change, so the expected commitment must be read again from anvil. It cannot be computed from the SDK alone without trusting the SDK mirror it tests.

**Hidden costs:**
- The anvil commitment pin needs one live anvil lock to regenerate.

**Cross-issue pressure:**
- The computed deadline issue (221) edits the same two test files and `lock-binding.ts`. 220 must land first, because 221 freezes the formula in LockBox.

**CI:**
- Unit Tests (atomica-sdk, atomica-web-components) runs both test files.

## 221 LockBox computes the lock deadline from the window id

**Sites marked:** 24 (ADD 0, EDIT 19, REMOVE 2, TEST 3, DOC 0)

**Sites:**
- `source/atomica-sdk/src/ethereum/abis.ts:35` EDIT: `lock(...)` drops `uint64 deadline`.
- `source/atomica-sdk/src/ethereum/abis.ts:37` EDIT: the `Lock` tuple in `reclaim` and `releaseByOutcome`.
- `source/atomica-sdk/src/ethereum/abis.ts:42` EDIT: `auctionKey(windowId, pairHash)`, plus new `lockDeadline`, `windowClose`, `currentWindowId` fragments.
- `source/atomica-sdk/src/ethereum/abis.ts:51` EDIT: `OutcomeRecorded` event.
- `source/atomica-sdk/src/ethereum/lockbox.ts:2` EDIT: module header.
- `source/atomica-sdk/src/ethereum/lockbox.ts:83` EDIT and `:97` REMOVE: `lockToken` sends no deadline.
- `source/atomica-sdk/src/ethereum/lockbox.ts:240` EDIT: `reclaimLock` tuple.
- `source/atomica-sdk/src/ethereum/lock-binding.ts:19` EDIT: `ETH_RECLAIM_DELAY_SECS` is frozen by LockBox.
- `source/atomica-sdk/src/ethereum/lock-binding.ts:26` EDIT: `LockBinding.deadline` becomes derived only.
- `source/atomica-sdk/src/ethereum/lock-binding.ts:54` EDIT: `ethLockDeadline` must match `LockBox.lockDeadline`.
- `source/atomica-sdk/src/ethereum/lock-binding.ts:78` EDIT: `auctionKey` drops the deadline.
- `source/atomica-sdk/src/ethereum/proofs/generator.ts:24`, `:61` EDIT: `LockTerms` and `LockedBalanceProof.deadline`.
- `source/atomica-sdk/src/ethereum/types.ts:14` EDIT: `LockBoxContract.lock` type.
- `source/atomica-sdk/src/aptos/payloads.ts:283` EDIT and `:317` REMOVE: the register payload drops argument 6.
- `source/atomica-sdk/tests/register-lock-payload.test.ts:51`, `:96`, `:113` EDIT: nine arguments become eight, indexes 7 and 8 become 6 and 7.
- `source/atomica-sdk/tests/ethereum/storage-key.test.ts:87` EDIT: the auction key case.
- TEST: `storage-key.test.ts:133` (shared table), `:136` (new key), `register-lock-payload.test.ts:311` (eight arguments).

**Issue text corrections:**
- `src/ethereum/types.ts:14` (`LockBoxContract.lock`) is missing from the issue. The demo script `deploy-lockbox-real.ts` uses that type.
- `lockFromReceipt` and `getLocks` (`lockbox.ts:139`, `:187`) need no change. The issue keeps the deadline in the `Locked` event and the commitment.
- `generator.ts` still needs the deadline. It recomputes the commitment from `terms` and refuses a proof that does not match. So a wrong SDK mirror makes the client refuse its own good lock. Keep `ethLockDeadline` exactly equal to `LockBox.lockDeadline`.

**Hidden costs:**
- `tests/fixtures/outcome_tree_vectors.json` does not change: a leaf holds no deadline.
- `source/docker-testnet/aptos-testnet/test/lockbox-release.test.ts` imports `getRegisterLockPayload`, so the argument change reaches the INFRA partition.

**Cross-issue pressure:**
- 220 first. The leaf rule issue (222) edits the same `LOCKBOX_ABI` block and the same `lockbox.ts` header; one redeploy should carry both, so one SDK pull request can update the ABI once.
- The bidder lock issue (233) edits `getRegisterLockPayload` too (type argument). The two edits are on different lines.

**CI:**
- Unit Tests (atomica-sdk, atomica-web-components) runs the SDK tests. The live lock path runs only in the Aptos Testnet SDK (docker) job.

## 222 LockBox pays every leaf: remainder to depositor

**Sites marked:** 5 (ADD 1, EDIT 4, REMOVE 0, TEST 0, DOC 0)

**Sites:**
- `source/atomica-sdk/src/ethereum/abis.ts:32` EDIT: the ABI comment names two ways out.
- `source/atomica-sdk/src/ethereum/abis.ts:38` ADD: `reclaimUnpayable` fragment, event and errors.
- `source/atomica-sdk/src/ethereum/abis.ts:57` EDIT: `LOCK_STATUS` if LockBox adds a status.
- `source/atomica-sdk/src/ethereum/lockbox.ts:1` EDIT: module header.
- `source/atomica-sdk/src/settlement/outcome-tree.ts:27` EDIT: `OutcomeEntry` doc.

**Cross-issue pressure:**
- `planSettlementReleases` in `settlement/bridge.ts` throws when a winner "owes" more than is left. It assumes exact sums. 195 owns that code. It should adopt the remainder rule, or it duplicates the old one.

**CI:**
- `tests/outcome-tree.test.ts` must pass against the unchanged vectors in Unit Tests (atomica-sdk, atomica-web-components).

## 224 Pair allowlist for auction windows

**Sites marked:** 10 (ADD 3, EDIT 5, REMOVE 0, TEST 2, DOC 0)

**Stubs added:**
- `source/atomica-sdk/src/aptos/payloads.ts` `isPairAllowed(pairBcs: Uint8Array): Promise<boolean>` — throws.
- `source/atomica-sdk/src/aptos/payloads.ts` `getLaunchPairBcs(): Promise<Uint8Array>` — throws.
- `LAUNCH_PAIR_BCS` is a marker only (`payloads.ts:133`), because a constant cannot be a throwing stub.

**Sites:**
- `source/atomica-sdk/src/aptos/payloads.ts:133`, `:134`, `:139` ADD.
- `source/atomica-sdk/src/ethereum/lock-binding.ts:60` EDIT: `pairHashOf` callers must pass the listed bytes.
- `source/atomica-sdk/src/settlement/bridge.ts:105` EDIT: `bcsEncodePair` writes 4-byte lengths.
- `source/atomica-sdk/src/settlement/bridge.ts:931` EDIT: `servedPairBcs` defaults to empty bytes.
- `source/atomica-sdk/tests/ethereum/storage-key.test.ts:53` EDIT: the anvil lock is bound to empty pair bytes.
- `source/atomica-sdk/tests/sealed-bid.test.ts:38` EDIT: `PAIR = new Uint8Array(0)`.
- TEST: `aptos-payloads.test.ts:263`, `aptos-view-queries.test.ts:229`.

**Issue text corrections:**
- The launch pair BCS is `0x08657468657265756d0746616b65455448056170746f730746616b65555344`. I checked it against the `Pair` field order in `auction.move` (base_chain, base_token, quote_chain, quote_token) with one-byte ULEB128 lengths.
- `bcsEncodePair` in `settlement/bridge.ts` is not Move BCS. It writes 4-byte little-endian lengths. Move BCS writes ULEB128 lengths. Its doc says it builds `pair_bcs`. Any client that uses it gets bytes that are not on the allowlist. The issue does not name it. 195 owns the file, so the issue should say "do not use it" or 195 should fix it.

**Cross-issue pressure:**
- The timelock registrar issue (243) edits `getCreateAuctionPayload` beside these stubs. No line conflict.

## 225 Only the auction package registers a timelock

**Sites marked:** 2 (ADD 0, EDIT 2, REMOVE 0, TEST 0, DOC 0)

**Sites:**
- `source/atomica-sdk/src/aptos/payloads.ts:209` EDIT: `getRegisterTimelockPayload` aborts with `E_NOT_REGISTRAR` for every wallet.
- `source/atomica-sdk/src/aptos/payloads.ts:246` EDIT: `registerTimelock` fails the same way.

**Issue text corrections:**
- The issue lists `payloads.ts:191-220` as out of scope, which is right. The SDK breaks only when the product moves its framework pin, which is the registrar issue (243).

**Cross-issue pressure:**
- The fork change alone breaks nothing in the product until the pin moves. 243 removes both functions in the same pull request that moves the pin.

## 228 Auction opens bids from ciphertexts

**Sites marked:** 37 (ADD 2, EDIT 20, REMOVE 12, TEST 3, DOC 0)

**Stubs added:**
- `source/atomica-sdk/src/aptos/payloads.ts` `getOpenBidsPayload(windowId: bigint, pairBcs: Uint8Array, maxBids: bigint): InputGenerateTransactionPayloadData` — throws.
- `source/atomica-sdk/src/aptos/payloads.ts` `openBids(ethAddress: string, windowId: bigint, pairBcs: Uint8Array, maxBids: bigint): Promise<{ hash: string }>` — throws.

**Sites:**
- `payloads.ts:390`, `:427` EDIT: `getBidPayload` and `submitBid` lose `commitment`.
- `payloads.ts:813`, `:838`, `:854`, `:870`, `:887`, `:902` REMOVE: the cleartext, open and finalize builders and senders.
- `payloads.ts:916`, `:925` ADD.
- `sealed-bid.ts:1`, `:22`, `:105`, `:116`, `:165`, `:175`, `:207`, `:222`, `:253` EDIT: header, import, `BidInfo`, the tuple, `SealedBid`, `sealBid`, `OpenedBid`, `decryptWindowBids`, the 40-byte check.
- `ibe/bid.ts:9`, `:130` REMOVE: `BID_COMMIT_TAG`, `computeBidCommitment`. `:117` EDIT: `encodeBidPlaintext` loses the salt.
- `ibe/index.ts:24` EDIT: the re-export list.
- `tests/aptos-payloads.test.ts:58` REMOVE, `:71` EDIT, `:163` REMOVE, `:213` EDIT.
- `tests/ibe-bid.test.ts:68` REMOVE, `:84` EDIT, `:93` REMOVE.
- `tests/sealed-bid.test.ts:81`, `:97`, `:135` EDIT.
- `source/state-proofs/typescript/tests/ibe.test.ts:1` EDIT: the copied fork vectors and the commit named in the header.
- TEST: `aptos-payloads.test.ts:254`, `:257`, `sealed-bid.test.ts:191`.

**Issue text corrections:**
- Line numbers are right on `main` (`getBidPayload` 339, `submitBid` 360, `getSubmitCleartextPayload` 733, `getOpenBidPayload` 760, `getFinalizeRevealPayload` 792).
- The issue misses `submitCleartextAndClear` (`payloads.ts:745` on main). Its acceptance grep names it, so it must go too.
- The web components `tests/unit/bidStorage.test.ts` imports `computeBidCommitment`. The issue does not list that file.

**Hidden costs:**
- `source/state-proofs/typescript/tests/fixtures/ibe_v2_golden_vectors.json` must be copied again from the fork at the new pin. The copy is byte for byte, from `atomica-aptos/atomica/golden_vectors/ibe_v2_golden_vectors.json`, made by `cargo test -p aptos-dkg --lib ibe::golden_vectors::write_golden_vectors -- --ignored --nocapture`.
- `tests/sealed-bid.test.ts` holds golden values inline (fork `2c32b09d95`). The new 8-byte price cases of the decrypt native issue (227) need new inline constants there.

**Cross-issue pressure:**
- The bid validity issue (216) and the bidder identity issue (235) edit `sealBid`, `BidInfo` and `getBidInfo`. The trade completion issue (236) wants a single open action that calls `submitCleartextAndClear` until 228 replaces it. Order: 216, 235, 236, then 228. 228 deletes the salt storage that 235 adds.

**CI:**
- Unit Tests (atomica-sdk, atomica-web-components) runs the SDK files. `tests/ibe.test.ts` runs in the gated Web Tests (integration) job.

## 232 getDerivedAddress lowercases the Ethereum address

**Sites marked:** 3 (ADD 0, EDIT 1, REMOVE 0, TEST 2, DOC 0)

**Sites:**
- `source/atomica-sdk/src/siwe.ts:67` EDIT: encode `ethAddress.toLowerCase()`.
- `source/atomica-sdk/tests/derived-address.test.ts:20`, `:25` TEST.

**Issue text corrections:**
- I confirmed the bug. `getDerivedAddress("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266", "localhost:3000")` is `0x50ccc023d06341b127ca69fd9a204f401118aca3385292926aa2a9ed42ae80e6`. The checksummed form gives `0xe11acdf0cf46eabcf4f4017216788559bb370eb844d32f24970aa285de022dfe`. The first value is recorded in the test file as the known answer.
- `transaction.ts:167` and `payloads.ts:28`, `:77` lowercase before the call. They need no change.

**Hidden costs:**
- `tests/fixtures/golden_vectors.json` (SIWE) does not change. Its addresses are all digits, so case does not matter.

## 233 Bidder registers its FakeUSD lock

**Sites marked:** 5 (ADD 1, EDIT 3, REMOVE 0, TEST 1, DOC 0)

**Stubs added:**
- `source/atomica-sdk/src/aptos/payloads.ts` `type RegisterLockAsset = "FakeETH" | "FakeUSD"`.

**Sites:**
- `payloads.ts:279` ADD, `:282` EDIT, `:308` EDIT (the hardcoded type argument).
- `tests/register-lock-payload.test.ts:87` EDIT, `:308` TEST.

**Issue text corrections:**
- `LockedBalanceProof` already carries `tokenAddress`. A caller can pass `FakeUSD` with a FakeETH proof, and Aptos rejects it late. The builder could check the asset against the token. The issue should decide.
- `lockFromReceipt` and `generateLockedBalanceProof` need no change, as the issue says.

**Cross-issue pressure:**
- 221 edits the argument list of the same builder. 233 edits the type argument. Small rebase only.
- `source/docker-testnet/aptos-testnet/test/lockbox-release.test.ts` also calls `getRegisterLockPayload`. The default keeps it working.

## 234 Client refuses to lock when its LockBox differs from the pin

**Sites marked:** 16 (ADD 3, EDIT 8, REMOVE 0, TEST 5, DOC 0)

**Stubs added:**
- `source/atomica-sdk/src/aptos/payloads.ts` `interface PinnedEthereumConfig { lockBox; fakeETH; fakeUSD }`.
- `source/atomica-sdk/src/aptos/payloads.ts` `getPinnedEthereumConfig(): Promise<PinnedEthereumConfig>` — throws.
- `source/atomica-sdk/src/aptos/payloads.ts` `assertEthereumConfigMatchesPin(): Promise<void>` — throws.
- `source/atomica-sdk/tests/ethereum/lock-guard.test.ts` — new file with four `it.todo` cases. The coverage guard maps it to `test-web.yaml / unit-tests`.

**Sites:**
- `payloads.ts:370`, `:377`, `:382` ADD. `:383` EDIT: where the guard lives.
- `ethereum/lockbox.ts:40`, `:84`, `:107`, `:127`, `:295`, `:317` EDIT.
- `ethereum/config.ts:38` EDIT: `FAKE_ETH_ADDRESS` and `FAKE_USD_ADDRESS` are read once at import.
- TEST: `aptos-view-queries.test.ts:223`, and four in `tests/ethereum/lock-guard.test.ts`.

**Issue text corrections:**
- The issue puts the reader in `aptos/payloads.ts` and the call in `ethereum/lockbox.ts`. Today `ethereum/lockbox.ts` imports nothing from `aptos/`. The `@atomica/sdk/ethereum` entry is kept light on purpose (see `ethereum/index.ts`). The call pulls `@aptos-labs/ts-sdk`, `siwe` and `transaction` into it. Put the guard in a neutral module, or inject the Aptos client.
- `ethereum/contracts.ts` builds token contracts from the import-time constants in `ethereum/config.ts`, not from `getChainConfig()`. The guard must check the same addresses the contracts use.
- Line numbers are right on `main` (`approveFakeEth` 107, `lockFakeEth` 126, `approveFakeUsd` 293, `lockFakeUsd` 316, `getLockBoxAddress` 38).

**Cross-issue pressure:**
- 195 adds the SIWE domain guard of the same shape. Both guards should share one module.

## 235 Client builds the bid identity and associated data locally

**Sites marked:** 14 (ADD 6, EDIT 4, REMOVE 0, TEST 4, DOC 0)

**Stubs added:**
- `source/atomica-sdk/src/aptos/config.ts` `getExtraAptosClients(): Aptos[]` — throws.
- `source/atomica-sdk/src/aptos/sealed-bid.ts` `getTimelockEpoch(timelockId: bigint): Promise<bigint>` — throws.
- `source/atomica-sdk/src/aptos/sealed-bid.ts` `getTimelockDeadlineUs(timelockId: bigint): Promise<bigint>` — throws.
- `source/atomica-sdk/src/aptos/sealed-bid.ts` `getMpkFromAllEndpoints(): Promise<Uint8Array>` — throws.

**Sites:**
- `aptos/config.ts:9` EDIT, `:20` ADD.
- `chain-config.ts:22`, `:43` ADD: the optional endpoint list and its env var.
- `network-host.ts:84` EDIT.
- `sealed-bid.ts:148`, `:153`, `:160` ADD. `:174` EDIT.
- `tests/sealed-bid.test.ts:51` EDIT: the fake chain needs the epoch and deadline views, a chain id and a second endpoint.
- TEST: `sealed-bid.test.ts:179`, `:182`, `:185`, `:188`.

**Issue text corrections:**
- The single `aptos` client is built from `network-host`, not from `ChainConfig`. In a browser it is always the same-origin `/aptos-api` proxy. Extra endpoints from `ChainConfig` would bypass that proxy. They need CORS on each node, or extra proxy paths. The issue does not say which.
- `sealBid` also needs the chain id for `computeTimelockIdentityV2` and `buildBidAd`. The views `timelock::get_timelock_epoch` and `timelock::get_deadline` exist on `main`.

**Cross-issue pressure:**
- 228 removes the salt that 235 stores. If 228 is near, the storage half of 235 is throwaway work.

## 236 UI completes a trade

**Sites marked:** 9 (ADD 0, EDIT 6, REMOVE 2, TEST 1, DOC 0)

**Sites:**
- `payloads.ts:686`, `:704` REMOVE: `getClaimMintPayload`, `submitClaim`.
- `payloads.ts:716` EDIT: `getFakeEthBalance` loses its reader.
- `payloads.ts:839`, `:871`, `:903` EDIT: the open step and the unused `openBid` and `finalizeReveal`.
- `ethereum/abis.ts:33` EDIT: `LOCKBOX_ABI` has no `recordOutcome` fragment.
- `ethereum/lockbox.ts:241` EDIT: no `recordOutcome` or `releaseByOutcome` binding exists.
- TEST: `aptos-payloads.test.ts:260`.

**Issue text corrections:**
- `getFakeEthBalance` is read by `ClaimButton` and also by the browser tests `11-claim-and-reclaim` and `14-happy-path`. Both are rewritten by this issue, so it can go.
- `contract-check.ts` fetches `/aptos-api/v1` and `/eth-api`. Those are the two paths the demo proxy must serve. No SDK change.

**Cross-issue pressure:**
- 236 depends on code that does not exist yet: the outcome carrier and the release bindings of 195. Both markers say so. 236 cannot start before 195 lands.
- 228 deletes `openBid` and `finalizeReveal`. Let 228 delete them.

## 237 Remove the off-chain beacon light client

**Sites marked:** 43 (ADD 0, EDIT 3, REMOVE 36, TEST 0, DOC 4)

**Sites:**
- Whole files, REMOVE on line 1: `src/beacon/{cli,fetch,index,ssz,state,sync,types}.ts`, `test/beacon/{fetch,integration,ssz,state,sync,sync_logic,types}.test.ts`, `test/benchmark.test.ts`, `scripts/sepolia-demo.ts`, `scripts/docker-demo.ts`, `.env.example`.
- Directories that go: `source/state-proofs/typescript/src/beacon/`, `source/state-proofs/typescript/test/beacon/`, and `scripts/` (empty after the two demos).
- `src/index.ts:36` REMOVE: `export * from "./beacon"`.
- `src/browser.ts:1` EDIT: the header names the beacon client.
- `src/cli.ts`: header `:2` EDIT, usage `:74` EDIT, and REMOVE at `:31`, `:318`, `:327`, `:382`, `:436`, `:465`, `:490`, `:505`, `:535`, `:575`, `:630`, `:654`, `:686`, `:721`, `:786`.
- `source/atomica-sdk/src/ethereum/config.ts:18`, `:33` REMOVE: `VITE_ETH_BEACON_URL` and `ETH_BEACON_URL` have no reader.
- DOC: `source/state-proofs/README.md:47`, `typescript/README.md:25`, `:43`, `:123`.

**Issue text corrections:**
- Missing: `source/state-proofs/typescript/.env.example`. It configures only the Sepolia demo and the beacon API.
- Missing: `ETH_BEACON_URL` in `source/atomica-sdk/src/ethereum/config.ts`. Nothing reads it. `docs/specifications/dual-testnet-integration.md:524` names the env var.
- `src/browser.ts` is built but not reachable. `package.json` `exports` has only `.` and `./ibe`. Its header shows an import from `@atomica/state-proof-verifier/browser`, which fails today. Delete it or add the export.
- No file outside state-proofs imports a beacon symbol. The only importers of the package are the SDK (`fetchProof` from the root, `ibe` subpath), `docker-testnet/aptos-testnet/src/browser-commands.ts`, and the `package.json` files of web components and demo. None needs to change.
- `generator.ts` imports the package root, so today every bundle that uses `@atomica/sdk/ethereum/proofs` pulls `src/beacon` with `fs`, `path` and `@chainsafe/bls`. The removal shrinks those bundles. The demo's `nodePolyfills` may then be partly unneeded. That is not in scope.

**Hidden costs:**
- `package.json` and `bun.lock` cannot hold markers (see Unmarkable sites). `bun install` must refresh `bun.lock`.
- `bun install` in this package runs `prepare`, which runs `../../../scripts/install-hooks.sh`.
- Running `test/beacon/sync_logic.test.ts` writes `~/.config/atomica/light-client-state.json` in the user's home. I removed the file my run made. The tests should not write to the home directory. Deleting them ends this.

**Cross-issue pressure:**
- The testnet cleanup issue (239) edits `test/integration.test.ts`, `test/mpt.test.ts` and `test/verifier.test.ts` in the same package. No line overlap. Either order works.

**CI:**
- Only `bun test tests/ibe.test.ts` runs in a gated job (Web Tests (integration)). Lint, format and the full `bun test` run only in the State Proof Verifier workflow, which is not in Required Checks. The `lint` and `format:check` globs cover `src` and `test`, not `tests` or `scripts`. `bun run build` type-checks `scripts/` through `tsconfig.check.json`.

## 238 Remove dead Move code

**Sites marked:** 11 (ADD 0, EDIT 7, REMOVE 2, TEST 2, DOC 0)

**Sites:**
- `payloads.ts:115` EDIT: `requiredModules` drops `"registry"`.
- `payloads.ts:144`, `:182` EDIT: drop `mpkBytes`.
- `payloads.ts:502` EDIT: `getSettlement` doc.
- `payloads.ts:593` EDIT: `getBidResults` matches `E_NOT_IMPLEMENTED`.
- `payloads.ts:620`, `:633` REMOVE: `Rebate` and `fetchRebates`.
- `payloads.ts:731` EDIT: `getMpk` loses its only caller.
- `tests/register-lock-payload.test.ts:233` EDIT.
- TEST: `aptos-view-queries.test.ts:220`, `register-lock-payload.test.ts:314`.

**Issue text corrections:**
- Missing: `getBidResults` (`payloads.ts:593`) matches `E_NOT_IMPLEMENTED` in the abort text. The issue lists only the two UI matches.
- `getMpk` keeps two test files (`aptos-view-queries.test.ts`, `AuctionCreator.test.tsx`) after the creator stops calling it. Keep it or remove it with its tests.
- The acceptance says `getCreateAuctionPayload` builds five arguments. That holds only while `min_price` (241) and `timelock_id` (243) remain.

**Cross-issue pressure:**
- 238, 241 and 243 each remove one argument of `create_auction`. Their payload tests count arguments. Land them in one order and write each count for that order. After all three, the payload has three arguments.
- Several Move stubs from other scouts abort with `E_NOT_IMPLEMENTED`, which 238 deletes. The stubs must be gone before 238 lands.

## 239 Remove placeholder tests and unused scaffolds

**Sites marked:** 11 (ADD 0, EDIT 1, REMOVE 10, TEST 0, DOC 0)

**Sites:**
- `test/verifier.test.ts:6`, `:103` REMOVE (named in the issue).
- `test/verifier.test.ts:56`, `:87`, `:147` REMOVE (not in the issue: asserts inside `if (result.valid && ...)`, and an empty-function check).
- `test/verifier.test.ts:119` EDIT: assert without the guard.
- `test/mpt.test.ts:8` REMOVE (named). `:141`, `:162`, `:185` REMOVE (not named: constant checks and `Buffer` is a `Buffer`).
- `test/integration.test.ts:210` REMOVE.

**Issue text corrections:**
- The empty storage slot case holds without its guard. I ran `verifyStorageProof([], "0x56e8…b421", "0x0")`: it returns `{ valid: true, value: "0x0" }`.
- Five more placeholder cases exist beyond the three the issue lists (see above).

**CI:**
- These files run only in the State Proof Verifier workflow (`test-anvil`, `test-docker`), not in a gated job.

## 241 Remove the unused seller reserve price

**Sites marked:** 4 (ADD 0, EDIT 3, REMOVE 0, TEST 1, DOC 0)

**Sites:**
- `payloads.ts:145`, `:183` EDIT: drop `minPrice`.
- `tests/register-lock-payload.test.ts:234` EDIT, `:317` TEST.

**Issue text corrections:**
- "Remove `minPrice` from the shared test utilities" means `source/test-utils`, not `source/shared`. `source/shared/test-constants.ts` has no price.

**Cross-issue pressure:**
- See 238. The price unit issue (217) also marks `minPrice`. If 241 lands first, 217 has one less site.

## 243 create_auction registers the window's timelock itself

**Sites marked:** 17 (ADD 4, EDIT 6, REMOVE 3, TEST 4, DOC 0)

**Stubs added:**
- `source/atomica-sdk/src/aptos/payloads.ts` `timelockRegistrarAddress(moduleAddress?: string): string` — throws.
- `source/atomica-sdk/src/aptos/payloads.ts` `getWindowTimelock(windowId: bigint): Promise<bigint>` — throws.
- `source/atomica-sdk/src/aptos/payloads.ts` `getWindowDeadlineUs(windowId: bigint): Promise<bigint>` — throws.
- `source/shared/test-constants.ts:33` ADD marker for a registrar address constant (no stub, it would be a constant).

**Sites:**
- `payloads.ts:146`, `:184` EDIT: drop `timelockId`.
- `payloads.ts:208`, `:245` REMOVE: `getRegisterTimelockPayload`, `registerTimelock`.
- `payloads.ts:226` EDIT: `TIMELOCK_REGISTRATION_EVENT` and `timelockIdFromEvents`.
- `payloads.ts:264`, `:269`, `:274` ADD.
- `sealed-bid.ts:50` EDIT: `getWindowTimelockId` reads `get_window_status`, which needs an existing (window, pair).
- `tests/register-lock-payload.test.ts:235`, `:289` EDIT, `:278` REMOVE.
- TEST: `aptos-view-queries.test.ts:232`, `register-lock-payload.test.ts:320`, `:323`, `:326`.

**Issue text corrections:**
- `registerTimelock` has more callers than the issue lists: `tests/integration/07-create-auction.test.tsx` and `14-happy-path.test.tsx` import it. `auction-setup.ts` imports `getRegisterTimelockPayload` and `timelockIdFromEvents`.
- `sealBid` and `decryptWindowBids` find the timelock through `getWindowTimelockId(windowId, pairBcs)`. With one timelock per window id, a new view by window id is simpler. It also lets a bidder seal before a window of its pair exists.

**Cross-issue pressure:**
- See 238 and 241 for the argument count.
- 225 must be merged and released first.

## No sites in this partition

219, 223, 226, 227, 229, 230, 231, 240, 242.

- 219: `settlement/outcome-tree.ts` is read only. The SDK has no reader for the per-lock outcome records of pull request 213. The round-trip helper lives in docker-testnet.
- 226: `getTimelockStatus` already reads `get_status` and maps reason 2 to `reveal-window-elapsed`. No change.
- 227: the product copy of the vectors changes only when 228 moves the pin (see 228).
- 240: the product copy holds `reconstruction_cases`. The issue keeps the Rust reconstruction and says the vectors regenerate to the same bytes. No product change.

## Unmarkable sites

- `source/state-proofs/typescript/package.json` (237): remove scripts `benchmark`, `demo`, `demo:sepolia`, `demo:docker`; keyword `light-client`; dependencies `@chainsafe/bls`, `@chainsafe/ssz`.
- `source/state-proofs/typescript/bun.lock` (237): refresh with `bun install` in that folder.
- `source/state-proofs/typescript/tests/fixtures/ibe_v2_golden_vectors.json` (228, from 227): copy from the fork at the new pin. Generator in the fork: `cargo test -p aptos-dkg --lib ibe::golden_vectors::write_golden_vectors -- --ignored --nocapture`.
- `source/atomica-sdk/tests/fixtures/outcome_tree_vectors.json` (222, 221): must stay byte-identical. Its generator is `buildOutcomeTree` in `src/settlement/outcome-tree.ts`, checked by `tests/outcome-tree.test.ts`.
- `source/atomica-sdk/tests/fixtures/golden_vectors.json` (232): no change. Generator `cargo run` in `source/golden-vectors`. CI diffs it in the Unit Tests job.
- `source/atomica-sdk/tests/fixtures/real-ethereum-proof.json`: no test reads it. Only `atomica-demo/scripts/deploy-lockbox-real.ts` writes it. It is a stale fixture, close to the cleanup issue (239).
- `source/atomica-sdk/package.json` (217): no change needed if the price functions go in the root index.

## Seen outside my partition

- `source/atomica-web-components/tests/unit/bidStorage.test.ts` imports `computeBidCommitment` (228, 235).
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx` and `14-happy-path.test.tsx` import `registerTimelock` (243).
- `source/atomica-web-components/tests/integration/11-claim-and-reclaim.test.tsx` and `14-happy-path.test.tsx` import `getFakeEthBalance` (236).
- `source/docker-testnet/aptos-testnet/test/lockbox-release.test.ts` imports `getRegisterLockPayload` (221, 233).
- `source/atomica-demo/vite.config.ts` uses `nodePolyfills`, which may be partly for the beacon `fs` imports (237).
- `docs/specifications/dual-testnet-integration.md:524` names `ETH_BEACON_URL` (237).

## Check results

All runs are local, not CI.

- `source/atomica-sdk`: `bun run build` exit 0. `bun run lint -- --max-warnings=0` exit 0. `bun run format:check`: "All matched files use Prettier code style!". `bun run test`: "Test Files 14 passed | 2 skipped (16)", "Tests 166 passed | 35 todo (201)". The two skipped files are the new todo-only files.
- `source/state-proofs/typescript`: `bun run build` (`tsc && tsc --project tsconfig.check.json`) exit 0. `bun run lint -- --max-warnings=0` exit 0. `bun run format:check`: "All matched files use Prettier code style!". `bun test tests/ibe.test.ts` (the gated CI step): 24 pass, 0 fail. `bun test test/verifier.test.ts test/mpt.test.ts test/beacon/ssz.test.ts test/beacon/types.test.ts test/beacon/sync_logic.test.ts`: 56 pass, 0 fail. I did not run the anvil and docker tests.
- Repo root: `bun scripts/check-test-coverage.js --verbose`: "Test coverage guard passed." Both new SDK test files map to `test-web.yaml / unit-tests`.
- Repo root: `bun scripts/check-docs.js`: "Documentation rules check passed."
- `source/golden-vectors` and `source/shared`: no checks run. Golden vectors is untouched. `shared/test-constants.ts` got one comment, and the state-proofs build type-checks it through its tests.
- No tracked `dist/` file changed. `git status` in my partition shows 54 modified files and 3 new files (`src/price.ts`, `tests/price.test.ts`, `tests/ethereum/lock-guard.test.ts`).

## Suggested order

1. The window formula (220), then the computed deadline (221) and the leaf rule (222) in one LockBox redeploy and one ABI update.
2. The cleanups that remove code others mark: 237 and 239 (state-proofs, independent), then 238, 241 and 243 in a fixed order, with each argument count written for that order.
3. The derived address fix (232), the FakeUSD registration (233) and the pin guard (234). They are small and independent. 234 should share a guard module with the SIWE domain check of 195.
4. The bid validity issue (216), then the bidder identity issue (235).
5. The price unit (217), after 238 and 241 remove the dead price sites, and before 195 removes `quoteForFill`'s current home.
6. The trade completion issue (236) after 195.
7. The commit and reveal removal (228) last. It rewrites `sealBid`, `BidInfo` and the open path that 216, 235 and 236 touch, and it needs the fork native (227) and a pin bump.
