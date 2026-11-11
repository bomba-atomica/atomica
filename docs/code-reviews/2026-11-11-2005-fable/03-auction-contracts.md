# Chapter 3: Aptos Auction Contracts

**Scope:** `source/atomica-move-contracts/sources` at `main` commit `4ca0acd`.
**Method:** Full read of `auction.move`, `lock_receipt.move`, `eth_proof.move`, `mpt.move`, `rlp.move`, `timelock.move`, `timelock_config.move`, `registry.move`, `outcome_tree.move` and the token modules. No test or build was run for this chapter.
**Line numbers** refer to `main` at `4ca0acd`.

Every finding below was traced in the source. A second pass re-traced A-1 to A-9 and corrected A-2 and A-8. None of them is covered by an open issue unless the table says so.

---

## Summary

| ID | Severity | Finding | Tracked |
| --- | --- | --- | --- |
| A-1 | Critical | Bid collateral is never compared with price times quantity | No |
| A-2 | Critical | A bid with a huge quantity freezes the whole window | No |
| A-3 | Critical | Bidders can choose after the reveal whether their bid counts | No |
| A-4 | High | The seller reserve price is stored and never used | No |
| A-5 | High | An undersubscribed window clears at the lowest bid, including zero | No |
| A-6 | High | 100 dust bids close a window to everyone else | No |
| A-7 | High | The first seller picks the window's timelock and its close time | No |
| A-8 | High | Window ids do not follow the canonical 07:45 and 16:15 schedule | No |
| A-9 | High | `settle` emits no outcome that Ethereum can use | Unwind issue (194) |
| A-10 | Medium | The seller list of a window has no cap | No |
| A-11 | Medium | Lock registration cost grows with every lock ever registered | No |
| A-12 | Medium | Only one pair exists, and the pair bytes are not checked | No |
| A-13 | Low | Dead code and wrong views | No |

The cross-window collateral attack is in Chapter 4 (E-1), because its damage lands on Ethereum. Its fix is on the Aptos side.

The open unwind pull request (213) changes some of these. Each finding says so where a part of that pull request was read. The findings describe `main`.

---

## A-1 Critical: bid collateral is never compared with price times quantity

**Evidence**

- `auction.move:591` reads the collateral amount into `_collateral_amount` and drops it.
- `auction.move:626-627` says "Zero-quantity and over-supply bids are allowed".
- `open_one` (`auction.move:656-669`) accepts any price that matches the commitment.
- `clear_internal` (`auction.move:888-1018`) fills by price and quantity alone.
- The only collateral check in the product is off chain: `source/atomica-sdk/src/settlement/bridge.ts:598-602` throws `winner ... owes ... but has ... left`.
- The architecture requires the check: "locked value is at least `bid_quantity × bid_price`" (`docs/architecture/v0-architecture.md:213`).

**Failure scenario**

1. Mallory locks 1 unit of FakeUSD and registers the receipt.
2. Mallory bids the full supply at the highest `u64` price.
3. Mallory opens the bid after the reveal. The bid sorts first and takes the whole supply.
4. Every honest bidder loses.
5. `settle` on Aptos succeeds and names Mallory the only winner. No valid Ethereum payout exists for that fill, because one unit of FakeUSD cannot pay for it. The off-chain bridge throws at this point.

The cost is one dust lock per auction. Any auction can be cancelled this way.

On `main` today the damage is the lost auction. No lock pays out on Ethereum in any case (A-9).

The unwind issue (194) builds the payouts in Move ("Fills follow the allocation in `bridge.ts:556-600`"). It does not say what happens when the quote exceeds the collateral. An abort gives the same kill switch. A cap at the collateral gives Mallory the FakeETH for one unit of FakeUSD. The open pull request (213) chose the abort: `settle` aborts with `E_UNPAYABLE_FILL`, and `unwind` refunds every lock after the stuck deadline. So the kill switch stays, by design, unless the check below is added.

**Smallest fix**

Check at opening time, when the price is known. Store the collateral amount in `SealedBid` at submission. In `open_one`, treat a bid as invalid when `price × quantity` exceeds it. An invalid bid never fills and its collateral goes back to its depositor.

---

## A-2 Critical: a bid with a huge quantity freezes the whole window

**Evidence**

- `submit_bid` takes `quantity: u256` with no bound (`auction.move:587`).
- `clear_internal` computes `accumulated + qty` (`auction.move:952`). Move aborts on overflow.
- Every finalizing path runs `clear_internal` through `finalize_internal` (`:700`): `open_bid` (`:723-725`), `submit_cleartext_and_clear` (`:767-769`) and `finalize_reveal` (`:793`).
- `settle` needs `reveal_final` (`:1079`). `refund_expired_window` needs an `Expired` timelock (`:819`).

**When the sum overflows**

The first opened bid in price order never overflows, because `accumulated` is zero. The overflow needs an opened bid with a positive quantity ahead of the huge bid, and the supply must not be filled before the huge bid is reached. An opening that would complete this state as the last opening reverts with the rest of its transaction (`:723-725`, `:767-769`). So the state must be reached while some other bid is still unopened.

**Failure scenario**

1. Mallory submits two bids with two dust locks. Bid M1 has quantity 1. Bid M2 has quantity `2^256 - 1`. Both commit to the highest `u64` price. M1 is submitted first, so it sorts first (the sort keeps equal prices in submission order, `:917`).
2. At least one other bidder bids in the window.
3. After the reveal, Mallory opens M1 and M2 at once. Neither opening is the last one, so nothing finalizes yet.
4. Every later opening that would be the last one runs `clear_internal`. M1 fits. M2 makes `1 + (2^256 - 1)` overflow. The call aborts, so that bid stays unopened.
5. After the opening window, `finalize_reveal` runs the same loop and aborts the same way. The window can never set `reveal_final`.
6. The timelock is `Revealed`, not `Expired`, so `refund_expired_window` aborts too.

No Aptos call on `main` can finish that window. Every lock waits for the Ethereum reclaim deadline. The attack is a second cheap way to cancel an auction. Its cost is two dust locks.

**What does not freeze the window**

- One huge bid and one honest bid. If the honest bid opens first, the huge bid can never open, and the honest bid wins after the opening window. If the huge bid opens first, it wins the whole supply at its own price. When that price is below the honest bid's, the honest bid cannot even open. That second case shuts out a lone rival, and with a zero price it joins A-5.
- A huge bid that sorts behind enough demand to fill the supply. The loop stops before it reaches that bid.

**After the unwind issue (194)**

The planned `unwind` works on an unsettled window "whatever its reveal state". The window then ends in a full refund after the stuck deadline, not in a freeze. The auction is still cancelled. The parts of the pull request (213) that were read keep zero-quantity and over-supply bids allowed.

**Smallest fix**

Reject `quantity == 0` and `quantity > total_supply` in `submit_bid`, or clamp the quantity to the supply in `clear_internal`. The comparison `qty <= supply - accumulated` cannot overflow.

---

## A-3 Critical: bidders can choose after the reveal whether their bid counts

**Evidence**

- The module header states the gap: "A bid whose ciphertext does not hold the committed price cannot be opened by a relayer. Only the bidder can open it, and an unopened bid is invalid." (`auction.move:32-35`).
- `submit_bid` checks the ciphertext shape with `ibe::verify_bid_ct` (`:615`). It never links the ciphertext to the commitment.
- Openings stay possible until `reveal_expiry + 10 minutes` (`OPENING_WINDOW_US`, `:129`, `:790-792`).
- An unopened bid has no penalty in the target design. The unwind issue (194) returns its collateral and lists "Griefing penalty for unopened bids" as out of scope.

**Failure scenario**

1. Mallory submits ten bids, each with its own dust lock. Each has a valid commitment to a different price and a ciphertext that encrypts junk. The prices are fixed at submission. The choice of which ones count is not.
2. The validators release the key. Every honest bid is now readable by anyone.
3. Mallory reads the honest bids, then opens only the bids that help.
4. Mallory can open the committed price closest above the marginal bid, or stay out, or (as a seller) open a shill bid only when it raises the price.

This is the free option that sealed bids exist to remove. The PRD promises "sealed bids that automatically decrypt at auction deadline—no interactive reveal phase" (`docs/specifications/prd.md:15`). The contract has an interactive reveal phase with a last-mover advantage. The fork review reached the same conclusion from the other side (Chapter 5, F-6).

**Smallest fix**

Make the chain open the bids. The fork already ships a native that parses the ciphertext (`ibe::verify_bid_ct`). Add a native that decrypts a V2 bid with the on-chain key and returns the plaintext. Then one call decrypts every bid and clears. The commitment, the salt, `open_bid`, `submit_cleartext_and_clear`, `finalize_reveal`, the opening window and the unopened state all go away. See Chapter 2 (S-1).

If the native cannot land soon, forfeit part of the collateral of an unopened bid to the sellers. That prices the option without removing it.

---

## A-4 High: the seller reserve price is stored and never used

**Evidence**

- `create_auction` takes `min_price` and stores it (`auction.move:451`, `:501`, `:512`).
- No other line reads `min_prices`. `clear_internal` and `settle` ignore it.

**Failure scenario**

A seller sets a reserve of 2 000. The window clears at 1 500. The seller's FakeETH is sold at 1 500. The UI showed a reserve field, so the seller believed the lock was protected.

**Smallest fix**

Either remove the parameter (the PRD says "No reserve prices at launch", `prd.md:62`), or exclude a seller's lock from supply when the clearing price is below its reserve. Removing it is simpler and matches the PRD.

---

## A-5 High: an undersubscribed window clears at the lowest bid, including zero

**Evidence**

- The loop sets `clearing_price = price` for every opened bid that fits (`auction.move:952-957`).
- When demand is below supply the loop ends on the lowest opened bid.
- Price zero and quantity zero are both accepted (`:626-627`, and `open_one` has no price check).

**Failure scenario**

Supply is 10 FakeETH. Alice bids 4 at 2 000. Mallory bids quantity zero at price zero. Demand is below supply, so the clearing price is zero. Alice receives 4 FakeETH and pays nothing. With no reserve (A-4) the seller has no defence.

Anyone who expects an undersubscribed window can add a zero-price bid for the cost of a dust lock. Nobody has to guess. Bid quantities are public at submission (`:587`, `:634`), so the shortfall is visible before the deadline. Mallory can also bid the unsold remainder herself at price zero and take it for nothing.

I traced the example through `clear_internal` by hand. Alice's bid fits and sets the price to 2 000. Mallory's bid also fits (`4 + 0 <= 10`) and sets the price to zero at `:955`. Both are marked winners.

**Smallest fix**

Reject zero price at opening and zero quantity at submission. That alone does not close the finding. A bid of one wei at price 1 moves the price the same way. The undersubscribed rule must be decided on purpose. The standard uniform-price rule is: when demand is below supply, the price is the reserve, and with no reserve the window does not trade.

---

## A-6 High: 100 dust bids close a window to everyone else

**Evidence**

- `MAX_BIDS_PER_WINDOW` is 100 (`auction.move:127`), checked at `:605`.
- A bid needs any active FakeUSD receipt. No minimum amount exists.

**Failure scenario**

Mallory locks dust 100 times and submits 100 bids when the window opens. Every later bid aborts with `E_WINDOW_FULL`. Mallory then owns the whole bid book and sets the price (A-5). The cost is 100 Ethereum lock transactions and 100 registrations, which is gas and no capital.

The PRD lists this as open question 6 ("DoS prevention (spam bids/commitments)", `prd.md:270`). The code has no answer yet.

**Smallest fix**

Set a minimum collateral per bid. When the window is full, let a new bid replace the bid with the smallest collateral.

---

## A-7 High: the first seller picks the window's timelock and its close time

**Evidence**

- `0x1::ibe_config::register_timelock` is a public entry for any signer. The deadline may be any time up to 15 minutes before the epoch ends (`atomica-aptos` `aptos-move/framework/aptos-framework/sources/ibe_config.move:445-456`).
- `create_auction` stores the caller's `timelock_id` only when it creates the window (`auction.move:484-506`).
- A later seller's `timelock_id` passes `assert_timelock_open` (`:463`) and is then ignored (`:507-513`).
- Nothing ties the timelock deadline to the window's clock time.

**Failure scenario**

Mallory must be the first caller for that window and pair. `create_auction` accepts the next window id as soon as the current one starts, so the race is open to everyone.

1. Mallory registers a timelock that ends in 61 seconds.
2. Mallory creates the window for the next auction with a dust FakeETH lock.
3. Honest sellers join. Their own `timelock_id` is silently dropped.
4. The window stops taking bids after 61 seconds. It settles with no bids.

The auction for that pair and window is gone. The cost is one dust lock and one registration per window.

**Smallest fix**

Derive the deadline from the window id on chain and let the contract register the timelock itself. Then no caller chooses a deadline. Abort when a joining seller passes a `timelock_id` that differs from the window's.

One limit applies. A timelock cannot outlive its chain epoch (Chapter 5, F-4). The contract can register it only in the epoch that holds the window's close. Chapter 2 (S-2) lists what the fix needs.

---

## A-8 High: window ids do not follow the canonical schedule

**Evidence**

- `current_window_id` splits each 43 200 second period at offset 28 500 (`auction.move:353-358`).
- The comment says "Afternoon window fires at offset 58 500 s (16:15 UTC)" (`:350`). An offset inside a 43 200 second period can never be 58 500.
- The comment also says 28 500 s is 07:45 UTC (`:349`). It is 07:55. 07:45 is 27 900 s. The architecture has the same wrong sum (`docs/architecture/v0-architecture.md:73`).
- The real boundaries are 00:00, 07:55, 12:00 and 19:55 UTC. That is four windows a day. None of them starts or ends at 07:45 or at 16:15.
- `create_auction` accepts the current window and the next one (`:456-458`). `submit_bid` never checks the window clock.
- `eth_proof::window_close_secs` and `eth_lock_deadline` use the same split (`eth_proof.move:231-241`). The Ethereum reclaim deadline of every lock is now derived from it.

**Failure scenario**

The canonical spec says auctions close at 07:45 and 16:15 UTC (`docs/specifications/auction-timing.md:11-13`). On chain, the id changes at 07:55, 12:00 and 19:55 instead. The close time that matters is the timelock deadline, which the first seller picks (A-7). So no part of the code enforces the canonical schedule, and the timing spec now documents the wrong split as the rule (`auction-timing.md:45-48`).

The severity rests on the reclaim deadline, not on trading. Every Ethereum lock deadline is `window close + 72 hours` under this formula, and a fix changes those deadlines.

**Smallest fix**

Define the window id from the two daily closes: a 24 hour day with closes at 27 900 s and 58 500 s. Write a Move test that pins the id on both sides of 07:45 and 16:15 UTC. The LockBox computes nothing from the window id, so this change needs no Ethereum redeploy today. It will after E-5 in Chapter 4 is fixed, so fix this first.

---

## A-9 High: `settle` emits no outcome that Ethereum can use

**Evidence**

- The `AuctionOutcome` struct exists (`auction.move:311`). The only code that builds one is a test helper (`:405`).
- `settle` still emits `BidUnopened`, `AuctionSettled` and `SellerSupplySettled` for "the relayer" (`auction.move:1106-1110`, `:1129-1137`, `:1151-1157`).
- The new LockBox releases only on a recorded `AuctionOutcome`.

**Consequence**

On `main` today no auction can pay out on Ethereum. Every lock goes home by `reclaim` 72 hours after its window closes. Funds are safe. The product cannot complete a trade. The unwind issue (194) closes this gap, so it is the most important open issue. Its pull request (213) is open and emits the outcome from `settle` and `unwind`.

---

## A-10 Medium: the seller list of a window has no cap

**Evidence**

- `create_auction` appends to `lock_ids` with no limit (`auction.move:507-513`).
- `refund_expired_window` and `settle` loop over every seller lock (`:822-833`, `:1143-1149`). The planned outcome builder will hash and sort every lock.

**Failure scenario**

Mallory joins a window with several thousand dust FakeETH locks. The refund, and later the outcome builder, run out of gas. The window cannot finish on Aptos. The count that breaks it was not measured.

**Smallest fix**

Cap sellers per window, with a minimum lock size, the same way as bids (A-6).

---

## A-11 Medium: lock registration cost grows with every lock ever registered

**Evidence**

- `claimed_locks` is a `SimpleMap` (`lock_receipt.move:105`). A `SimpleMap` is a vector with a linear scan.
- Every registration scans it (`:206-209`, `:369`) and appends to it (`:265`).
- The `receipts` table already answers the same question with `table::contains`.

**Failure scenario**

The map lives inside one resource. That resource grows by about 34 bytes per lock, and every registration reads and rewrites all of it. At some count `register_ethereum_lock` exceeds the gas limit or the size limit of one write. No new lock can register after that. The count was not measured. Dust locks speed this up.

**Smallest fix**

Delete `claimed_locks`. Use `table::contains(&registry.receipts, lock_id)`.

---

## A-12 Medium: only one pair exists, and the pair bytes are not checked

**Evidence**

- `create_auction` writes a fixed `Pair` of FakeETH and FakeUSD (`auction.move:486-491`).
- `pair_bcs` is any byte string. It is used only as part of the table key (`:364-368`).
- Receipt types are fixed to `FakeETH` for sellers and `FakeUSD` for bidders (`:468`, `:591`).

**Consequences**

- The PRD goal "all trading pairs clear simultaneously" (`prd.md:59`) is not built. One pair is hardcoded.
- Any caller can open extra windows for the same assets by changing the pair bytes. Each is a separate book. That splits liquidity and confuses a UI that lists windows.

**Smallest fix**

Check `pair_bcs` against an allowlist stored at deploy. Add real pair support when a second asset exists.

---

## A-13 Low: dead code and wrong views

- `get_settlement` documents `(clearing_price, total_filled)` and returns `total_supply` (`auction.move:1346-1356`).
- `E_NOT_IMPLEMENTED`, `E_BID_TOO_LOW` and `E_AUCTION_ENDED` are never raised (`:54`, `:56`, `:75`).
- `_mpk_bytes` is an unused entry argument (`:453`).
- `revealed_prices` duplicates `bids[i].price` (`:214`, `:689-697`).
- `found_marginal` is computed and discarded (`:937`, `:983`).
- `compute_rebates` always returns zeros (`:1306-1340`).
- The registry bootstrap in `create_auction` (`:474-478`) can only run in tests. If it ran for a seller other than `@atomica`, the next line would abort.
- `timelock_config.move` stores a `TimelockConfig` resource that no code reads. Its views return constants. Its 67 percent threshold is not the fork's real threshold (Chapter 5).
- `registry.move` creates a resource account and a user table. No function ever writes a user.

Each item is small. Together they hide the real rules from a reader, which is a security cost in a contract this size.

---

## What is solid

- Receipt ownership comes from the proven Ethereum address, not from the carrier (`lock_receipt.move:202`, `eth_proof.move:148-161`).
- `claim` and `release` are package-only, so an outside module cannot freeze a window (`lock_receipt.move:287`, `:321`).
- One lock gives one receipt, however many blocks it is proven at (`lock_receipt.move:205-209`).
- State roots come only from validator-certified headers. No entry function writes them (`eth_proof.move:122-125`).
- The storage key, the LockBox address and the token are all derived on chain, never taken from the caller (`eth_proof.move:258-291`).
- The Merkle Patricia verifier binds every node to its parent by hash and requires the whole key to be consumed (`mpt.move:71-80`, `:115`). I found no way to prove a value that is not in the trie.
- The bid associated data binds a ciphertext to the chain, epoch, timelock, window, bidder and deadline (`auction.move:522-535`). A copied ciphertext does not verify for another bidder.
- Commitments bind price, salt and the same associated data, so nobody can change a price after the key is public (`auction.move:543-553`).
- Double settle, settle after refund and refund after settle all abort (`auction.move:816-817`, `:1066-1067`).
- `mint_from_lock` is retired and aborts (`fake_eth.move:85`), so a receipt can no longer become an unbacked Aptos token.
