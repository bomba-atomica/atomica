# DOCS scout report

Partition: `docs/**` except `docs/code-reviews/**`, in the product worktree `scout-remediation-seams`.

Every site is an HTML comment marker line `<!-- SCOUT(#N) DOC: ... -->` on its own line, with a blank line after its block. Markers sit above the passage, table or code fence they describe, never inside a list, table or fence. A marker for a whole superseded file is its first line. Rendered text does not change (see Check results).

Out of scope by choice: `docs/archived`, `docs/analysis` and `docs/game-theory` (the canonical docs issue (242) excludes them), and old plans under `docs/technical` and `docs/development` that no issue names and no canonical doc links. They are history, not specs.

Total markers: 181 in 21 files.

## 216 Invalid bids: collateral covers price times quantity

**Sites marked:** 11 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 11)

**Sites:**
- `docs/architecture/v0-architecture.md:161` DOC — the bid stores its collateral amount and a validity flag; submit_bid aborts on zero quantity and on quantity above supply.
- `docs/architecture/v0-architecture.md:184` DOC — an opened bid with price zero or a quote above its collateral is marked invalid without aborting.
- `docs/architecture/v0-architecture.md:215` DOC — steps 1 to 3: invalid bids are skipped like unopened ones and the fit test is qty <= supply - accumulated; the undersubscribed rule (review decision 34) stays as written: the lowest bid sets the price.
- `docs/architecture/v0-architecture.md:250` DOC — state the rule as enforced: collateral stored on the bid, invalid at opening when quote_for_fill(quantity, price) exceeds it, collateral returned to the depositor; the E_UNPAYABLE_FILL sentence that open pull request 213 adds to section 2.9 then no longer applies to an under-collateralised bid.
- `docs/architecture/v0-architecture.md:389` DOC — invalid bids join the list of locks that go back to their depositors.
- `docs/decisions/bid-validity-simplification.md:13` DOC — this accepted record slashes a griefing deposit for invalid bids; the bid validity issue returns the whole collateral and leaves any penalty out of scope: the owner must say which wins (closest open item: review decision 35, the cost of an unopened bid).
- `docs/decisions/bid-validity-simplification.md:175` DOC — rules as built differ: no deposit and no 3-sigma price or units filter; a bid is invalid when its price is zero or its quote exceeds its collateral, and zero or over-supply quantity aborts at submission.
- `docs/roadmap.md:38` DOC — collateral row: becomes live when collateral must cover price times quantity.
- `docs/specifications/prd.md:144` DOC — "Invalid bids filtered post-decryption": nothing is filtered today; after this issue a zero-price or under-collateralised bid is invalid at opening and never fills.
- `docs/specifications/prd.md:166` DOC — "clearing price set at lowest qualifying bid": the rule for an undersubscribed window (review decision 34) is not stated; today the lowest opened bid sets the price, even at zero.
- `docs/specifications/prd.md:315` DOC — question 7 (griefing bounds): a dust bid can no longer cancel a window once invalid bids are skipped.

**Issue text corrections:**
- The accepted decision record `docs/decisions/bid-validity-simplification.md` slashes a griefing deposit for an invalid bid. This issue returns the whole collateral. The issue lists the record only as a canonical doc and never says which rule wins. The owner must pick, and the record must change or be superseded in the same pull request.
- The record's rules (3-sigma price filter, units filter, deposit) were never built. The marker at its rules block says what is built.
- The PRD's open question 7 (griefing bounds) is partly closed by this issue. The issue does not say so.

**Cross-issue pressure:**
- The section 2.8 collateral paragraph of v0-architecture carries markers for 216, 217, 218, 238 and the canonical docs issue (242). Write it once, after 216 and 217 land, or 242 rewrites it twice.
- Open pull request 213 adds an `E_UNPAYABLE_FILL` sentence to section 2.9. This issue makes that sentence wrong for an under-collateralised bid.

**CI:**
- Docs only: the Docs Rules job (`check-docs.yaml`) checks file names, not content. No check ties these passages to the code.

**Questions answered or sharpened by the code:**
- Undersubscribed window (review decision 34): `clear_internal` lets the lowest opened bid set the price, even a zero price. The PRD's "lowest qualifying bid" sentence and the architecture's step list both need the owner's rule written in.

## 217 One price unit across Move, SDK and UI

**Sites marked:** 4 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 4)

**Sites:**
- `docs/architecture/v0-architecture.md:216` DOC — the worked example is in whole USD per whole ETH; name that unit and show the FakeUSD (6 decimals) amounts quote_for_fill gives.
- `docs/architecture/v0-architecture.md:251` DOC — bid_quantity × bid_price needs units: quantity in wei, price in whole USD per whole token, product in FakeUSD units via quote_for_fill.
- `docs/architecture/v0-architecture.md:282` DOC — section 2.9: the clearing_price comment "USD per base token, no decimal shift" is the unit; sections 2.7 and 2.8 and every client must match it.
- `docs/specifications/prd.md:165` DOC — the example prices (2000, 1980, 1950) are whole USD per whole base token, the one unit this issue pins; say the unit here.

**Issue text corrections:**
- The issue cites `docs/specifications/web-architecture.md` as canonical. That file describes a deleted Alpine.js simulator under `source/web`. Point the issue at v0-architecture sections 2.7 to 2.9 instead.
- The worked clearing example in v0-architecture 2.7 and the PRD example (2000, 1980, 1950) name no unit. Both need the pinned unit, or readers keep guessing.

**Cross-issue pressure:**
- Section 2.8 is shared with 216, 218, 238 and 242. Land the unit (217) before the docs issue (242) rewrites 2.8.

## 218 Caps and minimum lock sizes per window

**Sites marked:** 5 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 5)

**Sites:**
- `docs/architecture/v0-architecture.md:115` DOC — state the cap on seller locks per window and the minimum seller lock size.
- `docs/architecture/v0-architecture.md:162` DOC — state the bid cap (100) and the minimum collateral per bid.
- `docs/architecture/v0-architecture.md:252` DOC — state the minimum FakeUSD collateral per bid.
- `docs/decisions/bid-validity-simplification.md:176` DOC — spam is bounded by a minimum collateral size and per-window caps, not by a slashed deposit.
- `docs/specifications/prd.md:313` DOC — question 6 (DoS prevention): partly answered by the seller-lock cap, the bid cap and the minimum lock sizes; name the values the owner picks.

**Issue text corrections:**
- The issue does not mention the bid validity decision record. That record says spam is bounded by a slashed deposit. This issue bounds it by caps and minimum sizes. The record needs a line.
- The bid cap already exists (`MAX_BIDS_PER_WINDOW = 100` in `auction.move:127`). Only the seller cap and the two minimums are new. The docs should state all four values.

**Questions answered or sharpened by the code:**
- PRD open question 6 (DoS prevention) gets a partial answer. The owner's three values must be written into the PRD and into v0-architecture 2.3, 2.5 and 2.8.

## 219 Live cross-chain round-trip test

**Sites marked:** 2 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 2)

**Sites:**
- `docs/development/cross-chain-test-suite.md:1` DOC — wholly superseded: the source/atomica-web suite it describes is deleted and it stops before release; archive it or rewrite it around the live round-trip test this issue adds.
- `docs/roadmap.md:39` DOC — settlement row: it can read live only once a CI test runs lock, auction, recordOutcome and releaseByOutcome across both chains; name that test here.

**Issue text corrections:**
- `docs/development/cross-chain-test-suite.md` describes the deleted `source/atomica-web` suite and stops before release. The issue does not list it. Archive it, or rewrite it around the new round-trip test.

**Cross-issue pressure:**
- The roadmap settlement row cannot read `live` until this test runs in CI. The canonical docs issue (242) should cite it by name.

## 220 Window ids follow the 07:45 and 16:15 UTC closes

**Sites marked:** 6 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 6)

**Sites:**
- `docs/architecture/v0-architecture.md:68` DOC — table: 07:45 and 16:15 UTC are the closes, not the opens; a window runs from the previous close, and the 08:15 and 16:45 closes exist nowhere.
- `docs/architecture/v0-architecture.md:69` DOC — paragraph below the table: 28 500 s is 07:55 UTC, not 07:45 (which is 27 900 s), and 58 500 s cannot fall inside a 43 200 s period; the period becomes 86 400 s.
- `docs/architecture/v0-architecture.md:86` DOC — both code blocks of 2.2 change to: day = s / 86400, t = s % 86400, id = day * 2 + (t >= 27900) + (t >= 58500).
- `docs/architecture/v0-architecture.md:403` DOC — the deadline derives from the window close, whose formula changes.
- `docs/roadmap.md:40` DOC — windows row: after this issue the ids change exactly at 07:45 and 16:15 UTC.
- `docs/specifications/auction-timing.md:53` DOC — window close bullet contradicts the Canonical Schedule above: 28 500 s is 07:55 UTC and odd windows close at 00:00 and 12:00; new close(w) = (w / 2) * 86400 + (w even ? 27900 : 58500).

**Issue text corrections:**
- v0-architecture 2.1 calls 07:45 and 16:15 the opens, and names 08:15 and 16:45 closes that exist nowhere. The issue covers 2.1 and 2.2 but does not name this table error.
- The timing spec's window close bullet already contradicts its own Canonical Schedule: 28 500 s is 07:55 UTC.
- v0-architecture's paragraph below the table says 58 500 s inside a 43 200 s period, which cannot happen.

**Cross-issue pressure:**
- The canonical docs issue (242) leaves the window formula text to this issue. The PRD marker at the window structure says the PRD claims 07:45 and 16:15 today. Land 220 before 242, or 242 must say the target is not yet built.
- The lock deadline paragraph of v0-architecture section 3 also changes with 221 and 222. Edit it once.

## 221 LockBox computes the lock deadline from the window id

**Sites marked:** 11 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 11)

**Sites:**
- `docs/architecture/v0-architecture.md:305` DOC — diagram: LockBox.lock takes no deadline.
- `docs/architecture/v0-architecture.md:343` DOC — last bullet: register_ethereum_lock takes no deadline; verify_lock recomputes the commitment with eth_lock_deadline(window_id) and E_WRONG_DEADLINE goes.
- `docs/architecture/v0-architecture.md:404` DOC — the auction key becomes keccak256(window_id, pair_hash); LockBox computes the deadline, so "Aptos registers a lock only when its deadline equals" goes.
- `docs/architecture/v0-architecture.md:482` DOC — lock drops uint64 deadline; add lockDeadline, windowClose and currentWindowId; "It ships at a new address" happens again.
- `docs/decisions/trustless-v0-1-unwinding.md:26` DOC — per-lock deadline row: LockBox computes the deadline from the window id; no caller supplies one, so a wrong or far-future deadline cannot strand a lock.
- `docs/decisions/trustless-v0-1-unwinding.md:66` DOC — "LockBox has no upgrade path. The proof-gated LockBox ships at a new address": this issue needs one more redeploy; batch it with the leaf rule (222) and the light client age limit (195).
- `docs/roadmap.md:41` DOC — LockBox row: lock takes no deadline and the auction key drops it; LockBox redeploys.
- `docs/specifications/auction-timing.md:45` DOC — "carries that window's lock deadline": LockBox computes it from the window id; the caller passes none, and lock rejects a closed window or one more than one ahead.
- `docs/specifications/auction-timing.md:54` DOC — reclaim delay bullet: the value is frozen into the immutable LockBox, so the owner fixes it first (review decision 36); third bullet: "Aptos registers a lock only with this deadline" becomes "LockBox computes it".
- `docs/specifications/auction-timing.md:96` DOC — budget table: the 72 h total is the reclaim delay the owner must fix before LockBox freezes it (review decision 36).
- `docs/specifications/cross-chain-locking.md:131` DOC — current-contract note: lock takes no deadline argument.

**Issue text corrections:**
- The decision record says LockBox "ships at a new address" once (issue 203). This issue forces one more redeploy. The record should say so.
- The diagram in v0-architecture section 3 shows `LockBox.lock` with a deadline. It needs the same change.

**Hidden costs:**
- The reclaim delay is frozen into an immutable LockBox. The owner must fix review decision 36 before this lands, and the timing spec's 72 h budget table must match the chosen value.

**Cross-issue pressure:**
- The same LockBox paragraphs carry 222 markers. Batch 221, 222 and the light client age limit (195) into one redeploy and one docs edit.

## 222 LockBox pays every leaf

**Sites marked:** 8 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 8)

**Sites:**
- `docs/architecture/v0-architecture.md:405` DOC — add: a short leaf pays its remainder to the depositor, and a covered lock whose leaf is unpayable goes home through reclaimUnpayable with no deadline wait.
- `docs/architecture/v0-architecture.md:483` DOC — the releaseByOutcome comment becomes "payouts, then the remainder to the depositor"; add reclaimUnpayable(lock, payouts, leaf).
- `docs/architecture/v0-architecture.md:499` DOC — leaf semantics: the payouts of a leaf may sum below the lock amount; the leaf and payouts hashes do not change.
- `docs/decisions/trustless-v0-1-unwinding.md:18` DOC — axiom 1: "Every other path returns the full amount to the depositor" fails on Ethereum for a leaf that does not sum (frozen for good) until this issue; record the leaf rule: payouts, then the remainder to the depositor, and an unpayable leaf reclaims.
- `docs/decisions/trustless-v0-1-unwinding.md:27` DOC — per-lock deadline row: add reclaimUnpayable beside reclaim.
- `docs/roadmap.md:42` DOC — LockBox row: add reclaimUnpayable and the remainder-to-depositor leaf rule.
- `docs/specifications/auction-timing.md:46` DOC — "Before it, only a proven Aptos AuctionOutcome releases the lock": add reclaimUnpayable for a recorded but unpayable leaf.
- `docs/specifications/cross-chain-locking.md:132` DOC — current-contract note: add reclaimUnpayable and the remainder-to-depositor rule.

**Issue text corrections:**
- Axiom 1 of the decision record says every other path returns the full amount. A leaf whose payouts do not sum freezes the lock today. The issue fixes the code but does not name the axiom text.
- v0-architecture's outcome tree paragraph must say a leaf's payouts may sum below the lock amount. The leaf and payouts hashes do not change.

**Cross-issue pressure:**
- Shares every LockBox paragraph with 221. One redeploy, one docs edit.

## 224 Pair allowlist for auction windows

**Sites marked:** 4 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 4)

**Sites:**
- `docs/architecture/v0-architecture.md:116` DOC — state the pair allowlist: create_auction aborts for unlisted pair bytes and stores the listed Pair.
- `docs/architecture/v0-architecture.md:144` DOC — the launch pair goes here; the code writes quote_chain "aptos" while FakeUSD collateral is locked on Ethereum, so fix the value before its BCS becomes the SDK constant and the Ethereum pair hash.
- `docs/architecture/v0-architecture.md:145` DOC — last sentence of 2.4: the key is bcs(window_id) followed by caller-supplied pair bytes today; with the allowlist those bytes are always the BCS of a listed Pair.
- `docs/roadmap.md:43` DOC — multi-pair row: "single pair hard-coded" becomes an allowlist seeded with one launch pair.

**Issue text corrections:**
- v0-architecture 2.4 gives a launch pair whose `quote_chain` the code writes as "aptos", while FakeUSD collateral is locked on Ethereum. Fix the value before its BCS becomes an SDK constant and the Ethereum pair hash.
- The registry key is `bcs(window_id)` plus caller-supplied pair bytes today. The docs must say the bytes are always the BCS of a listed pair once the allowlist lands.

**Cross-issue pressure:**
- The PRD multi-pair passage is labelled by the canonical docs issue (242). 224 adds only one launch pair, so 242's later-phase label still holds.

## 225 Only the auction package registers a timelock

**Sites marked:** 1 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 1)

**Sites:**
- `docs/decisions/aptos-validator-timelock.md:518` DOC — "ibe_config::register_timelock needs deadline <= epoch_end - 15 minutes": add that only the stored registrar may call it.

**Issue text corrections:**
- The fork spec is the issue's doc. In the product repo only the validator timelock decision record names `register_timelock`. It needs one line: only the stored registrar may call it.

## 226 Timelock status reads expired after the reveal expiry

**Sites marked:** 1 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 1)

**Sites:**
- `docs/decisions/aptos-validator-timelock.md:399` DOC — "Timeout + refund" is the built path: once the reveal expiry passes, the timelock reads Expired at once (not when the 50-per-block queue reaches it) and refund_expired_window returns every receipt.

**Issue text corrections:**
- The validator timelock decision record lists "Timeout + refund" as a defense. It does not say the status reads expired only when the 50-per-block queue reaches it. One line after the fix.

## 227 Native that decrypts a V2 bid

**Sites marked:** 2 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 2)

**Sites:**
- `docs/architecture/adr-timelock-ibe.md:18` DOC — Scheme Details, decryption bullet: no Move code decrypts today; the fork native ibe::decrypt_bid does it (pairing in Rust, AES-128-GCM), not bls12381_algebra in the contract; the identity is the hash of chain id, epoch, timelock id and deadline, not an epoch id.
- `docs/architecture/v0-architecture.md:185` DOC — the fork native ibe::decrypt_bid is what lets the chain check a ciphertext; until it ships no Move code can decrypt.

**Issue text corrections:**
- `docs/architecture/adr-timelock-ibe.md` says decryption runs in Move with `bls12381_algebra` and an epoch identity. Neither is true. The issue does not list this ADR.

**Cross-issue pressure:**
- The same ADR bullet carries a 228 marker. Edit it once, with 228.

## 228 Auction opens bids from ciphertexts

**Sites marked:** 12 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 12)

**Sites:**
- `docs/architecture/adr-timelock-ibe.md:19` DOC — Scheme Details, decryption bullet: auction::open_bids is the contract call that decrypts each bid.
- `docs/architecture/v0-architecture.md:163` DOC — the price hash and salt leave the bid; the plaintext is the 8-byte little-endian price.
- `docs/architecture/v0-architecture.md:186` DOC — whole section is replaced: open_bids(window_id, pair_bcs, max_bids) decrypts in batches and clears on the last batch; submit_cleartext_and_clear, open_bid, finalize_reveal and the opening window go.
- `docs/architecture/v0-architecture.md:390` DOC — the stuck test loses "plus the opening window", and "unopened bids" become bids that do not decrypt.
- `docs/decisions/bid-validity-simplification.md:177` DOC — steps a and b: a ciphertext that does not decrypt to an 8-byte price is invalid and its collateral returns; nothing is slashed.
- `docs/decisions/trustless-v0-1-unwinding.md:28` DOC — unwind row: "stuck" no longer waits for an opening window.
- `docs/roadmap.md:44` DOC — sealed-bids row: describes submit_cleartext_and_clear and finalize_reveal with a price hash; on-chain opening replaces them with open_bids.
- `docs/specifications/auction-timing.md:71` DOC — stuck deadline bullet: drop "plus the 10-minute opening window (OPENING_WINDOW_US)", and drop OPENING_WINDOW_US from the stuck_deadline_us block that open pull request 213 adds below.
- `docs/specifications/auction-timing.md:97` DOC — budget table: remove the "Opening window, 10 min" row.
- `docs/specifications/prd.md:12` DOC — "Timelock IBE cryptography" bullet: bids open by a submitted (price, salt) pair today; "no interactive reveal phase" holds only once open_bids decrypts on chain.
- `docs/specifications/prd.md:81` DOC — "automatic decryption" at the close needs open_bids; today each bid needs a submitted price and salt.
- `docs/specifications/prd.md:145` DOC — after on-chain opening, a ciphertext that does not decrypt to an 8-byte price is also an invalid bid.

**Issue text corrections:**
- The timing spec's stuck deadline bullet and budget table name `OPENING_WINDOW_US`. Open pull request 213 adds a `stuck_deadline_us` block that also uses it. The issue names the table row only.
- The PRD's Key Innovations bullet and timeline say "no interactive reveal phase" and "automatic decryption". Both are false until this issue lands. The issue does not list the PRD lines.
- The ADR for timelock IBE and the bid validity decision record both describe decryption steps this issue replaces. Neither is listed.

**Cross-issue pressure:**
- v0-architecture 2.5 and 2.6 also carry markers for 216, 218, 227, 235 and 242. The canonical docs issue (242) wants 2.5 and 2.6 to describe the commitment path "as built". This issue then deletes that path. Land 242's wording as a short pointer, or land 228 first.
- Pull request 213 rewrites the timing spec's stuck deadline text. Rebase the docs edit on 213.

## 230 Keep and emit the share submitter list

**Sites marked:** 1 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 1)

**Sites:**
- `docs/decisions/aptos-validator-timelock.md:306` DOC — "Economically penalized (reduced rewards)" is not built; this issue only keeps and emits the list of validators that did submit, so abstainers can be named.

**Issue text corrections:**
- The validator timelock decision record says abstainers are "economically penalized". Nothing penalizes them. This issue only keeps the list.

## 231 Align chain epochs with auction closes

**Sites marked:** 4 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 4)

**Sites:**
- `docs/architecture/v0-architecture.md:70` DOC — "A single epoch lasts 12 hours" is the window period, not the chain epoch; pick another word once the chain epoch ends are fixed.
- `docs/decisions/aptos-validator-timelock.md:519` DOC — "Not decided here: the epoch policy of a production network" is the open questions 1 to 3 of this issue; record the answer here and in the timing spec.
- `docs/specifications/auction-timing.md:29` DOC — add the chain epoch rule: epochs end at fixed UTC times at least 25 minutes from both closes (after the owner answers the questions of this issue).
- `docs/specifications/prd.md:83` DOC — "12:15 UTC Bid window opens": bids can start only in the chain epoch that holds the close, so the opening time depends on the epoch ends the owner picks.

**Issue text corrections:**
- v0-architecture 2.1 says "A single epoch lasts 12 hours". That is the window period, not the chain epoch. The word collides with this issue's chain epoch.
- The PRD timeline's 12:15 bid opening depends on the epoch ends the owner picks. The issue lists the PRD only as canonical.

**Questions answered or sharpened by the code:**
- The validator timelock decision record has a "Not decided here: the epoch policy" line. Record the owner's answer there and in the timing spec.

## 232 getDerivedAddress lowercases the Ethereum address

**Sites marked:** 2 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 2)

**Sites:**
- `docs/architecture/v0-architecture.md:368` DOC — getDerivedAddress lowercases the Ethereum address itself, so every spelling derives one account.
- `docs/specifications/cross-chain-locking.md:21` DOC — Ownership bullet: add that the SDK getDerivedAddress lowercases the Ethereum address, so every spelling of it derives the same receipt owner.

**Issue text corrections:**
- No doc touchpoint is named. The ownership bullet of the cross-chain locking spec and v0-architecture's account paragraph should state the lowercase rule.

## 233 Bidder registers its FakeUSD lock

**Sites marked:** 3 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 3)

**Sites:**
- `docs/architecture/v0-architecture.md:369` DOC — add that a bidder FakeUSD lock registers the same way with the FakeUSD asset type, and that its receipt id is the LockBox lock id.
- `docs/roadmap.md:45` DOC — bid submission UI row: live is wrong today: the screen fills the lock id with a transaction hash and cannot register a FakeUSD lock.
- `docs/specifications/cross-chain-locking.md:22` DOC — Registration bullet: add that a bidder registers its FakeUSD lock the same way, with the FakeUSD asset type, and that the receipt id is the LockBox lock id, never a transaction hash.

**Issue text corrections:**
- The roadmap marks the bid submission UI `live`. It fills the lock id with a transaction hash and cannot register a FakeUSD lock. The issue does not list the roadmap row.

## 234 Client refuses a LockBox that differs from the pin

**Sites marked:** 2 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 2)

**Sites:**
- `docs/architecture/v0-architecture.md:344` DOC — second bullet (the pin): add that the client reads this pin and refuses to approve or lock when its LockBox or token address differs.
- `docs/specifications/cross-chain-locking.md:23` DOC — add a bullet: eth_proof pins the LockBox and token addresses, and the client reads that pin and refuses to approve or lock when its own addresses differ.

**Issue text corrections:**
- The cross-chain locking spec and v0-architecture both describe the `eth_proof` pin. Neither says the client reads it. Add one bullet each.

## 235 Client builds the bid identity locally

**Sites marked:** 1 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 1)

**Sites:**
- `docs/architecture/v0-architecture.md:164` DOC — "IBE-encrypted at submission time": say that the client builds the identity and associated data itself and compares the master public key across endpoints, so no RPC node picks the key a bid is sealed to.

**Issue text corrections:**
- v0-architecture 2.5 says bids are "IBE-encrypted at submission time" with no word on who builds the identity. One sentence closes it.

## 236 UI completes a trade

**Sites marked:** 3 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 3)

**Sites:**
- `docs/architecture/v0-architecture.md:306` DOC — diagram: add the user flow: open, settle, then the release action that records the outcome and calls releaseByOutcome per lock.
- `docs/roadmap.md:46` DOC — settle and claim row: ClaimButton (a faucet mint) is removed for a release action; AuctionRevealer and SellFlow get exported.
- `docs/specifications/web-architecture.md:1` DOC — wholly superseded: describes a deleted Alpine.js simulator under source/web, yet issues 217, 236 and 241 cite it as canonical; archive it and point those issues at v0-architecture section 1.

**Issue text corrections:**
- The issue cites `docs/specifications/web-architecture.md` as canonical. It is a deleted simulator's doc. Use v0-architecture section 1 and the section 3 diagram.
- The roadmap row for settle and claim calls `ClaimButton` a live payout. It is a faucet mint.

## 237 Remove the off-chain beacon light client

**Sites marked:** 4 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 4)

**Sites:**
- `docs/roadmap.md:47` DOC — state-proof SDK row: the package loses its beacon light client.
- `docs/specifications/dual-testnet-integration.md:518` DOC — ETH_BEACON_URL below is the env var a beacon light client would read; nothing in the SDK reads it, so drop it with the light client or say it only reaches the beacon node API.
- `docs/specifications/state-proofs-readme-v1.md:5` DOC — remove the "Live Demo" and "Local Docker Demo" sections: the demo scripts and the light client they start are deleted.
- `docs/specifications/state-proofs-readme-v1.md:266` DOC — remove the "Light Clients" use case: the state root comes from the same RPC as the proof, so nothing is trusted less; Aptos reads validator-certified headers.

**Issue text corrections:**
- `state-proofs-readme-v1.md` has two demo sections and a "Light Clients" use case that go with the light client. The issue lists the file but not the sections.
- `dual-testnet-integration.md` names `ETH_BEACON_URL`. Nothing in the SDK reads it. The issue does not list it.

## 238 Remove dead Move code

**Sites marked:** 6 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 6)

**Sites:**
- `docs/architecture/v0-architecture.md:117` DOC — revealed_prices leaves WindowState and create_auction loses its unused mpk argument.
- `docs/architecture/v0-architecture.md:253` DOC — "Fee and rebate calibration is deferred to Phase 3c" paragraph: the rebate scaffolding is deleted; drop or reword.
- `docs/roadmap.md:48` DOC — rebate rows (on-chain and UI): the "no uniform-price anchor" reason is stale and the scaffolding, hook and FeeRebateDisplay are deleted; drop or reword both rows.
- `docs/specifications/lock-receipt-implementation.md:1` DOC — wholly superseded summary (old register_ethereum_lock signature, replay protection by block hash); the claimed_locks field in its ReceiptRegistry block goes; archive this file rather than edit one line.
- `docs/specifications/prd.md:16` DOC — "deal breakers pay deal makers": the zero-returning rebate scaffolding this points at is deleted from Move, SDK and UI.
- `docs/specifications/prd.md:238` DOC — the rebate scaffolding (compute_rebates, fetchRebates, useFeeRebate, FeeRebateDisplay) is deleted; nothing on chain computes a fee after this issue.

**Issue text corrections:**
- The issue names `lock-receipt-implementation.md` line 62. The whole file is a superseded summary with an old `register_ethereum_lock` signature. Archive it instead of editing one line.
- The PRD's fee section and Key Innovations bullet point at the rebate scaffolding this issue deletes. They are not listed.
- v0-architecture 2.8 has a "Fee and rebate calibration is deferred to Phase 3c" paragraph. It is not listed.

## 239 Remove unused testnet SDKs, mocks and the ZK scaffold

**Sites marked:** 11 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 11)

**Sites:**
- `docs/decisions/aptos-validator-timelock.md:520` DOC — "Proof in CI" names a workflow file and an SDK test path that are deleted; the test moves to aptos-testnet/test and runs in the Aptos Testnet SDK (docker) job.
- `docs/development/docker-testnet-sdk-integration.md:1` DOC — wholly superseded: a January 2026 guide for the pre-pivot EVM contracts with a test path under the deleted ZK scaffold; archive it.
- `docs/development/quick-reference.md:1` DOC — wholly superseded: pre-pivot contract set (AtomicaController, DepositBox) and test commands under the deleted ZK scaffold; archive it.
- `docs/development/timelock-implementation-plan.md:353` DOC — the validator-config.yaml task 1.1 names twice is a planned file under source/atomica-aptos/docker-testnet/, not the source/docker-testnet/config/validator-config.yaml this issue deletes; reword or mark the plan historical.
- `docs/roadmap.md:49` DOC — orchestrator row: the script lives in atomica-demo/scripts and its Aptos testnet import is repointed.
- `docs/roadmap.md:50` DOC — ZK row: the ZK scaffold crate is deleted; the acceptance grep also hits three v1.0 rows and one v2.0 row below.
- `docs/roadmap.md:93` DOC — three rows name the ZK scaffold crate path, which is deleted; reword to a planned location.
- `docs/roadmap.md:112` DOC — STARK row names the ZK scaffold crate path, which is deleted.
- `docs/specifications/aptos-testnet-sdk-readme-v1.md:1` DOC — wholly superseded: a README snapshot of the older Aptos testnet SDK that this issue deletes; archive it or replace it with the aptos-testnet README.
- `docs/specifications/dual-testnet-integration.md:1` DOC — historical planning spec: it names the older Aptos testnet SDK package and atomica-web paths that no longer exist; archive it rather than edit lines.
- `docs/specifications/project-overview.md:12` DOC — layout: the ZK scaffold crate and the test-utils mocks are deleted; the tree is stale beyond that (atomica-web/ and web/ are gone; atomica-sdk, atomica-web-components, atomica-demo, golden-vectors and shared are missing), and Key Docs points at a superseded quick reference.

**Issue text corrections:**
- The touchpoint `docs/development/timelock-implementation-plan.md (validator-config.yaml reference)` is wrong. That plan names a planned file under `source/atomica-aptos/docker-testnet/`, not the `source/docker-testnet/config/validator-config.yaml` this issue deletes.
- `docs/decisions/aptos-validator-timelock.md` "Proof in CI" says `aptos-docker-testnet.yaml` runs `typescript-sdk/test/timelock-genesis.test.ts`. The issue deletes both and does not list the doc.
- Five listed docs are wholly superseded (quick reference, SDK integration guide, Aptos testnet SDK readme, dual testnet spec, project overview tree). Editing their lines is wasted work. Archive them.
- The roadmap names the ZK scaffold path in one v0.1 row, three v1.0 rows and one v2.0 row. The issue names one row.

**Hidden costs:**
- Archiving docs breaks inbound links. `quick-reference.md` is linked from `project-overview.md`. `check-docs.js` checks names only, so a broken link passes CI.

## 241 Remove the unused seller reserve price

**Sites marked:** 4 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 4)

**Sites:**
- `docs/architecture/v0-architecture.md:118` DOC — state that a window has no reserve price at launch; min_prices leaves WindowState.
- `docs/roadmap.md:51` DOC — auction creation UI row: loses the minimum price field.
- `docs/specifications/prd.md:67` DOC — "No reserve prices at launch" becomes true in code with this issue: create_auction still takes min_price and the sell flow shows it today; no text change is needed afterwards.
- `docs/specifications/prd.md:312` DOC — question 3 (reserve price mechanics): this issue takes the "no reserve at launch" answer (review decision 33); keep the question only as a later item.

**Issue text corrections:**
- The issue cites `web-architecture.md` as canonical. It is a deleted simulator's doc.
- The PRD already says "No reserve prices at launch". After this issue that line is true, so the PRD needs no text change there. Only open question 3 should move to a later item.

## 242 Canonical docs match the code

**Sites marked:** 65 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 65)

**Sites:**
- `docs/architecture/v0-architecture.md:13` DOC — section 1 reads as a plan: the renames of 1.2 are done and the React-import check of 1.3 already runs in .githooks/pre-push (not in CI).
- `docs/architecture/v0-architecture.md:60` DOC — section 2 was the pre-implementation target: auction.move is written and its structs and entry signatures differ from the code blocks in 2.3, 2.5 and 2.6.
- `docs/architecture/v0-architecture.md:87` DOC — last sentence of 2.2 is false: submit_bid never reads the clock window id; it checks the window timelock status and deadline, and create_auction accepts the current and the next window id.
- `docs/architecture/v0-architecture.md:114` DOC — WindowState as built also holds timelock_id, min_prices, revealed_prices, reveal_final, refunded and bid_results, bids is vector<SealedBid>, and sellers contribute supply, not bids.
- `docs/architecture/v0-architecture.md:160` DOC — Bid struct is stale: SealedBid holds one V2 ciphertext BCS(vk, U, nonce, C, sig), ct_id, a 32-byte price hash, a clear quantity, opened and price; there is no u_bytes, and the encoding follows the fork spec, not Drand tlock.
- `docs/architecture/v0-architecture.md:183` DOC — reveal as built: submit_cleartext_and_clear(settler, window_id, pair_bcs, cleartexts, salts) and open_bid check each (price, salt) against the 32-byte hash stored at submission, never against the ciphertext; the key getter is timelock::get_decryption_key.
- `docs/architecture/v0-architecture.md:217` DOC — step 5: on main only opened losing bids are released; an unopened bid receipt stays claimed (BidUnopened) until the Aptos unwind (194) merges.
- `docs/architecture/v0-architecture.md:249` DOC — the contract does not enforce "at least bid_quantity × bid_price": submit_bid drops the receipt amount; say what is enforced today and name the bid validity issue (216) as the gap.
- `docs/architecture/v0-architecture.md:283` DOC — section 2.9: Ethereum settlement is driven by AuctionOutcome, which settle does not emit on main; AuctionSettled is no longer what section 3 uses.
- `docs/architecture/v0-architecture.md:289` DOC — "No relayer, admin key or operator account decides where funds go" contradicts the upgrade-key bullet of 3.2 (owner decision 30); "moving to this model through issues 194 to 203" is stale: only 194 and 195 are open.
- `docs/architecture/v0-architecture.md:307` DOC — diagram: "auction settle / unwind emits AuctionOutcome" is not on main (open pull request 213).
- `docs/architecture/v0-architecture.md:388` DOC — not on main: settle emits no AuctionOutcome and auction::unwind does not exist (open pull request 213 rewrites this paragraph).
- `docs/architecture/v0-architecture.md:453` DOC — "issue 202 replaces it" is done: AptosLightClient.sol is merged; BLSVerifier.sol still ships until the SDK and UI unwind (195) deletes it.
- `docs/architecture/v0-architecture.md:510` DOC — footer is stale: the Phase 3a and 3b work it promises is merged.
- `docs/decisions/aptos-validator-timelock.md:134` DOC — "Timelock decryption requires 2/3+ validators ... same threshold" (also Defense 1 and Offline Collusion): the fork secrecy threshold is one half of stake; only the reveal threshold is two thirds (owner decision 31).
- `docs/decisions/trustless-v0-1-unwinding.md:12` DOC — decision sentence (owner decision 30): "No relayer, admin key or operator account can move, hold or freeze user funds" contradicts Trust Assumptions below, where the package upgrade-key holder can emit any AuctionOutcome.
- `docs/decisions/trustless-v0-1-unwinding.md:29` DOC — unwind row: not on main; open pull request 213 (194) and the SDK and UI unwind (195) implement it.
- `docs/decisions/trustless-v0-1-unwinding.md:58` DOC — "Funds never depend on one key" contradicts the upgrade-key assumption below (owner decision 30); "matches the PRD ... plus the one named assumption" is false while the PRD names no upgrade-key holder.
- `docs/decisions/trustless-v0-1-unwinding.md:80` DOC — add the bid secrecy assumption once the owner answers decision 31: the fork keeps bids secret only against at most one half of stake, which this section does not name.
- `docs/development/technical-risks.md:1` DOC — wholly superseded (last updated 2025-12-22) yet the PRD links here "for detailed status"; archive it or rewrite it with the PRD status block.
- `docs/roadmap.md:3` DOC — the April 2026 drift inventory file named here is not in the repo.
- `docs/roadmap.md:18` DOC — "authored in issue #83": v0-architecture.md exists; zk-verification.md (linked under v1.0) still does not.
- `docs/roadmap.md:26` DOC — goal sentence: "trusts only the 2/3 validator threshold" omits the package upgrade-key (owner decision 30) and the one-half secrecy bound (owner decision 31); "any user can unwind" is true on Ethereum only until the Aptos unwind (194) merges.
- `docs/roadmap.md:30` DOC — every atomica-web-ui/ and atomica-web/ path in this table is stale: the packages are atomica-sdk, atomica-web-components and atomica-demo (SIWE, IBE client, sealed bids, UI rows, orchestrator, browser tests).
- `docs/roadmap.md:31` DOC — state-proof row: the reason text is stale: validator-attested headers are merged (issues 196, 197) and no admin writes roots.
- `docs/roadmap.md:32` DOC — "IBE timelock on-chain Move scaffolding" row: scaffold is stale: the registry is 0x1::ibe_config in the fork, timelock.move is a thin wrapper and timelock_config.move holds values nothing reads.
- `docs/roadmap.md:33` DOC — auction row: the status text is stale: clear_internal clears at a uniform price with partial fill; the open gaps are bid validity (216), caps (218) and the unused reserve (241).
- `docs/roadmap.md:34` DOC — windows row: the status text is stale: windows are global per (window_id, pair) with ids from the clock; the gaps are the formula (220) and the seller-picked timelock deadline (243).
- `docs/roadmap.md:35` DOC — collateral row: the status text is stale: submit_bid claims a FakeUSD receipt and drops its amount.
- `docs/roadmap.md:36` DOC — settlement row: stale: the Aptos light client (202) and proof-gated LockBox (203) are merged and BLSVerifier.sol is retired; missing are the Aptos outcome (194), the carrier (195) and a live round trip (219).
- `docs/roadmap.md:37` DOC — unwind row: LockBox reclaim is live (203); the Aptos unwind is open pull request 213 (194); the SDK and UI half (195) is open.
- `docs/roadmap.md:94` DOC — "Dual-gate settlement" row names Settlement.sol, a retired contract; the gate belongs on LockBox.
- `docs/roadmap.md:129` DOC — this table is stale: auction.move.broken, atomica-web/, atomica-web-demo/, the atomica-web-ui payloads and the .skip test files no longer exist; the pre-pivot Solidity row is owned by the SDK and UI unwind (195).
- `docs/specifications/auction-timing.md:38` DOC — "Settlement target remains 1-3 hours post-close" has no mechanism: settle is callable from the reveal and the budget below allows up to 72 h before reclaim.
- `docs/specifications/auction-timing.md:70` DOC — the settle and stuck deadline bullets describe open pull request 213: main has no stuck deadline, no unwind and no time limit on settle.
- `docs/specifications/prd.md:11` DOC — "Non-custodial with minimal lock time" bullet: on main a lock leaves LockBox only by reclaim, 72 h after its window closes, so say what the lock time is today.
- `docs/specifications/prd.md:13` DOC — "Encrypted mempools" bullet: only the price is sealed; the bid quantity is a clear argument of submit_bid and no encrypted mempool is used; say so.
- `docs/specifications/prd.md:14` DOC — "Double verification pathways" bullet: label the ZK half as a later-phase item, in the wording the acceptance check greps for.
- `docs/specifications/prd.md:15` DOC — "Zero operator fees" bullet: no fee or rebate exists on chain and Bitcoin is not supported; label the deal-breaker rebate as a later-phase item.
- `docs/specifications/prd.md:51` DOC — property 3 "N-layer timelock encryption": one validator layer is built; label the other layers as a later-phase item.
- `docs/specifications/prd.md:64` DOC — the 07:45 and 16:15 UTC closes are the target; on main window ids change at 00:00, 07:55, 12:00 and 19:55 UTC until the window id issue (220) lands; say so or land that first.
- `docs/specifications/prd.md:65` DOC — "All trading pairs clear simultaneously": one FakeETH and FakeUSD pair is hardcoded; label multi-pair clearing as a later-phase item (the pair allowlist issue (224) adds one launch pair).
- `docs/specifications/prd.md:66` DOC — "Sellers ... with quote assets wanting base assets" and "Bidders: Base asset holders" are inverted against the code: sellers lock the base token (FakeETH) and bidders lock the quote token (FakeUSD).
- `docs/specifications/prd.md:68` DOC — "Settlement: 1-3 hours post-auction" (also Executive Summary, Core Properties, "Why 1-3 Hour Settlement", Key Tradeoffs): no code times settlement; on main no outcome reaches Ethereum and a lock goes home by reclaim after 72 h.
- `docs/specifications/prd.md:80` DOC — timeline: no code opens bidding at 12:15 or delays settlement to 17:15; bids run from create_auction to the window timelock deadline, and settle is callable from the reveal.
- `docs/specifications/prd.md:111` DOC — "Multi-Asset Auctions" section: unbuilt; label it as a later-phase item, and note that the linked product design is archived.
- `docs/specifications/prd.md:126` DOC — "All away chains (Ethereum, Solana, Base, Arbitrum)": only Ethereum is built.
- `docs/specifications/prd.md:127` DOC — verification item 1: validators do not sign merkle roots with a threshold signature; Ethereum checks a 2/3+ aggregate BLS signature over an Aptos LedgerInfo plus an event inclusion proof (AptosLightClient).
- `docs/specifications/prd.md:128` DOC — verification item 2 (ZK computation layer): label as a later-phase item.
- `docs/specifications/prd.md:142` DOC — Sealed Bid Implementation: only the validator timelock layer exists; label the onion layers, the seller DKG layer and the Drand layer as later-phase items.
- `docs/specifications/prd.md:143` DOC — the 67 percent sentence (owner decision 31): the fork keeps bids secret only against at most one half of stake and needs two thirds to reveal; the seller-set 33 percent is unbuilt.
- `docs/specifications/prd.md:164` DOC — "sealed bids (quantity + price)": only the price is sealed; the quantity is public at submission.
- `docs/specifications/prd.md:178` DOC — "without needing ... gas tokens": the derived Aptos account pays its own gas; the demo funds it with APT through a funding API, and no fee payer exists in the SDK.
- `docs/specifications/prd.md:201` DOC — "(12:00 NYC, 12:00 Tokyo)" contradicts the canonical 07:45 and 16:15 UTC closes, and "on business days" has no code: window ids run every calendar day.
- `docs/specifications/prd.md:237` DOC — "Fee Structure: Deal Breakers Pay Deal Makers" section: unbuilt (the rebate coefficient is zero); label the rebate curve as a later-phase item.
- `docs/specifications/prd.md:263` DOC — status block: Risk #2 is no longer "in progress, N-layer onion" (validator timelock DKG, V2 bid ciphertexts and key reveal are merged); Risk #3 is no longer "Pending" (attested headers, the Aptos light client and the proof-gated LockBox are merged; outcome emission (194) and the carrier (195) are open); the timeline estimate is stale.
- `docs/specifications/prd.md:264` DOC — the Risk #3 bullet repeats "trusts only the 2/3 validator threshold, no relayer" without the package upgrade-key assumption (owner decision 30).
- `docs/specifications/prd.md:290` DOC — "Custodial Risk" row: "locked only for auction duration; guaranteed delivery or refund": the lock deadline is the window close plus 72 h (owner decision 36), and the package upgrade-key holder can redirect a lock (owner decision 30).
- `docs/specifications/prd.md:316` DOC — question 5: headers are validator transactions now; the open incentive question is who pays the outcome carrier's gas (review K-2). Question 9: the package upgrade-key is the governance question that matters (owner decision 30).
- `docs/specifications/prd.md:352` DOC — links: 31 links in this file are repo-root paths (docs/...) that do not resolve from docs/specifications/ on GitHub; only the timing-spec line uses file-relative links; "Bear Market Analysis" is listed twice.
- `docs/specifications/prd.md:380` DOC — broken link: the plan evolution file lives under docs/archived/ in kebab-case.
- `docs/specifications/prd.md:381` DOC — table row v0.1 Beta: "2/3 validator threshold only" omits the package upgrade-key (owner decision 30), and "permissionless unwind (current)" is not on main until the Aptos unwind (194) merges.
- `docs/specifications/prd.md:391` DOC — trust model sentence (owner decision 30): "No relayer, admin key or operator can move or freeze funds" contradicts the decision record's Trust Assumptions; also state the bid secrecy bound (owner decision 31).
- `docs/specifications/prd.md:425` DOC — last-updated date and status line are stale.
- `docs/technical/architecture-overview.md:1` DOC — wholly superseded (sealed reserve prices, N-layer onion, a 67 percent threshold) yet the PRD links here as the architecture; archive it or redirect to v0-architecture.

**Issue text corrections:**
- The PRD "header date" is the footer: `**Last Updated:** 2025-01-17` is the second-to-last line of `prd.md`.
- The link acceptance check runs `ls` on `docs/...` paths from the repo root. All 31 PRD links use repo-root paths, and none resolves on GitHub from `docs/specifications/`. If the fix makes them file-relative, the check matches nothing and passes for the wrong reason. Rewrite the check, or keep the repo-root form on purpose.
- "Bear Market Analysis" is listed twice in the PRD link list.
- The PRD names its sellers and bidders the wrong way round against the code. Sellers lock the base token (FakeETH). Bidders lock the quote token (FakeUSD).
- The PRD's "1-3 hour settlement" appears in five places. No code times settlement. The issue does not list it.
- The PRD's "12:00 NYC, 12:00 Tokyo" and "business days" contradict the 07:45 and 16:15 UTC closes. Window ids run every day.
- The PRD links `technical/architecture-overview.md` as the architecture and `development/technical-risks.md` "for detailed status". Both are wholly superseded (sealed reserve prices, N-layer onion, 67 percent). The issue scopes five docs and misses these two.
- The roadmap has stale rows beyond the four acceptance greps: every `atomica-web-ui/` and `atomica-web/` path, the on-chain scaffold row, the unwind row, the v1.0 `Settlement.sol` row, the cleanup table, and a missing April 2026 drift inventory file.
- v0-architecture is stale outside 2.5, 2.6 and 2.8: section 1 reads as a plan, 2.2's last sentence is false, 2.3's WindowState is short six fields, 2.9 says settle emits nothing Ethereum uses, 3.x calls 202 future work, and the footer promises merged work.
- `docs/decisions/aptos-validator-timelock.md` repeats the 2/3 secrecy claim (decision 31). The issue does not list it.

**Hidden costs:**
- Several canonical passages already describe open pull request 213 (AuctionOutcome from settle, `auction::unwind`, the stuck deadline). If 242 lands first it must mark them "not on main". If 213 lands first those markers go away.
- Archiving the two superseded docs the PRD links breaks about ten inbound links, including the root `README.md`.

**Cross-issue pressure:**
- Almost every 242 site shares lines with a code issue: 216, 217, 218 (section 2.8), 220 (2.1, 2.2, PRD windows), 228 (2.5, 2.6, timing spec), 238 and 241 (PRD fees, reserve). Writing "as built" text now means rewriting it after each lands.
- The two owner decisions (30 upgrade key, 31 secrecy bound) gate the decision record, PRD trust model, roadmap goal sentence, PRD v0.1 table row and v0-architecture 3.1.

**CI:**
- Docs Rules (`check-docs.yaml`) runs `bun scripts/check-docs.js`. It checks file names and placement only. No job checks links or content.
- Required Checks reports through the docs-only path of `test-web.yaml`.

**Questions answered or sharpened by the code:**
- Decision 30 (upgrade key): the decision record's own Trust Assumptions already name the key. Its first sentence and "Funds never depend on one key" contradict that. Pick the wording once and copy it to the PRD, roadmap and v0-architecture 3.1.
- Decision 31 (secrecy bound): the PRD's 67 percent sentence and the validator timelock decision record both need the same answer.

## 243 create_auction registers the window's timelock

**Sites marked:** 8 (ADD 0, EDIT 0, REMOVE 0, TEST 0, DOC 8)

**Sites:**
- `docs/architecture/v0-architecture.md:88` DOC — say here that the window timelock deadline is the window close, which is what binds a bid to the window clock.
- `docs/architecture/v0-architecture.md:119` DOC — state that create_auction registers the window timelock itself, one per window id, and takes no timelock_id.
- `docs/decisions/aptos-validator-timelock.md:521` DOC — the 24 h docker epoch holds the next window close, but tests cannot wait hours for it: record how tests reach a window close (open question 1 of this issue).
- `docs/roadmap.md:52` DOC — windows row: after this issue the window timelock closes at the window close, not at a seller-picked time; the auction creation UI row loses the register-timelock step.
- `docs/specifications/auction-timing.md:30` DOC — "decryption deadlines MUST key off UTC timestamps": the first seller of a window picks the timelock deadline today; say that create_auction registers it at the window close.
- `docs/specifications/auction-timing.md:98` DOC — budget table: once the timelock deadline is the window close, the first row shrinks from 23 h 50 min to the 10-minute reveal window.
- `docs/specifications/prd.md:82` DOC — "16:15 UTC Auction close": the close is the first seller's timelock deadline today; it is the window close only once create_auction registers the timelock itself.
- `docs/specifications/prd.md:314` DOC — question 6 also covers timelock registration spam: closed when only the auction package registers a timelock, one per window.

**Issue text corrections:**
- v0-architecture 2.2 never says the window timelock deadline is the window close. That is what binds a bid to the clock. Add it.
- The validator timelock decision record's 24 h docker epoch holds the next window close. Tests cannot wait hours. Record the answer to this issue's open question 1 there.

**Hidden costs:**
- The timing spec's budget table changes: the first row shrinks from 23 h 50 min to the 10-minute reveal window.

## No sites in this partition

- 223 (Reject a timelock DKG result without a pinned parameters hash): fork only; product docs never mention the parameters hash, and the product testnet runs chain id 4. The fork spec is the FORK scout's.
- 229 (Timelock share verifier is called directly): fork only; no product doc names the share verifier or its static.
- 240 (Remove the retired timelock prototype): fork only; no product doc names the prototype, legacy-v1 vectors or `reconstruct_ibe_dk`.

## Unmarkable sites

- `docs/development/contract-interfaces.sol`: a Solidity file under `docs/`. No issue in 216 to 243 names it, so it carries no marker. It could hold a `//` marker if an issue needs one.
- Passages inside tables, lists and code fences are marked above the enclosing block, not on the line. Examples: every roadmap row (23 markers stacked above the v0.1 table), the v0-architecture 2.2 and 2.4 code blocks, the timing spec budget table, the LockBox Solidity block in v0-architecture 3.x.

## Seen outside my partition

- Root `README.md` repeats the stale PRD status and the rebate curve (242). The INFRA scout marked it. The canonical docs issue (242) should list it.
- `source/atomica-move-contracts/sources/auction.move` `compute_rebates` comment points at the v0-architecture fee and rebate paragraph. Both go with the dead code issue (238), so delete them together.

## Check results

All local runs, not CI.

- `bun scripts/check-docs.js` from the worktree root: "Documentation rules check passed." Exit 0.
- Render neutrality, first check: `python3 -I docs-scout-scratch/render_check.py` (read first; read-only). It renders HEAD and the working copy of each changed doc with markdown-it-py (CommonMark, html on, tables on), strips the marker comment lines from the new HTML, and compares. Result: "files with render differences: 0" for all 21 files. Every marker in the source appears as a raw HTML comment line in the output, so none landed inside a fence or became text.
- Render neutrality, second check: for each changed doc, `diff -B <(git show HEAD:<path>) <(grep -v '^<!-- SCOUT(#NNN) KIND: ... -->$' <path>)`. Result: no difference in any file.
- Diff shape: `git diff -U0 -- docs` holds only added lines. 181 are full-line markers and 81 are blank lines. No line was removed or changed.
- No marker body holds `--`.
- Merge with open pull request 213 (head `b3b7dbc`): `git merge-file` of the marked `v0-architecture.md` and `auction-timing.md` against 213's versions: 0 conflicts each.
- `git status --short -- docs`: 21 modified files, no new files, nothing under `docs/code-reviews`.
- `insert_markers.py` from the earlier scouts was read but not run. Its site list matches the markers in the tree. The last scout's half-done fix left no broken marker: both checks above pass.

## Suggested order

1. Pull request 213 first. Many canonical passages already describe it, and the docs markers say "not on main".
2. The code issues that rewrite shared passages: window ids (220), then the LockBox trio (221, 222 with 195) in one redeploy, then bid validity (216), price unit (217), caps (218), dead code (238) and reserve price (241). Each edits its own lines of v0-architecture 2.x and the PRD as it lands.
3. Ciphertext opening (228) with the fork native (227) and create_auction registration (243). They change 2.5, 2.6, the timing spec budget table and the PRD timeline.
4. The cleanup issues (237, 239): archive the superseded docs in one pass, and fix the inbound links by hand, because no check catches a broken link.
5. The canonical docs issue (242) last, after the owner answers decisions 30 and 31. If it must go earlier, keep its 2.5, 2.6 and 2.8 text to short "as built today, see issue N" pointers, so 216 and 228 do not rewrite it.
