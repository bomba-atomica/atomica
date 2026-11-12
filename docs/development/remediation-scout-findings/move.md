# MOVE scout report

Partition: `source/atomica-move-contracts/**` in the worktree `scout-remediation-seams` (base `main` at `4ca0acd`).

How to read this report:

- The first wave left markers and stubs. I reviewed every one against the brief and kept most of them. The section "Second wave changes" lists my edits.
- Line numbers are for the worktree as it is now, with markers in place.
- "After 213" means the head of the open unwind pull request (213), commit `b3b7dbc`. I read the Move files of that commit with `gh api`. I did not check them out. Its Move files have not changed since the first wave read them.
- 213 opens with a three-way merge of the stubbed files onto its versions. All eight files that both touch merge with no conflict. The merged package compiles with no warning, and all 222 tests pass (see "Check results"). Every marker stays above the same symbol after the merge.

Second wave changes:

- `BidInvalid` now has a `pair_bcs` field. A window id alone does not name a window, and 213's `AuctionRefunded` also carries the pair bytes.
- I reworded three markers of the bid validity issue (216): `SealedBid`, `submit_bid` and `settle`. They now say what 213 already does (see 216 below).
- I deleted the ignored `build/` folder that compiling leaves behind. Its copies of every marker made `grep -rn "SCOUT(#N)"` report each site twice. Each compile or test run makes it again.

## 216 Invalid bids: collateral covers price times quantity, bounded quantity and price

**Sites marked:** 23 (ADD 3, EDIT 12, TEST 8)

**Stubs added:**
- `sources/auction.move` `const E_ZERO_QUANTITY: u64 = 37`: abort code for a zero quantity
- `sources/auction.move` `const E_QUANTITY_ABOVE_SUPPLY: u64 = 38`: abort code for a quantity above supply
- `sources/auction.move` `#[event] struct BidInvalid { window_id: u64, pair_bcs: vector<u8>, bid_index: u64, bidder: address, reason: u8 }`: reason 1 means zero price, reason 2 means collateral below the quote

**Sites:**
- `sources/auction.move:228` EDIT: `SealedBid` needs a validity flag. The collateral amount is already in the receipt table.
- `sources/auction.move:699` EDIT: `submit_bid` gets the quantity bounds and stores the collateral.
- `sources/auction.move:779` EDIT: `open_one` judges validity and does not abort.
- `sources/auction.move:1030`, `:1089`, `:1100` EDIT: `clear_internal` skips invalid bids. The overflow is the `accumulated + qty` line.
- `sources/auction.move:1201` EDIT: `settle`. This needs no change after 213 (see "Hidden costs").
- `sources/auction.move:1338` EDIT: the `get_bid_info` tuple gains the flag.
- `sources/auction.move:1588` EDIT: `test_insert_committed_bid` builds the struct.
- `sources/auction.move:1620` EDIT: `test_set_revealed_prices` needs a choice: does it apply the rule?
- `sources/auction_bid_wrapper_tests.move:108` EDIT: `submit_golden` hardcodes quantity 5.
- `sources/auction_bid_wrapper_tests.move:184` EDIT: this test reads the `get_bid_info` tuple by position.
- `sources/auction_bid_wrapper_tests.move:519-520` TEST: the two wrapper tests named in the issue.
- `sources/auction_tests.move:426-427`, `:657-660` TEST: the six named `auction_tests` tests.

**Issue text corrections:**
- Two touchpoints exist only after 213: `settle_locks` and `E_UNPAYABLE_FILL`.
- `quote_for_fill` also exists only after 213. This issue cannot start before 213 merges, unless it adds `quote_for_fill` itself.
- On `main`, `integration_tests.move` runs no test. After 213, its one test (`test_e2e_lock_auction_unwind_returns_every_lock`) inserts bids through `test_insert_bid_with_qty`. That helper must fill in the new field.
- The two `submit_bid` tests the plan puts in `auction_tests.move` cannot live there. `auction_tests.move` has no `submit_bid` test because the golden bid setup is private to `auction_bid_wrapper_tests.move`. Put them in the wrapper file, or make `submit_golden` public.

**Hidden costs:**
- The `SealedBid` layout change is avoidable.
  - The collateral amount is already stored in the receipt. 213's `settle_locks` reads it with `lock_receipt::get_receipt`.
  - Price zero is invalid under this rule, so "opened with price 0" could mark an invalid bid with no new field.
  - If a field is added anyway, it forces a fresh publish of every testnet.
- After 213, `submit_bid` step 6 drops the `u256` that `claim_for_window` returns. Capture it there.
- After 213, `settle_locks` already sends a non-winner's whole collateral home. So the only behaviour changes are in `clear_internal` and opening. The `settle` part of the scope is free.
- 13 clearing and settle tests open bids through `test_set_revealed_prices`. After 213 that helper calls `test_set_openings` (213 line 1660). Decide whether the helpers judge validity. If they do, several fixtures need collateral that covers their bids.

**Cross-issue pressure:**
- `open_one` is also removed by the on-chain decrypt issue (228). If 216 lands first, 228 moves the validity rule into `open_bids`. If 228 lands first, 216 writes the rule there directly. 228 is blocked on the fork, so 216 should go first.
- `SealedBid` is also edited by 228, which removes `commitment`. `get_bid_info` is also edited by 228, which removes `commitment` from the tuple. That is two positional breaks of the SDK `getBidInfo` reader. Land them close together, or change the view to return a struct.
- `clear_internal` is also edited by the dead code issue (238), which swaps `revealed_prices` for `bids[i].price`. The same loop lines change. Land 238 first, or 216's skip goes on lines that 238 rewrites.
- `submit_bid` is also edited by the caps issue (218, minimum collateral) and by 228 (no commitment). Put the three checks in one block.
- New abort codes start at 37, because 213 takes 32 to 36. 218 and 224 use 39 to 43. Keep that order, or renumber in one place.

**CI:**
- Move Unit Tests (`aptos move test --package-dir source/atomica-move-contracts`) runs these tests. That step has no minimum test count (the INFRA scout marked it).

**Questions answered or sharpened by the code:**
- Decision 34 (undersubscribed window) stays open.
- New question: should the view and the event report the reason for an invalid bid? The `BidInvalid` stub has a `reason`. The issue asks only for a flag in the view.

## 217 One price unit across Move, SDK and UI

**Sites marked:** 7 (DOC 6, TEST 1)

**Sites:**
- `sources/auction.move:1` DOC: the module header.
- `sources/auction.move:229` DOC: `SealedBid.price`.
- `sources/auction.move:249` DOC: `BidResult.clearing_price`. The issue text does not list it.
- `sources/auction.move:264` DOC: `WindowState.clearing_price`.
- `sources/auction.move:309` DOC: `AuctionSettled.clearing_price`.
- `sources/auction.move:325` DOC: `BidOpened.price`. Issue 228 removes this event.
- `sources/auction_tests.move:661` TEST: `quote_for_fill(10^18, 2000) == 2000 * 10^6`.

**Issue text corrections:**
- `quote_for_fill` exists only after 213, at line 364 there. Its doc already says "USD per whole FakeETH". So the Move part of this issue is comments plus one test.
- `BidResult.clearing_price` also carries a price. The issue omits it.

**Hidden costs:**
- 213 changed the browser test sizes to 0.0001 FakeETH at price 2 000 000 to fit 500 FakeUSD of collateral. With the real price 2000, those sizes become wrong. They are also below the minimum seller lock of the caps issue (218): 0.0001 FakeETH is 1e14 wei, and 218's minimum is 1e16. That file belongs to the UI scout. I name it here because the Move numbers drive it.

**Cross-issue pressure:**
- Land before or with 216. Otherwise good bids at the old unit fail 216's collateral rule.

**CI:**
- Move Unit Tests.

## 218 Caps and minimum lock sizes per window

**Sites marked:** 20 (ADD 7, DOC 1, EDIT 4, TEST 8)

**Stubs added:**
- `sources/auction.move` `E_SELLER_LOCKS_FULL = 39`, `E_SELLER_LOCK_TOO_SMALL = 40` and `E_COLLATERAL_TOO_SMALL = 41`
- `sources/auction.move` `MAX_SELLER_LOCKS_PER_WINDOW: u64 = 100`, `MIN_SELLER_LOCK_AMOUNT: u256 = 1e16` and `MIN_BID_COLLATERAL: u256 = 1e7`: the proposed values, pending the owner
- `sources/auction.move:1448` `#[view] public fun get_window_limits(): (u64, u64, u256, u256)`: in the order max bids, max seller locks, min seller lock, min collateral. This matches the SDK `WindowLimits` stub.

**Sites:**
- `sources/auction.move:541` EDIT: `create_auction`.
- `sources/auction.move:615` EDIT: the cap check before the push.
- `sources/auction.move:700` EDIT: `submit_bid`.
- `sources/auction_bid_wrapper_tests.move:36` EDIT: `SUPPLY` is 5 wei, and the FakeUSD receipts are 1000 units. 56 of the 63 tests in that file reach `submit_bid` or `create_auction`.
- `sources/auction_tests.move:203`, `:391-393`, `:428-429` TEST: the named tests.
- `sources/integration_tests.move:6-7` TEST: the two cap tests. `unwind` exists only after 213.
- `README.md:40` DOC: the new view.

**Issue text corrections:**
- `integration_tests.move` holds no running test on `main`. The two cap tests need 213's `unwind` and its test pattern (213's `test_e2e_lock_auction_unwind_returns_every_lock`).

**Hidden costs:**
- Almost every fixture amount is below the proposed minimums:
  - the wrapper tests use 5 wei of supply and 1000-unit collateral
  - the `auction_tests` seller locks vary
  - 213's browser tests lock 0.0001 FakeETH
  - 213's `16-settle-100-bids` locks 0.001 FakeETH in total
- After 213, settle cost is `settle_locks`, which loops over winners times seller locks. Each lock calls `record_outcome`, and `emit_outcome` sorts and hashes every lock. At 100 sellers and 100 bids the loop runs 10 000 inner steps, plus 200 outcome records.
- Only the live test can measure gas. I checked that `aptos move test -i` (instruction bound) is not enforced by this CLI: a test passed with `-i 100`. So Move tests cannot assert a gas bound.

**Cross-issue pressure:**
- `create_auction` is also edited by:
  - the pair allowlist issue (224)
  - the dead code issue (238), which removes `_mpk_bytes`
  - the reserve price issue (241), which removes `min_price`
  - the timelock registrar issue (243), which removes `timelock_id`
- `submit_bid` is also edited by 216 and 228.
- These checks are a few independent lines, so 218 can land anytime. Land it after 238 and 241 so its tests use the shorter signature.

**CI:**
- Move Unit Tests runs the Move tests.
- Only the settle-100-bids browser job measures gas, and the issue already names it.

**Questions answered or sharpened by the code:**
- The values are still open. Pick them after 217 fixes the price unit, because 10 FakeUSD covers different sizes under each unit.

## 220 Window ids follow the 07:45 and 16:15 UTC closes

**Sites marked:** 14 (ADD 1, EDIT 7, REMOVE 1, TEST 5)

**Stubs added:**
- `sources/eth_proof.move:77` constants `WINDOW_DAY_SECS = 86400`, `WINDOW_MORNING_CLOSE_SECS = 27900` and `WINDOW_AFTERNOON_CLOSE_SECS = 58500`. They are unused and compile with no warning.

**Sites:**
- `sources/eth_proof.move:72` REMOVE: the old two constants.
- `sources/eth_proof.move:241` EDIT: `window_close_secs`.
- `sources/auction.move:444` EDIT: `current_window_id` and its doc.
- `sources/auction_tests.move:56` EDIT: two of the five `test_window_id_*` tests fail under the new formula.
- `sources/auction_tests.move:333` EDIT: a stale comment.
- `sources/auction_tests.move:108-111` TEST: the boundary tests.
- `sources/eth_lock_registration_tests.move:27` EDIT: the fixture.
- `sources/eth_lock_registration_tests.move:119-120` EDIT and TEST: the close asserts.
- `sources/auction_bid_wrapper_tests.move:30` EDIT: `BID_TIME_US`.

**Issue text corrections:**
- The issue misses `auction_bid_wrapper_tests.move`. Its `BID_TIME_US` of 120 000 s is window 3 under the new formula, not window 5. The golden ciphertext's associated data is bound to auction id 5, so `AUCTION_ID` cannot change. Move the clock into [200 700, 231 300) s.
- Move constants are private to their module. `auction::current_window_id` cannot reuse `eth_proof`'s numbers. Make `eth_proof` own one `public fun window_id_at(secs)`, so `auction` keeps no copy of the formula.

**Hidden costs:**
- The anvil fixture must be regenerated: `WINDOW_ID`, `DEADLINE`, `COMMITMENT`, two state roots and four proofs. No script in the repo makes it.
- Regenerate it once, here, with a deadline from the new formula. That fixture then still works after the computed deadline issue (221), because LockBox's computed deadline equals it.

**Cross-issue pressure:**
- Land before 221, which freezes the formula in LockBox, and before 243, which reads `window_close_secs` as the timelock deadline.
- 213 does not touch `current_window_id`.

**CI:**
- Move Unit Tests.

## 221 LockBox computes the lock deadline from the window id

**Sites marked:** 12 (DOC 2, EDIT 8, REMOVE 1, TEST 1)

**Sites:**
- `sources/lock_receipt.move:43` REMOVE: `E_WRONG_DEADLINE`.
- `sources/lock_receipt.move:187` EDIT: `register_ethereum_lock`.
- `sources/eth_proof.move:84` EDIT: `ETH_RECLAIM_DELAY_SECS` gets frozen.
- `sources/eth_proof.move:231` EDIT: `eth_proof::auction_key`.
- `sources/eth_proof.move:269` EDIT: `verify_lock`.
- `sources/auction.move:388` DOC: the `AuctionOutcome` comment.
- `sources/auction.move:422` EDIT: the body of `auction::auction_key`.
- `sources/eth_lock_registration_tests.move:98`, `:146`, `:182` EDIT: the register calls, the key assert, and the wrong-deadline test.
- `sources/eth_lock_registration_tests.move:121` TEST: the shared table test.
- `README.md:13` DOC: the register row.

**Issue text corrections:**
- `auction::auction_key(window_id, pair_hash)` already takes two arguments. Only its body and `eth_proof::auction_key` change.
- The wrong-deadline test cannot keep its meaning with a regenerated fixture. The new LockBox cannot make a commitment with another deadline. Keep today's fixture for that one negative test.

**Hidden costs:**
- After 213, `create_auction` checks `stuck deadline + carrier margin < eth_lock_deadline(window_id)` (213 step 1c, `E_STUCK_AFTER_LOCK_DEADLINE`).
- 213's `timelock_config` test `test_grace_and_margin_fit_the_lock_delay` hardcodes 259 200 s. So decision 36 (the reclaim delay) is bounded from below by 10 minutes of reveal, plus 10 minutes of opening (until 228), plus the unwind grace (24 h), plus the carrier margin (24 h). That is just over 48 h. A shorter delay needs smaller 213 constants too.

**Cross-issue pressure:**
- Land after 220. The `lock_receipt` code numbers 12 to 15 belong to 213. Deleting code 11 must not renumber them.

**CI:**
- Move Unit Tests.

## 222 LockBox pays every leaf: remainder to depositor

**Sites marked:** 1 (DOC 1)

**Sites:**
- `sources/outcome_tree.move:1` DOC: the module header sentence about the leaf meaning.

**Issue text corrections:**
- After 213, the doc of `lock_receipt::record_outcome`, `finalize` and `E_UNPAYABLE_OUTCOME` (213 lines 57, 400, 448) says two things this issue makes false: LockBox needs an exact sum, and reclaim refuses a lock in the tree. Those docs need the same fix.
- The Move check can stay stricter (exact sum), as the issue's scope says. Only the text changes.

**Cross-issue pressure:**
- None in Move beyond 213's doc.

## 224 Pair allowlist for auction windows

**Sites marked:** 19 (ADD 6, DOC 2, EDIT 6, TEST 5)

**Stubs added:**
- `sources/auction.move` `E_PAIR_NOT_ALLOWED = 42` and `E_NOT_PACKAGE_ACCOUNT = 43`
- `sources/auction.move:202` `struct PairAllowlist has key { pairs: Table<vector<u8>, Pair> }`
- `sources/auction.move:622` `public entry fun allow_pair(_atomica: &signer, _base_chain, _base_token, _quote_chain, _quote_token: vector<u8>)`
- `sources/auction.move:1454` `#[view] public fun is_pair_allowed(_pair_bcs: vector<u8>): bool`
- `sources/auction.move:1460` `#[view] public fun launch_pair_bcs(): vector<u8>`

The SDK stubs `isPairAllowed` and `getLaunchPairBcs` match these.

**Sites:**
- `sources/auction.move:485` EDIT: `init_module`.
- `sources/auction.move:542` EDIT: `create_auction`.
- `sources/auction.move:587` EDIT: the hardcoded `Pair`.
- `sources/auction.move:1682` EDIT: `test_insert_window_with_timelock`.
- `sources/auction_tests.move:30` EDIT: `default_pair_bcs`.
- `sources/auction_bid_wrapper_tests.move:37` EDIT: `pair()`.
- `sources/auction_tests.move:394-398` TEST: the named tests.
- `README.md:14`, `:41` DOC: the new entry and views.

**Issue text corrections:**
- The hardcoded launch `Pair` has `quote_chain: b"aptos"`, but bidders lock FakeUSD on Ethereum. The SDK scout's `LAUNCH_PAIR_BCS` copies that "aptos" byte string. Decide the quote chain before the bytes freeze into lock pair hashes.
- No test pair in the Move tests is the BCS of a `Pair`:
  - `auction_tests` uses `default_pair_bcs`
  - the wrapper tests use `b"eth-fakeusd"`
  - 213's integration test uses `b"e2e-unwind-pair"`

**Hidden costs:**
- After 213 there are 12 `create_auction` calls in `auction_tests.move` (three new at 213 lines 1571-1597), plus one in the integration test. All need listed pair bytes.
- `insert_bound_test_receipt` binds locks to `pair_hash(pair)`, so the test pair bytes feed the lock binding too.

**Cross-issue pressure:**
- `create_auction` and `init_module` are also edited by 243, which adds a registrar object in `init_module`. Land 224 before 243, as the issue says, and after 238 and 241.

**CI:**
- Move Unit Tests.

## 225 Only the auction package registers a timelock (fork)

**Sites marked:** 2 (EDIT 2)

**Sites:**
- `sources/auction_bid_wrapper_tests.move:66` EDIT: `setup` calls `ibe_config::register_timelock` as the framework signer.
- `sources/auction_bid_wrapper_tests.move:301` EDIT: the second direct registration.

**Hidden costs:**
- This is a fork issue, but the product Move tests break at the first `Move.toml` pin bump past it, whichever product issue makes that bump. 228 bumps the pin for its own reason.
- After 213 there is a third caller: `register_live_timelock` (213 wrapper test line 97). The integration test uses it.

**Cross-issue pressure:**
- Whoever bumps the pin first owns this test repair: 228 or 243.

## 226 Timelock status reads expired at the reveal expiry (fork)

**Sites marked:** 2 (DOC 1, EDIT 1)

**Sites:**
- `sources/timelock.move:1` DOC: the facade's status doc.
- `sources/auction_bid_wrapper_tests.move:146` EDIT: `expire_reveal_window` no longer needs `on_new_block_for_testing` after the pin bump. Its tests still pass either way.

**Issue text corrections:**
- "No product change" holds. `refund_expired_window` reads `get_status`.

## 228 Auction opens bids from ciphertexts, removing commit and reveal

**Sites marked:** 44 (ADD 1, DOC 3, EDIT 13, REMOVE 22, TEST 5)

**Stubs added:**
- `sources/auction.move:927` `public entry fun open_bids(_caller: &signer, _window_id: u64, _pair_bcs: vector<u8>, _max_bids: u64)`. It matches the SDK `getOpenBidsPayload` stub. It cannot call `ibe::decrypt_bid`, because the pinned framework lacks it.

**Sites:**
- REMOVE, all in `sources/auction.move`:
  - abort codes at `:68`, `:73`, `:118`, `:121`, `:131`, `:140`
  - `BID_COMMIT_TAG` at `:159` and `OPENING_WINDOW_US` at `:178`
  - `SealedBid.commitment` at `:230`
  - `BidOpened` at `:326` and `RevealFinalized` at `:336`
  - `compute_bid_commitment` at `:661`
  - `open_one` at `:780` and `count_opened` at `:796`
  - `open_bid` at `:835`, `submit_cleartext_and_clear` at `:869` and `finalize_reveal` at `:907`
  - the test helper argument at `:1589`
- EDIT, in `sources/auction.move`:
  - `E_REVEAL_FINAL` at `:126` is kept and reworded
  - the opening cursor on `WindowState` at `:265`
  - the `BidInvalid` reason at `:399`
  - `submit_bid` at `:701` and `assert_openings_allowed` at `:768`
  - `finalize_internal` at `:814` and `settle` at `:1202`
  - `get_bid_info` at `:1339` and `get_window_status` at `:1394`
- EDIT elsewhere:
  - `Move.toml:6` (the pin) and `timelock_config.move:1`
  - the wrapper test helpers at `:109` and `:185`
- REMOVE in the wrapper tests: `:60` (`commitment_for`), `:170` (the known-answer test) and `:400` (the 23 opening tests).
- TEST: `auction_bid_wrapper_tests.move:401-405`.
- REMOVE in `auction_tests.move:1110`: the comment-only sections.
- DOC: the module header (`:2`) and `README.md:15`, `:42`.

**Issue text corrections:**
- The issue names no way for a client to read the opening cursor. Batched `open_bids` needs one, either in `get_window_status` or in a new view.
- `timelock.move` needs no change. It has `get_decryption_key` and `get_timelock_identity`.
- The issue says "`timelock_config.move` (stuck deadline values from 194)". On `main` this file names no opening window. After 213, the term is in `auction::stuck_deadline_us` (213 line 371), the "Deadlines" section of the module header, and `timelock_config`'s table row and budget test.

**Hidden costs:**
- 23 of the 63 wrapper tests are deleted.
- The golden bid fixtures move to the fork's new price-plaintext cases. Today's golden ciphertext holds `price_le8 || salt32`, not 8 bytes.
- The pin bump also pulls in every fork change merged before it: 223, 225, 226, 230, 231, 240. 225 breaks `setup`. 240 removes `reconstruct_ibe_dk`, which no product Move code calls (checked).

**Cross-issue pressure:**
- Of all 28 issues, this one rewrites the most of `auction.move`. Every issue that edits `open_one`, `SealedBid`, `get_bid_info` or the test helpers either lands first, and 228 carries its change forward, or rebases onto 228.
- Land it after 216, 238 and 241, and after 213. Its stuck deadline change edits 213's code.

**CI:**
- Move Unit Tests and Move Framework Pin.
- The Move Unit Tests step fails until `Move.toml` and `APTOS_VERSION` both move.

## 231 Epoch alignment (fork)

**Sites marked:** 1 (EDIT 1)

**Sites:**
- `sources/auction_bid_wrapper_tests.move:67` EDIT: `setup`'s epoch config and golden deadline must still pass the 15 minute guard after the pin bump.

## 238 Remove dead Move code

**Sites marked:** 42 (DOC 2, EDIT 12, REMOVE 24, TEST 4)

**Sites:**
- REMOVE, in `sources/auction.move`:
  - the codes `E_AUCTION_ENDED` (`:56`), `E_BID_TOO_LOW` (`:59`) and `E_ALREADY_SETTLED` (`:61`), plus `E_NOT_IMPLEMENTED` (`:80`)
  - `REBATE_COEFFICIENT` (`:184`) and `Rebate` (`:215`)
  - `revealed_prices` (`:266`, `:605`)
  - `_mpk_bytes` (`:543`) and the registry bootstrap (`:574`)
  - `found_marginal` (`:1082`) and the rebate read in `settle` (`:1203`)
  - `compute_rebates` (`:1497`)
  - the test helpers at `:1683`, `:1729` and `:1737`
- REMOVE elsewhere:
  - `lock_receipt.move:25`, `:106`, `:146` and `:269`
  - `registry.move:1` (the whole file)
  - `integration_tests.move:8` and `auction_tests.move:663`, `:898`
- EDIT:
  - `auction.move` `finalize_internal` (`:815`), `clear_internal` (`:1031`, `:1059`, `:1097`), `get_settlement` (`:1538`) and `test_set_revealed_prices` (`:1621`)
  - `lock_receipt.move:369` (`is_lock_claimed`)
  - `auction_tests.move:189`, `:205`, `:764`
  - `auction_bid_wrapper_tests.move:419`, `:920`
- TEST: `auction_tests.move:201-202`, `:399` and `lock_receipt_tests.move:118`.
- DOC: `README.md:16`, `:43`.

**Issue text corrections:**
- `E_ALREADY_SETTLED` (5) is also never raised. The issue lists only three codes.
- `E_NOT_IMPLEMENTED` cannot go while any SCOUT ADD stub in `auction.move` still aborts with it. Remove it last, or give the stubs their own constant.
- `get_settlement` has a second bug the issue does not name. It returns the cleared price of a window that is not settled yet, not `(0, 0)`.
- `WindowState` stores no filled total. Sum `bid_results[i].fill_amount` in the view. Do not add a field: that would be a layout change. 213 computes `total_filled` in `settle` but only emits it.
- `integration_tests.move`: the commented-out tests call a `register_ethereum_lock` signature that no longer exists. On `main` the file runs no test. After 213 it holds one real test, so delete only the commented block.

**Hidden costs:**
- `ReceiptRegistry` loses `claimed_locks`. 213 adds an `outcomes` field to the same struct. Both are layout changes and need a fresh publish of the package. Do them in one publish if possible.
- After 213, `settle` moved its `REBATE_COEFFICIENT` read into a new comment block (213 line ~1255), and `test_set_openings` writes `revealed_prices`.
- Three tests reach the lazy registry bootstrap and need `init_for_test` first.

**Cross-issue pressure:**
- `create_auction` is also edited by 241 and 243, and the SDK create payload changes with each one.
- The acceptance criteria disagree on the final argument count:
  - 238 says five arguments without `mpk`
  - 243 says five arguments: window, pair, lock, minimum price, mpk
  - after 238, 241 and 243 all land, the real count is three: window id, pair, lock id
- Land 238 and 241 together or back to back, then fix 243's acceptance criterion.
- `clear_internal` is also edited by 216: land 238 first.

**CI:**
- Move Unit Tests and Move Lint Warnings.

## 240 Remove the retired timelock prototype (fork)

**Sites marked:** 1 (DOC 1)

**Sites:**
- `sources/auction_tests.move:1111` DOC: a comment names `reconstruct_ibe_dk_internal`.
- No product Move code calls `ibe::reconstruct_ibe_dk` (grep checked).

## 241 Remove the unused seller reserve price

**Sites marked:** 8 (EDIT 2, REMOVE 5, TEST 1)

**Sites:**
- REMOVE in `sources/auction.move`: `WindowState.min_prices` (`:267`), the argument (`:544`), the window init (`:603`), the joining push (`:617`) and the test helper (`:1684`).
- EDIT: `auction_tests.move:206` (nine calls) and `auction_bid_wrapper_tests.move:921` (two calls).
- TEST: `auction_tests.move:400`.

**Issue text corrections:**
- After 213 there are two more sites: `test_add_seller_lock(.., min_price)` (213 line 1775), and the price argument `1000` in the integration test.
- After 213, `auction_tests.move` has 12 `create_auction` calls, not 9.

**Cross-issue pressure:**
- Pair it with 238. Both shorten `create_auction`, and both are fresh publishes.

## 242 Canonical docs match the code

**Sites marked:** 2 (DOC 2)

**Sites:**
- `README.md:17` DOC: the `settle` row says "single highest bid". 213 rewrites that row.
- `sources/timelock_config.move:2` DOC: the 67 percent threshold in the header has no caller and disagrees with the fork.

**Issue text corrections:**
- The issue scopes five docs only. The two Move-side texts above repeat the same drift.

## 243 create_auction registers the window's timelock itself

**Sites marked:** 27 (ADD 5, DOC 2, EDIT 10, REMOVE 2, TEST 8)

**Stubs added:**
- `sources/auction.move` `const TIMELOCK_REGISTRAR_SEED: vector<u8> = b"atomica/timelock-registrar"`
- `sources/auction.move:208` `struct TimelockRegistrar has key { extend_ref: object::ExtendRef, window_timelocks: Table<u64, u64> }`
- `sources/auction.move:1466` `#[view] timelock_registrar_address(): address`
- `sources/auction.move:1472` `#[view] window_timelock(_window_id: u64): u64`
- `sources/auction.move:1478` `#[view] window_deadline_us(_window_id: u64): u64`

The SDK and testnet stubs `timelockRegistrarAddress`, `getWindowTimelock` and `getWindowDeadlineUs` match these. The seed must be the same in all three places.

**Sites:**
- REMOVE: `E_TIMELOCK_NOT_REGISTERED` (`auction.move:145`) and `review_create_auction_unregistered_timelock_aborts` (`auction_bid_wrapper_tests.move:980`).
- EDIT in `sources/auction.move`: `assert_timelock_open` (`:467`), `init_module` (`:486`), `create_auction` (`:545`) and `test_insert_window_with_timelock` (`:1685`).
- EDIT elsewhere: `Move.toml:7`, `auction_tests.move:207`, and the wrapper tests at `:68`, `:777`, `:922` and `:1060`.
- TEST: `auction_tests.move:401-408`.
- DOC: `README.md:18`, `:44`.

**Issue text corrections:**
- The acceptance criterion for the SDK payload says five arguments, including minimum price and mpk. After 238 and 241 the count is three.
- `E_TIMELOCK_NOT_REGISTERED` becomes unreachable. The issue does not list it.
- `create_auction_rejects_a_missing_registry` changes its expected abort.

**Hidden costs:**
- After 213, `create_auction` step 1c computes `stuck_deadline_us(timelock_id)` from the caller's timelock. 243 must register first, then check.
- 213's header (step 1) and its integration test pass a `timelock_id`. `register_live_timelock` is another registration site.
- The deadline becomes the window close, which may be up to 15.5 hours away. Every live test needs open question 1 (the test cap) answered.

**Cross-issue pressure:**
- Last of the `create_auction` group: after 238, 241, 224 and 220. It needs the fork registrar (225) and a pin bump. It shares that bump with 228, so whichever lands second rides the first one's pin.

**CI:**
- Move Unit Tests and Move Framework Pin.

## No sites in this partition

219, 223, 227, 229, 230, 232, 233, 234, 235, 236, 237, 239.

Read-only touchpoints, checked:

- The FakeUSD receipt issue (233): `register_ethereum_lock<FakeUSD>` works today.
- The LockBox pin issue (234): `eth_proof::get_config` returns `(lockbox, fake_eth, fake_usd)` and aborts `E_CONFIG_NOT_SET` when unset. The SDK must treat that abort as an unreadable pin.
- The bid identity issue (235): `timelock::get_mpk`, `get_timelock_epoch`, `get_deadline`, `get_timelock_identity` and `auction::bid_associated_data` all exist.
- The round-trip test issue (219): it reads 213's per-lock outcome records only.

## Unmarkable sites

- None in this partition. Every file can hold a comment.
- Several sites exist only in 213, so they cannot be marked on `main`. They are listed above under 216, 218, 221, 222, 225, 228, 238, 241 and 243. Mark them when 213 merges.

## Seen outside my partition

- `.github/workflows/test-web.yaml`, job Move Unit Tests: `aptos move test` here has no instruction bound in effect (`-i` is ignored). Cap and 2000-receipt tests cannot fail on cost. Only live tests measure gas.
- 213's browser tests (`10-settle`, `11-claim-and-reclaim`, `12-fee-rebate`, `14-happy-path`, `16-settle-100-bids`) shrank lock sizes to 0.0001 FakeETH or less. That is below 218's proposed 0.01 FakeETH minimum. The UI scout should carry this into 218.

## Check results

Run from the worktree root, with `APTOS=~/tmp/atomica-scout-2026-11-11/bin/aptos`. These are local runs, not CI.

- `$APTOS move compile --package-dir source/atomica-move-contracts --fail-on-warning --named-addresses atomica=0xcafe`: Success, 0 warnings.
- `$APTOS move test --package-dir source/atomica-move-contracts`: `Test result: OK. Total tests: 194; passed: 194; failed: 0`. This matches the baseline on `main` (194).
- Merge check against 213: `git merge-file` of the stubbed file, `main` and 213 head `b3b7dbc`, for `auction.move`, `auction_bid_wrapper_tests.move`, `auction_tests.move`, `integration_tests.move`, `lock_receipt.move`, `lock_receipt_tests.move`, `timelock_config.move` and `README.md`. Result: 0 conflicts in every file.
  - The merged package compiles with `--fail-on-warning`.
  - The merged package's tests: `Test result: OK. Total tests: 222; passed: 222; failed: 0`.
  - The merged copies are in `scratch-move/merge2/`.
- `git status --short -- source/atomica-move-contracts`: only the 14 tracked files listed by the first wave are modified. There are no untracked files. The ignored `build/` folder was deleted.

## Suggested order

1. **213** (the Aptos unwind). It defines `quote_for_fill`, `settle_locks`, `unwind` and the outcome records that 216, 218 and 221 build on.
2. **220** (the window formula). It regenerates the anvil fixture once.
3. **238 and 241** (dead code and reserve price), back to back in one publish. They shrink `create_auction`, `WindowState`, `clear_internal` and the test helpers that everyone else edits.
4. **217** (comments and one test), then **216** (validity at opening, the `clear_internal` skip).
5. **218** (caps) and **224** (allowlist). Both are small `create_auction` and `submit_bid` checks.
6. **221** (deadline out of the key). It comes after 220, with the owner's reclaim delay, which 213's budget bounds below at about 48 hours.
7. **228** (on-chain decrypt) and **243** (registrar). Both wait for fork pin bumps (227, and 225 with 231). They rewrite the most code, so they go last and carry 216's validity rule into `open_bids`.

In one sentence: every Move stub compiles and passes all 194 tests on `main` and all 222 tests merged with 213, and the biggest lessons are that the create-call argument counts conflict across 238, 241 and 243, that 216 depends on 213's `quote_for_fill`, and that 238 cannot remove `E_NOT_IMPLEMENTED` while the stubs abort with it.
