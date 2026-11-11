# UI scout report (atomica-web-components, atomica-demo)

Partition: `source/atomica-web-components/**` and `source/atomica-demo/**` in `~/tmp/superfield-worktrees/atomica/scout-remediation-seams`.

The first wave left a marker script (`~/tmp/atomica-scout-2026-11-11/ui-scout/apply-markers.mjs`) that was never applied, plus six new files. I fixed its one stale line number, applied it, corrected its wrong claims (13-bid-history does run in CI; pull request 213 already resizes most bids), added missed sites, and moved four markers so the stubs merge cleanly with pull request 213 head `b3b7dbc`.

Browser test chunks (`.github/workflows/test-web.yaml`, anvil tier and docker tier): component = `tests/AccountStatus`, `tests/TxButton.skip-submit`; faucet-wallet = 01, 02; auction = 07, 08; bid-settle = 09, 10; settle-100-bids = 16; claim-reclaim-fees = 11, 12, 13; happy-path = 14. No chunk runs 03 to 06, 12a, 12b, 15, `selectors.test.tsx`, `wallet-mock-smoke.test.tsx` or the other top-level browser files.

## 216 Invalid bids: collateral covers price times quantity, bounded quantity and price

**Sites marked:** 24 (ADD 0, EDIT 20, REMOVE 0, TEST 4, DOC 0)

**Sites:**
- `source/atomica-web-components/src/components/AuctionBidder.tsx:75` EDIT — quantity zero and quantity above the window supply now abort submit_bid; this field takes wei, defaults to 1 and has no check.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:188` EDIT — quantity zero or above supply aborts here with the new codes; the status line shows the raw abort.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:163` EDIT — an invalid bid no longer aborts this call; show the validity flag of the bid view.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:358` EDIT — show whether an opened bid is valid.
- `source/atomica-web-components/tests/integration/09-submit-bid.test.tsx:82` EDIT — 1 FakeETH at this price needs 2,000,000 FakeUSD of collateral and the helper locks 500; the bid would be invalid once opened (this file never opens it, and pull request 213 does not shrink this quantity).
- `source/atomica-web-components/tests/integration/09-submit-bid.test.tsx:187` EDIT — the bid view gains a validity flag; assert it.
- `source/atomica-web-components/tests/integration/09-submit-bid.test.tsx:291` TEST — submit_bid with quantity zero aborts with the new zero-quantity code
- `source/atomica-web-components/tests/integration/09-submit-bid.test.tsx:292` TEST — submit_bid with quantity above the window supply aborts with the new over-supply code
- `source/atomica-web-components/tests/integration/10-settle.test.tsx:79` EDIT — on main the winner bids the whole 10 FakeETH supply, far above its 500 FakeUSD collateral; pull request 213 already shrinks SUPPLY to 0.0001 FakeETH (200 FakeUSD at 2_000_000), but LOSE_QUANTITY stays 1 FakeETH, which is above that supply, so the loser's submit_bid aborts with the new over-supply code; shrink LOSE_QUANTITY too.
- `source/atomica-web-components/tests/integration/10-settle.test.tsx:155` EDIT — after pull request 213 this quantity (1 FakeETH) is above the window supply (0.0001 FakeETH) and aborts with the new over-supply code.
- `source/atomica-web-components/tests/integration/10-settle.test.tsx:349` TEST — an under-collateralized bid opens without abort, reads invalid, takes no fill, and settle returns its whole collateral to its depositor
- `source/atomica-web-components/tests/integration/11-claim-and-reclaim.test.tsx:72` EDIT — on main, 1 FakeETH at this price needs 2,000,000 FakeUSD and the 500 FakeUSD default makes the bid invalid; pull request 213 already shrinks BID_QUANTITY to 0.0001 FakeETH (200 FakeUSD), so after 213 the bid stays valid.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:175` EDIT — on main 1 FakeETH at 2_000_000 needs 2,000,000 FakeUSD of collateral and 500 makes the bid invalid; pull request 213 already shrinks BID_QUANTITY to 0.0001 FakeETH (200 FakeUSD).
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:185` EDIT — COLLATERAL_AMOUNT above must be at least quoteForFill(BID_QUANTITY, BID_PRICE), and the 10,000 FakeUSD mint cap limits it (marker sits here to avoid a merge conflict with pull request 213).
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:636` EDIT — assert that the opened bid reads valid.
- `source/atomica-web-components/tests/integration/16-settle-100-bids.test.tsx:69` EDIT — COLLATERAL above: on main each bid needs quoteForFill(0.1 FakeETH, price), up to 199,000 FakeUSD, against 50 FakeUSD locked; pull request 213 already shrinks BID_QUANTITY to 0.00002 FakeETH (at most 39.8 FakeUSD), so after 213 every bid is valid.
- `source/atomica-web-components/tests/integration/16-settle-100-bids.test.tsx:223` EDIT — also assert the clearing price equals the lowest valid winning price.
- `source/atomica-web-components/tests/integration/16-settle-100-bids.test.tsx:247` EDIT — 50 winners only if every bid is valid; with main's quantities all 100 bids would be invalid, with pull request 213's quantities all are valid.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:282` EDIT — DEFAULT_COLLATERAL above must cover quoteForFill(quantity, price) of the bid that uses it; 500 FakeUSD covers no bid of main's tests, and pull request 213 keeps 500 but shrinks every bid quantity so it does.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:615` EDIT — callers must lock at least quoteForFill(quantity, price); the mint is amount times 20 and FakeUSD mint is capped at 10,000, so amount cannot exceed 500 without changing the multiplier.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:646` EDIT — mints amount times count in one call; 100 locks share the 10,000 FakeUSD mint cap, so each bid has at most 100 FakeUSD of collateral.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:706` EDIT — quantity must be above zero and at most the window supply, and the collateral must cover price times quantity, or the bid is invalid at opening.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:756` EDIT — an under-collateralized or zero-price bid opens without abort and reads invalid; this helper checks only the commitment.
- `source/atomica-web-components/tests/unit/AuctionRevealer.test.tsx:242` TEST — an opened bid that the chain marks invalid is shown as invalid

**Issue text corrections:**
- The issue names only `helpers/auction-setup.ts` in this partition. The browser tests that carry bid sizes are 09, 10, 11, 14 and 16, plus `AuctionBidder.tsx` (quantity field with no check) and `AuctionRevealer.tsx` (shows opened bids, no validity flag).
- Pull request 213 (commit `b3b7dbc`, newer than the scout diff snapshot) already resizes every opened bid so its `quote_for_fill` fits the 500 FakeUSD collateral: 0.0001 FakeETH in 10, 11, 12 and 14, 0.00002 FakeETH in 16. After 213 the collateral half of this issue needs no test change.
- After 213, `10-settle.test.tsx` locks a supply of 0.0001 FakeETH but the loser still bids `LOSE_QUANTITY` = 1 FakeETH. The new over-supply abort makes that `submit_bid` fail. The issue's test plan expects bid-settle to pass unchanged. It will not.
- `09-submit-bid.test.tsx` keeps 1 FakeETH at 2_000_000 against 500 FakeUSD. It never opens the bid, so it stays green, but it is an invalid bid by the new rule.

**Hidden costs:**
- No browser test asserts the new bid view validity flag or the invalid-bid event. The planned cases are `it.todo` in 09, 10 and `tests/unit/AuctionRevealer.test.tsx`.
- FakeUSD `MAX_MINT_AMOUNT` is 10,000 USD per call. `lockBidCollateral` mints 20x the amount and `lockBidCollaterals` mints amount times count in one call. That caps collateral at 500 FakeUSD per bid, or 100 FakeUSD per bid in the 100-bid test.

**Cross-issue pressure:**
- Pull request 213 rewrites the constant blocks of 10, 11, 14 and 16 and `DEFAULT_COLLATERAL`. Markers were placed so a merge with 213 head `b3b7dbc` has no conflict (checked with `git merge-tree`).
- The price unit issue (217) changes every price these sizes are computed from. Land 217 first, then size quantities once.
- The caps issue (218) adds a minimum seller lock that 213's shrunken supplies break (see 218).

**CI:**
- Browser Tests (bid-settle) runs 09 and 10. Browser Tests (claim-reclaim-fees) runs 11 and 13. Browser Tests (happy-path) runs 14. Browser Tests (settle-100-bids) runs 16. Each chunk has an anvil tier and a docker tier in `.github/workflows/test-web.yaml`.
- `tests/unit/AuctionRevealer.test.tsx` runs in Unit Tests (atomica-sdk, atomica-web-components).

**Questions answered or sharpened by the code:**
- The UI has no client-side collateral warning (out of scope). A bidder who under-collateralizes learns it only at opening.

## 217 One price unit across Move, SDK and UI

**Sites marked:** 71 (ADD 0, EDIT 61, REMOVE 1, TEST 9, DOC 0)

**Stubs added:**
- `source/atomica-web-components/tests/unit/price-display.test.tsx` new file with `it.todo` cases for BidHistory, SettlementStatus, WithdrawWinnings and AuctionRevealer.
- `source/atomica-web-components/tests/unit/SettleButton.test.tsx` new file; its first todo is the `$2000` SettleButton case.

**Sites:**
- `source/atomica-web-components/src/components/AuctionBidder.tsx:81` EDIT — price input state; the text goes through the SDK parsePrice (whole USD per whole base token).
- `source/atomica-web-components/src/components/AuctionBidder.tsx:149` EDIT — price parse; use the SDK parsePrice, which throws on empty, signed, decimal, zero and above u64.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:151` EDIT — price comparison; parsePrice makes it redundant, and a unit test expects the word positive in its message.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:200` EDIT — the stored price changes unit with the input.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:355` EDIT — price input; type number accepts decimals that parsePrice rejects, and the label must say whole USD per whole FakeETH.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:45` EDIT — while the field exists, its text goes through parsePrice.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:80` EDIT — price parse (BigInt of the text); use parsePrice while the field exists.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:148` EDIT — price input in whole USD, while it exists.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:146` EDIT — prices formatted to text as raw integers; this file is missing from the price unit issue's touchpoints.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:173` EDIT — prices parsed from text with BigInt.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:357` EDIT — price shown as a raw integer; route it through formatPrice.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:374` EDIT — price input (comma-separated raw integers) until on-chain decryption removes it.
- `source/atomica-web-components/src/components/BidHistory.tsx:10` EDIT — the unit comment becomes whole USD per whole base token.
- `source/atomica-web-components/src/components/BidHistory.tsx:33` REMOVE — formatUsd divides by 1e6; replace it with the SDK formatPrice.
- `source/atomica-web-components/src/components/BidHistory.tsx:91` EDIT — price display; formatPrice already returns the dollar sign.
- `source/atomica-web-components/src/components/ClaimButton.tsx:3` EDIT — line 102 passes the clearing price to submitClaim as a FakeETH amount; moot once the file is deleted.
- `source/atomica-web-components/src/components/ReleaseButton.tsx:21` EDIT — any price shown beside a lock goes through the SDK formatPrice.
- `source/atomica-web-components/src/components/SellFlow/steps/Step2Lock.tsx:20` EDIT — price parsed as micro-dollars (parseUnits with 6 decimals); the unit is whole USD through parsePrice, while the field exists.
- `source/atomica-web-components/src/components/SellFlow/steps/Step2Lock.tsx:57` EDIT — price input in whole USD, while it exists.
- `source/atomica-web-components/src/components/SellFlow/steps/Step7Auction.tsx:34` EDIT — price display divides by 1e6; use formatPrice while it exists.
- `source/atomica-web-components/src/components/SellFlow/steps/Step8Monitor.tsx:113` EDIT — price display divides by 1e6.
- `source/atomica-web-components/src/components/SettleButton.tsx:68` EDIT — result.clearingPrice is whole USD per whole base token; it is stored here and passed to onSettled unchanged.
- `source/atomica-web-components/src/components/SettleButton.tsx:150` EDIT — clearing price display divides by 1e6; use the SDK formatPrice.
- `source/atomica-web-components/src/components/SettlementStatus.tsx:140` EDIT — clearing price shown as a raw integer; use formatPrice (the SDK unwind issue (195) also rewrites this panel).
- `source/atomica-web-components/src/components/WithdrawWinnings.tsx:60` EDIT — clearing price shown as a raw integer; use formatPrice (the SDK unwind issue (195) also rewrites this panel).
- `source/atomica-web-components/src/hooks/useBidHistory.ts:21` EDIT — clearingPrice is persisted in localStorage in the old unit; entries written before the change display a million times off unless they are migrated or cleared.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:73` EDIT — holds micro-dollars today (Step2Lock parses with 6 decimals).
- `source/atomica-web-components/src/storage/bidStorage.ts:1` EDIT — the stored bid price changes unit (this comment says USD micro-units, AuctionBidder stores whole USD); values already in localStorage are not migrated.
- `source/atomica-web-components/tests/SettlementStatus.test.tsx:43` EDIT — clearingPrice fixture 1000; this browser-mode file runs in no CI job, so the $2000 case goes in tests/unit/price-display.test.tsx.
- `source/atomica-web-components/tests/WithdrawWinnings.test.tsx:71` EDIT — this asserts the raw 1000; it becomes $1000 through formatPrice.
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:56` EDIT — a price constant (100 raw units, shown as $0.00 below).
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:239` EDIT — it asserts $0.00 for a price of 100 raw units.
- `source/atomica-web-components/tests/integration/08-auction-monitor.test.tsx:53` EDIT — price constant in micro-dollar style.
- `source/atomica-web-components/tests/integration/09-submit-bid.test.tsx:81` EDIT — bid 2000 whole USD, not 2_000_000.
- `source/atomica-web-components/tests/integration/09-submit-bid.test.tsx:242` EDIT — this types the price into the bidder screen.
- `source/atomica-web-components/tests/integration/10-settle.test.tsx:7` EDIT — header prices read 2.00 and 1.50; they become 2000 and 1500 whole USD.
- `source/atomica-web-components/tests/integration/10-settle.test.tsx:78` EDIT — whole-USD prices (2000 and 1500); the $2.00 expectations below become $2000.
- `source/atomica-web-components/tests/integration/10-settle.test.tsx:260` EDIT — the displayed clearing price becomes $2000.
- `source/atomica-web-components/tests/integration/10-settle.test.tsx:309` EDIT — the displayed clearing price becomes $2000.
- `source/atomica-web-components/tests/integration/10-settle.test.tsx:342` EDIT — the bid history price becomes $2000.
- `source/atomica-web-components/tests/integration/11-claim-and-reclaim.test.tsx:71` EDIT — bid 2000 whole USD.
- `source/atomica-web-components/tests/integration/11-claim-and-reclaim.test.tsx:236` EDIT — this compares a FakeETH balance change with a price.
- `source/atomica-web-components/tests/integration/12a-bid-storage.test.tsx:26` EDIT — stored prices in micro-dollar style.
- `source/atomica-web-components/tests/integration/13-bid-history.test.tsx:116` EDIT — 100_000_000 displays as $100.00 today; record 100 and expect $100 (Browser Tests claim-reclaim-fees chunk runs this file).
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:174` EDIT — bid 2000 whole USD and expect $2000; size the collateral with quoteForFill.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:613` EDIT — price text shown by AuctionRevealer.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:695` EDIT — this expects BID_PRICE_USD, which becomes $2000.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:723` EDIT — line 737 compares a FakeETH balance change with a price.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:809` EDIT — the bid history price becomes $2000.
- `source/atomica-web-components/tests/integration/16-settle-100-bids.test.tsx:62` EDIT — price ladder in whole USD (for example 1000 plus 10 per bid).
- `source/atomica-web-components/tests/integration/16-settle-100-bids.test.tsx:154` EDIT — price ladder; PRICE_STEP and its base move to whole USD.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:283` EDIT — DEFAULT_COLLATERAL above: size it with quoteForFill at whole-USD prices; FakeUSD mint is capped at 10,000 per call and lockBidCollateral mints amount times 20, so 500 is also the ceiling.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:707` EDIT — price is whole USD per whole FakeETH.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:835` EDIT — the clearing price read from get_auction is whole USD.
- `source/atomica-web-components/tests/integration/selectors.test.tsx:348` EDIT — price fixture in micro-dollar style.
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:120` EDIT — parsePrice rejects 0; the assert on the word positive depends on its message.
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:136` EDIT — this types 200 and expects 200n; add the 2000 case.
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:206` TEST — typing 2000 in the price field makes sealBid receive 2000n
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:207` TEST — a price of 2000.5, -1 or an empty field shows an error and neither seals nor submits
- `source/atomica-web-components/tests/unit/AuctionRevealer.test.tsx:119` EDIT — it types the cleartext prices 110, 105, 95.
- `source/atomica-web-components/tests/unit/AuctionRevealer.test.tsx:186` EDIT — it asserts the text price 200.
- `source/atomica-web-components/tests/unit/SellFlow.test.tsx:117` EDIT — the minPrice fixture 2_000_000_000 is micro-dollars.
- `source/atomica-web-components/tests/unit/SettleButton.test.tsx:15` TEST — renders a clearing price of 2000n as $2000
- `source/atomica-web-components/tests/unit/bidStorage.test.ts:24` TEST — a stored price is read back in whole USD per whole base token
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:180` EDIT — the minPrice fixture is micro-dollars.
- `source/atomica-web-components/tests/unit/price-display.test.tsx:17` TEST — BidHistory renders a recorded clearing price of 2000n as $2000
- `source/atomica-web-components/tests/unit/price-display.test.tsx:20` TEST — SettlementStatus renders a settlement event with clearing price 2000n as $2000
- `source/atomica-web-components/tests/unit/price-display.test.tsx:23` TEST — WithdrawWinnings renders a settlement event with clearing price 2000n as $2000
- `source/atomica-web-components/tests/unit/price-display.test.tsx:26` TEST — AuctionRevealer lists a decrypted bid of 2000n as $2000
- `source/atomica-web-components/tests/unit/price-display.test.tsx:28` TEST — no component divides a price by one million
- `source/atomica-web-components/tests/useBidHistory.test.tsx:94` EDIT — recorded price fixture in micro-dollar style.

**Issue text corrections:**
- `AuctionRevealer.tsx` is missing from the touchpoints. It formats decrypted prices as raw integers (`setCleartextsRaw`), parses typed prices with `BigInt`, and lists bids as `price N`.
- `AuctionCreator.tsx` parses `minPrice` with `BigInt` and is missing from the touchpoints (only 241 names it).
- `storage/bidStorage.ts` documents the stored price as USD micro-units. `AuctionBidder` stores whole dollars today. Old localStorage values are not migrated.
- `hooks/useBidHistory.ts` persists `clearingPrice` to localStorage. Entries written before the change render a million times off.
- `tests/integration/07-create-auction.test.tsx` asserts `$0.00` for `MIN_PRICE` = 100. `tests/integration/13-bid-history.test.tsx` records 100_000_000 and expects `$100.00`. Neither is in the touchpoints.
- `ClaimButton.tsx` passes the clearing price to `submitClaim` as a FakeETH amount. The UI happy path issue (236) deletes it.
- `tests/SettlementStatus.test.tsx` and `tests/WithdrawWinnings.test.tsx` run in no CI job (exemptions list). The SettlementStatus and WithdrawWinnings acceptance tests must live in a `tests/unit` file to count.
- Pull request 213 already writes 'USD per whole FakeETH' in test comments but keeps the value 2_000_000. After 213 the tests bid two million dollars per FakeETH, and the UI shows `$2.00`.

**Hidden costs:**
- About 70 sites in this partition. Every price display and every stored price changes. Users with browser storage from an older build see wrong history until it is cleared.
- The bidder price input is `type=number`, which accepts decimals that `parsePrice` rejects. The label must say whole USD per whole FakeETH.

**Cross-issue pressure:**
- Do this before the bid validity issue (216) and the caps issue (218), so test sizes are computed once.
- The reserve price issue (241) deletes four of the price sites. If 241 lands first, 217 has less to do.
- The SDK unwind issue (195) rewrites SettlementStatus and WithdrawWinnings. Coordinate the formatPrice call with it.

**CI:**
- New `tests/unit/*.test.tsx` files run in Unit Tests (atomica-sdk, atomica-web-components) with no workflow edit (`vitest.unit.config.ts` includes `tests/unit/**`).
- 10 and 13 assert displayed prices in Browser Tests (bid-settle) and (claim-reclaim-fees). 14 asserts `$2.00` in Browser Tests (happy-path).

**Questions answered or sharpened by the code:**
- The SDK `formatPrice` and `parsePrice` stubs exist in the SDK partition (`source/atomica-sdk/src/price.ts`). No UI file imports them yet, by design.

## 218 Caps and minimum lock sizes per window

**Sites marked:** 11 (ADD 1, EDIT 9, REMOVE 0, TEST 1, DOC 0)

**Stubs added:**
- `tests/integration/helpers/auction-setup.ts` `joinWindowAsSellers(fixture, aptosClient, operator, window, count, lockAmount): Promise<string[]>` — fills a window to the seller cap.

**Sites:**
- `source/atomica-web-components/src/components/AuctionBidder.tsx:89` EDIT — a collateral below the new minimum locks on Ethereum and then aborts on Aptos, so the lock waits for reclaim; read the SDK limits view reader before the lock.
- `source/atomica-web-components/src/components/SellFlow/steps/Step2Lock.tsx:17` EDIT — refuse an amount below the minimum seller lock here, before the Ethereum lock.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:286` EDIT — a lock below the new minimum, or a seller lock past the cap, locks on Ethereum and then aborts in create_auction; pre-check with the SDK limits view reader, or the lock waits for reclaim.
- `source/atomica-web-components/tests/integration/10-settle.test.tsx:145` EDIT — pull request 213 sets SUPPLY to 0.0001 FakeETH, below the proposed 0.01 FakeETH minimum seller lock, so create_auction aborts; raise SUPPLY and size collateral with whole-USD prices (217).
- `source/atomica-web-components/tests/integration/16-settle-100-bids.test.tsx:59` EDIT — fill the same window to the seller cap as well (proposed 100 seller locks).
- `source/atomica-web-components/tests/integration/16-settle-100-bids.test.tsx:70` EDIT — COLLATERAL above (50 FakeUSD per bid) must stay at or above the minimum collateral.
- `source/atomica-web-components/tests/integration/16-settle-100-bids.test.tsx:148` EDIT — pull request 213 sets SUPPLY to 0.001 FakeETH (50 x 0.00002), below the proposed 0.01 FakeETH minimum seller lock, so create_auction aborts.
- `source/atomica-web-components/tests/integration/16-settle-100-bids.test.tsx:255` TEST — a window with the maximum seller locks and 100 bids settles in one transaction and its gas used is below the maximum transaction gas
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:129` EDIT — the default 10 FakeETH lock must stay at or above the minimum seller lock.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:284` EDIT — DEFAULT_COLLATERAL above must stay at or above the minimum bid collateral.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:904` ADD — lock, register and join count more seller locks into an existing window, to fill it to the seller cap.

**Issue text corrections:**
- Pull request 213 sets the seller supply to 0.0001 FakeETH in `10-settle.test.tsx` and 0.001 FakeETH in `16-settle-100-bids.test.tsx`. Both are below the proposed 0.01 FakeETH minimum seller lock, so `create_auction` aborts in bid-settle and settle-100-bids.
- `useSellFlow.ts` (lockEth) and `AuctionBidder.tsx` (lock) lock on Ethereum before Aptos sees the amount. A lock below the minimum is accepted by LockBox and then refused by Aptos, so it waits 72 hours for reclaim. The issue puts UI display out of scope but this is a fund-stuck path, not a display.

**Hidden costs:**
- Filling 100 seller locks in the settle-100-bids chunk adds 100 Ethereum locks, 100 register transactions and 100 `create_auction` calls. That chunk took about 10.5 of its 45 minutes on main.
- The FakeUSD 10,000 mint cap still bounds per-bid collateral at 100 FakeUSD in the 100-bid test. A 10 FakeUSD minimum fits.

**Cross-issue pressure:**
- Land after the price unit issue (217) and the bid validity issue (216), so supplies and quantities are resized once.
- `createLiveWindow` is also edited by 224, 241 and 243.

**CI:**
- Browser Tests (settle-100-bids, anvil) and (settle-100-bids, docker) run 16. Browser Tests (bid-settle) runs 10.

**Questions answered or sharpened by the code:**
- With 213's tiny supplies, the 0.01 FakeETH minimum forces the tests back to larger supplies, which need whole-USD prices (217) to stay within the mint cap.

## 219 Live cross-chain round-trip test

**Sites marked:** 1 (ADD 0, EDIT 1, REMOVE 0, TEST 0, DOC 0)

**Sites:**
- `source/atomica-web-components/tests/integration/fixtures/dual-chain.ts:61` EDIT — the dual-chain testnet will deploy AptosLightClient and a LockBox wired to it; expose the light client address here.

**Issue text corrections:**
- No touchpoint is in this partition. The browser fixture reads contract addresses from the dual-chain testnet, so it will need the light client address too, for the UI release test of 236.

**Cross-issue pressure:**
- The UI happy path issue (236) needs the same LockBox-with-light-client deploy for its release browser test.

**CI:**
- `fixtures/dual-chain.ts` is used by every Browser Tests chunk.

## 220 Window ids follow the 07:45 and 16:15 UTC closes

**Sites marked:** 7 (ADD 0, EDIT 7, REMOVE 0, TEST 0, DOC 0)

**Sites:**
- `source/atomica-web-components/src/components/AuctionBidder.tsx:107` EDIT — no code change: the window id follows the SDK currentWindowId, taken from the client clock.
- `source/atomica-web-components/src/components/auctionUtils.ts:5` EDIT — second copy of the 07:45 and 16:15 UTC closes (already correct); derive it from the SDK windowCloseSecs so the UI and the chain cannot drift.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:299` EDIT — no code change: the window id follows the SDK currentWindowId on the client clock.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:438` EDIT — the fallback window id from the client clock follows the SDK formula.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:297` EDIT — formula copy (43200 and 28500); switch to the 07:45 and 16:15 UTC formula or call the SDK currentWindowId with the chain clock; the comment above writes 28 500 with a space, which the issue's grep misses.
- `source/atomica-web-components/tests/unit/SellFlow.resume.test.tsx:34` EDIT — 83075 and 1_794_700_800 are a window id and a deadline of the old formula; the mock keeps this green, but pick a pair that is consistent under the new formula.
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:29` EDIT — old-formula fixture pair 83075 and 1_794_700_800 (mock values only).

**Issue text corrections:**
- `helpers/auction-setup.ts` writes the split as `28 500` with a space in its comment. The acceptance grep `28500\|28_500` misses it.
- `src/components/auctionUtils.ts` holds a second copy of the schedule (`AUCTION_WINDOWS`). It already says 07:45 and 16:15. The issue does not mention it. Derive it from the SDK so it cannot drift.
- `tests/unit/SellFlow.resume.test.tsx` and `tests/unit/hooks/sell-flow-state.test.tsx` use window 83075 and deadline 1_794_700_800 only as mock values. They stay green. A consistent new pair is cosmetic.
- `AuctionBidder.tsx` and `useSellFlow.ts` take the window id from the client clock through the SDK `currentWindowId`. No code change, but a wrong client clock now picks a wrong window.

**Cross-issue pressure:**
- The LockBox deadline issue (221) freezes this formula. Land 220 first.

**CI:**
- The formula copy is used by `createLiveWindow` in every chunk that creates a window: auction, bid-settle, settle-100-bids, claim-reclaim-fees and happy-path.

## 221 LockBox computes the lock deadline from the window id

**Sites marked:** 18 (ADD 0, EDIT 18, REMOVE 0, TEST 0, DOC 0)

**Sites:**
- `source/atomica-demo/scripts/deploy-lockbox-real.ts:157` EDIT — LockBox.lock loses the deadline argument.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:108` EDIT — lockBinding and lockFakeUsd lose the caller deadline; a window id from a wrong client clock now reverts in LockBox.lock.
- `source/atomica-web-components/src/hooks/usePoolEvents.ts:20` EDIT — private copy of the Locked event; the event keeps its deadline field, so no change is needed unless the event changes.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:300` EDIT — the binding loses the caller deadline; LockBox.lock reverts for a closed window or one more than one ahead, so a wrong client clock fails here.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:311` EDIT — the Locked event still carries the computed deadline; no change if lockFromReceipt keeps the field.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:357` EDIT — lockBinding spreads a deadline into the proof input; follow the SDK shape.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:367` EDIT — the proof input takes the lock fields; follow the SDK lockBinding shape once the caller deadline goes.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:406` EDIT — the payload drops the deadline argument inside the SDK; no change here.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:499` EDIT — reclaim still takes the full lock struct with its deadline; follow the SDK lockBinding shape.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:508` EDIT — reclaim passes the full Lock struct; its deadline is the computed lockDeadline(windowId), which lockBinding must still return.
- `source/atomica-web-components/src/hooks/useWindowRelease.ts:38` EDIT — auctionKey drops the deadline, so the key this hook reads outcomes under changes with the LockBox redeploy.
- `source/atomica-web-components/tests/integration/15-pool-events.test.tsx:42` EDIT — private copy of the lock ABI with the deadline argument; this file is missing from the issue's touchpoints and runs in no CI job.
- `source/atomica-web-components/tests/integration/15-pool-events.test.tsx:53` EDIT — lock takes no deadline argument.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:89` EDIT — the proof still carries the computed deadline, but register_ethereum_lock no longer takes it.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:252` EDIT — drop proof.deadline from the arguments.
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:43` EDIT — the lockBinding mock returns a deadline.
- `source/atomica-web-components/tests/unit/SellFlow.resume.test.tsx:35` EDIT — the lockBinding mock returns a deadline.
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:30` EDIT — the lockBinding and lockFromReceipt mocks carry a deadline; the asserts on lockFakeEth, the proof input and reclaimLock below repeat it.

**Issue text corrections:**
- Missed: `tests/integration/15-pool-events.test.tsx` keeps a private LockBox ABI with the deadline argument and calls `lock` with `b.deadline` (this file runs in no CI job).
- Missed: `src/hooks/usePoolEvents.ts` keeps a private `Locked` event ABI. The event keeps its deadline field, so it needs no change.
- Missed: the `lockBinding` mocks in `tests/unit/AuctionBidder.test.tsx`, `SellFlow.resume.test.tsx` and `hooks/sell-flow-state.test.tsx` return a deadline, and `sell-flow-state` asserts it in the lock, proof and reclaim calls.
- `useSellFlow.ts` passes `...lockBinding(...)` into the proof input and into `reclaimLock`. Reclaim still takes the full Lock struct with its deadline. `lockBinding` must keep returning the computed deadline, or both calls break.

**Hidden costs:**
- A LockBox redeploy changes the address the fixture and the demo scripts read. `source/atomica-demo/scripts/deploy-lockbox-real.ts` calls `lock` with the deadline.

**Cross-issue pressure:**
- Ship with the leaf issue (222) and the SDK unwind issue (195) in one LockBox redeploy.

**CI:**
- Unit Tests (atomica-sdk, atomica-web-components) runs the three mocked unit files. Browser Tests (happy-path) locks through the testnet browser command, not the SDK `lock` call.

## 222 LockBox pays every leaf

**Sites marked:** 4 (ADD 0, EDIT 3, REMOVE 0, TEST 1, DOC 0)

**Sites:**
- `source/atomica-web-components/src/components/ReleaseButton.tsx:20` EDIT — releaseByOutcome will revert on an unpayable leaf, so this button needs the reclaimUnpayable fallback, which issue 222 puts out of scope and no other issue owns.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:500` EDIT — reclaim keeps its rule; a lock whose leaf is unpayable needs reclaimUnpayable, which no UI calls.
- `source/atomica-web-components/src/hooks/useWindowRelease.ts:37` EDIT — a leaf may pay less than the lock amount (the remainder goes to the depositor), and an unpayable leaf needs reclaimUnpayable instead of releaseByOutcome.
- `source/atomica-web-components/tests/unit/ReleaseButton.test.tsx:30` TEST — falls back to reclaimUnpayable when the leaf of a lock is unpayable

**Issue text corrections:**
- The issue puts UI buttons out of scope, and the SDK unwind issue (195) only owns `reclaim` after the deadline. No issue owns a UI call to `reclaimUnpayable`. The release button of 236 needs it as a fallback, and the sell flow cancel path calls only `reclaimLock`.

**Cross-issue pressure:**
- The UI happy path issue (236) release loop must branch on an unpayable leaf.

**CI:**
- The planned case is an `it.todo` in `tests/unit/ReleaseButton.test.tsx` (Unit Tests job).

**Questions answered or sharpened by the code:**
- Who owns the UI for `reclaimUnpayable`? Recommend adding it to 236 or 195.

## 224 Pair allowlist for auction windows

**Sites marked:** 30 (ADD 1, EDIT 26, REMOVE 0, TEST 3, DOC 0)

**Stubs added:**
- `tests/integration/helpers/auction-setup.ts` `allowTestPair(pairBcs: Uint8Array): Promise<void>` — calls a deployer-signed browser command that does not exist yet.

**Sites:**
- `source/atomica-demo/scripts/deploy-lockbox-real.ts:158` EDIT — bind the lock to the launch pair, not to empty bytes.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:77` EDIT — default to the SDK launch pair constant instead of empty bytes.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:109` EDIT — bind the lock to the launch pair bytes, not to new Uint8Array(0).
- `source/atomica-web-components/src/components/AuctionBidder.tsx:157` EDIT — fall back to the launch pair, not to empty bytes.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:329` EDIT — the placeholder says leave empty for default; the default becomes the launch pair.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:42` EDIT — default to the SDK launch pair constant.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:75` EDIT — fall back to the launch pair; empty bytes are not on the allowlist.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:122` EDIT — the hint text and the empty fallback change to the launch pair.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:39` EDIT — an empty input must mean the launch pair, not empty bytes.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:103` EDIT — SELL_PAIR_BCS becomes the SDK launch pair constant; a lock made with the empty bytes cannot join a window.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:368` EDIT — SELL_PAIR_BCS becomes the launch pair, so this binding and the lock stay equal.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:444` EDIT — use the launch pair.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:509` EDIT — the reclaim binding must use the same pair bytes as the lock, so change both together.
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:58` EDIT — these bytes are not on the allowlist; use the SDK launch pair, and keep unlisted bytes only for the new abort case.
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:357` TEST — create_auction through the UI with the SDK launch pair constant creates the window
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:358` TEST — create_auction with bytes that are not on the allowlist fails with the new abort code
- `source/atomica-web-components/tests/integration/08-auction-monitor.test.tsx:55` EDIT — use the launch pair.
- `source/atomica-web-components/tests/integration/09-submit-bid.test.tsx:85` EDIT — use the launch pair.
- `source/atomica-web-components/tests/integration/10-settle.test.tsx:84` EDIT — use the launch pair.
- `source/atomica-web-components/tests/integration/11-claim-and-reclaim.test.tsx:76` EDIT — PAIR_BCS above: use the launch pair (marker sits below it to avoid a merge conflict with pull request 213).
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:420` EDIT — the seller lock and the collateral lock are bound to the empty pair; bind them to the launch pair.
- `source/atomica-web-components/tests/integration/15-pool-events.test.tsx:54` EDIT — bind to the launch pair instead of new Uint8Array(0) above.
- `source/atomica-web-components/tests/integration/16-settle-100-bids.test.tsx:71` EDIT — use the launch pair.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:130` EDIT — the lock is bound to the empty pair (testLockBinding); bind it to the launch pair (pull request 213 adds a pairBcs parameter here).
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:276` EDIT — empty bytes are not on the allowlist; use the SDK launch pair constant (each test file starts its own chain, so one pair is enough).
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:546` EDIT — options.pairBcs must be on the allowlist.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:889` ADD — add a test pair to the allowlist through a deployer-signed browser command (the command belongs to the docker testnet package and does not exist yet).
- `source/atomica-web-components/tests/unit/AuctionCreator.test.tsx:165` TEST — the pair defaults to the SDK launch pair constant
- `source/atomica-web-components/tests/unit/AuctionRevealer.test.tsx:97` EDIT — an empty pair input means the launch pair, so expect the SDK launch pair bytes.
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:417` EDIT — pairBcs equals the launch pair, not empty bytes.

**Issue text corrections:**
- Missed: `14-happy-path.test.tsx` uses `TEST_PAIR_BCS` (empty bytes) for its windows and locks. `15-pool-events.test.tsx` and `source/atomica-demo/scripts/deploy-lockbox-real.ts` bind locks to empty bytes. `tests/unit/AuctionRevealer.test.tsx` expects empty bytes.
- `useSellFlow.ts` binds both the lock and the reclaim to `SELL_PAIR_BCS`. They must change together, or an old lock cannot be reclaimed with the new binding.
- Each browser test file starts its own chain in `beforeAll`, so tests do not need private pairs for isolation. Using the launch pair everywhere is enough, and `allowTestPair` is only needed for the unlisted-bytes case.
- Pull request 213 adds a `pairBcs` parameter to `generateEthLockProof`, `lockBidCollateral` and `lockBidCollaterals` and passes each file's `PAIR_BCS`. That already threads the pair through the lock binding.

**Hidden costs:**
- With one launch pair, two `createLiveWindow` calls in one file for one window id join one window, so `total_supply` adds up. `07-create-auction.test.tsx` creates windows in more than one case and must expect that.

**Cross-issue pressure:**
- The create-auction issue (243) edits the same `createLiveWindow`, `createAuctionDirect` and `AuctionCreator` lines. Land 224 first.

**CI:**
- Browser Tests (auction) runs 07 and 08. Every other window-creating chunk changes its `PAIR_BCS`.

## 225 [atomica-aptos] Only the auction package registers a timelock

**Sites marked:** 5 (ADD 0, EDIT 5, REMOVE 0, TEST 0, DOC 0)

**Sites:**
- `source/atomica-web-components/src/components/AuctionCreator.tsx:60` EDIT — this call aborts with E_NOT_REGISTRAR once the validator image has the registrar check.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:452` EDIT — this call aborts with E_NOT_REGISTRAR once the validator image has the registrar check.
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:158` EDIT — this operator registration aborts with E_NOT_REGISTRAR on a validator image with the registrar check.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:448` EDIT — it aborts with E_NOT_REGISTRAR on a validator image with the registrar check.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:363` EDIT — it aborts with E_NOT_REGISTRAR for the operator once the validator image has the registrar check, which breaks every chunk that creates a window unless the product half (243) lands with the same pin bump.

**Issue text corrections:**
- This fork issue has product sites: `AuctionCreator.tsx`, `useSellFlow.ts`, `registerTimelockDirect` in `auction-setup.ts`, and the manual registration in 07 and 14 all register from a user account. On a validator image with the registrar check they abort with `E_NOT_REGISTRAR`.

**Hidden costs:**
- Every Browser Tests chunk that creates a window fails on the new image unless the product half (243) lands with the same pin bump.

**Cross-issue pressure:**
- Ship the validator image bump and 243 in one product pull request.

**CI:**
- All window-creating chunks: auction, bid-settle, settle-100-bids, claim-reclaim-fees, happy-path.

## 228 Auction opens bids from ciphertexts, removing commit and reveal

**Sites marked:** 47 (ADD 1, EDIT 28, REMOVE 14, TEST 4, DOC 0)

**Stubs added:**
- `tests/integration/helpers/auction-setup.ts` `openBidsDirect(aptosClient, sender, window: { windowId, pairBcs }, maxBids: number): Promise<string>`.

**Sites:**
- `source/atomica-web-components/src/components/AuctionBidder.tsx:14` EDIT — this header describes the commitment and the price_le8 || salt32 plaintext; rewrite it for the 8-byte price and the five-argument submit_bid.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:181` EDIT — sealBid returns no commitment and no salt.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:187` EDIT — drop the sealed.commitment argument (five-argument submit_bid).
- `source/atomica-web-components/src/components/AuctionBidder.tsx:202` REMOVE — nothing is stored once the salt is gone.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:2` EDIT — replace submitCleartextAndClear with the SDK openBids; decryptWindowBids stays as a read-only preview.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:12` EDIT — rewrite this flow comment: one permissionless Open bids action, no prices and no salts.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:59` REMOVE — hand-typed cleartext prices and salts.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:132` EDIT — decrypt becomes a preview only; the 8-byte plaintext has no salt and nothing to match against a commitment.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:161` REMOVE — replace with openBids(account, windowId, pairBcs, maxBids), repeated until every bid is opened.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:207` REMOVE — submitCleartextAndClear is deleted from the SDK.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:359` EDIT — the matches-commitment wording goes.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:373` REMOVE — the cleartext price input and the salt input below it.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:403` EDIT — this becomes the Open bids button.
- `source/atomica-web-components/src/index.ts:24` REMOVE — the bid opening exports that the salt issue (235) adds go away with the salt.
- `source/atomica-web-components/src/storage/bidStorage.ts:53` REMOVE — delete BidOpening and the three functions below when the salt and the commitment go.
- `source/atomica-web-components/tests/integration/09-submit-bid.test.tsx:188` EDIT — the commitment field asserted below leaves the bid view.
- `source/atomica-web-components/tests/integration/10-settle.test.tsx:214` EDIT — call open_bids from an account that is not the bidder, with no prices and no salts.
- `source/atomica-web-components/tests/integration/10-settle.test.tsx:219` EDIT — reveal_final has no finalize step any more; assert the cleared state the new view gives.
- `source/atomica-web-components/tests/integration/11-claim-and-reclaim.test.tsx:184` EDIT — open with open_bids.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:154` REMOVE — getSubmitCleartextPayload leaves the SDK; import the open_bids payload builder.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:272` EDIT — step 8b becomes an on-chain open_bids call from a third account.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:542` EDIT — no salt and no commitment come back, and getBidPayload has five arguments.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:567` REMOVE — the bid view has no commitment.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:579` EDIT — replace the decrypt, cleartext and salt assertions and the relayed submit_cleartext_and_clear with one open_bids call.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:631` REMOVE — relayed submit_cleartext_and_clear; replace with open_bids sent by a third account.
- `source/atomica-web-components/tests/integration/16-settle-100-bids.test.tsx:157` EDIT — five-argument getBidPayload with no commitment.
- `source/atomica-web-components/tests/integration/16-settle-100-bids.test.tsx:192` EDIT — open the 100 bids in batches with open_bids and log the gas of each batch.
- `source/atomica-web-components/tests/integration/16-settle-100-bids.test.tsx:212` EDIT — the entry function name that logGas checks becomes open_bids.
- `source/atomica-web-components/tests/integration/16-settle-100-bids.test.tsx:256` TEST — 100 bids are opened in batches by an account that is not the bidder, and the window settles
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:41` EDIT — getSubmitCleartextPayload and the OpenedBid opening flow go; import the SDK getOpenBidsPayload.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:683` EDIT — salt and commitment leave SubmittedBid.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:708` EDIT — getBidPayload loses the commitment argument and sealBid returns no salt.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:755` REMOVE — replace with openBidsDirect (stub at the end of this file): any account calls open_bids in batches.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:779` REMOVE — the cleartext payload; open_bids takes no prices and no salts.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:810` EDIT — reveal_final loses its meaning when finalize_reveal goes; the view tuple may change.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:894` ADD — open up to maxBids bids of a window with auction::open_bids from any account; callers repeat it until the window is cleared.
- `source/atomica-web-components/tests/integration/helpers/selectors.ts:80` EDIT — the decrypt, cleartext and salt selectors go; add the Open bids button.
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:24` EDIT — the sealBid mock returns no commitment and no salt.
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:135` EDIT — the submitBid arguments shift (no commitment at index 4).
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:216` TEST — submitBid is called with no commitment
- `source/atomica-web-components/tests/unit/AuctionRevealer.test.tsx:40` EDIT — mock openBids instead of submitCleartextAndClear.
- `source/atomica-web-components/tests/unit/AuctionRevealer.test.tsx:60` EDIT — rewrite this suite for the single Open bids action.
- `source/atomica-web-components/tests/unit/AuctionRevealer.test.tsx:118` REMOVE — this case.
- `source/atomica-web-components/tests/unit/AuctionRevealer.test.tsx:162` REMOVE — this case.
- `source/atomica-web-components/tests/unit/AuctionRevealer.test.tsx:185` EDIT — decrypt is a preview only, with no salts.
- `source/atomica-web-components/tests/unit/AuctionRevealer.test.tsx:241` TEST — Open bids calls openBids until every bid is opened and shows the count
- `source/atomica-web-components/tests/unit/bidStorage.test.ts:27` TEST — the opening storage is gone and no salt is written to localStorage

**Issue text corrections:**
- Missed: `14-happy-path.test.tsx` imports `getSubmitCleartextPayload` and sends a relayed `submit_cleartext_and_clear`. It also asserts `stored.commitment`.
- Missed: `tests/integration/helpers/selectors.ts` (decrypt, cleartext and salt selectors) and `selectors.test.tsx`.
- Missed: `src/storage/bidStorage.ts` opening stubs of the salt issue (235) go away with the salt.
- `16-settle-100-bids.test.tsx` checks the gas of the entry function by name in `logGas`. The name becomes `open_bids`.

**Hidden costs:**
- The fork pin, the validator image and the SDK land together, or every bid-settle, settle-100-bids and happy-path run fails.

**Cross-issue pressure:**
- The UI happy path issue (236) changes the same `AuctionRevealer` code. If 236 lands first, it builds the open step on `submitCleartextAndClear` and 228 rewrites it again. Land 228 first, or make 236's open step call one SDK function that 228 swaps.
- The salt issue (235) adds storage that 228 deletes. Land 228 first and drop the storage half of 235.

**CI:**
- Browser Tests (bid-settle), (settle-100-bids), (happy-path), (claim-reclaim-fees) all open bids through `openWindowBidsDirect`. `tests/unit/AuctionRevealer.test.tsx` and `AuctionBidder.test.tsx` run in the Unit Tests job.

## 231 [atomica-aptos] Align chain epochs with auction closes

**Sites marked:** 2 (ADD 0, EDIT 2, REMOVE 0, TEST 0, DOC 0)

**Sites:**
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:187` EDIT — this comment relies on a 24 hour docker epoch; UTC-anchored epoch ends change that.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:566` EDIT — registration needs the deadline 15 minutes before the epoch end; with UTC-anchored epoch ends a testnet started near a boundary fails here.

**Issue text corrections:**
- Product sites the fork issue does not list: `createLiveWindow` picks a deadline 20 to 600 s ahead, and registration needs the deadline 15 minutes before the epoch end. `14-happy-path.test.tsx` relies on a 24 hour docker epoch.

**Hidden costs:**
- With epoch ends anchored to UTC, a CI run that starts near an epoch end fails to register its timelock.

**Cross-issue pressure:**
- Interacts with the test-cap question of 243.

**CI:**
- Every window-creating Browser Tests chunk.

## 232 getDerivedAddress lowercases the Ethereum address

**Sites marked:** 5 (ADD 0, EDIT 4, REMOVE 0, TEST 1, DOC 0)

**Sites:**
- `source/atomica-demo/tests/integration/wallet/SimpleTransfer.test.ts:103` EDIT — no change needed: TEST_ACCOUNT defaults to lowercase, and getDerivedAddress will lowercase a checksummed override (this file runs in no CI job).
- `source/atomica-web-components/src/components/AuctionBidder.tsx:178` EDIT — no code change: the SDK lowercases inside getDerivedAddress; this is the one caller that passes a checksummed address.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:201` EDIT — no change needed: this helper lowercases by hand, which is why no browser test caught the checksum defect.
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:36` EDIT — this mock hides the checksum defect; the new case needs the real getDerivedAddress (importActual) or a file of its own.
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:208` TEST — with a checksummed account and the real getDerivedAddress, sealBid receives the address derived from the lowercase account

**Issue text corrections:**
- `AuctionBidder.tsx` is the only caller in this partition that passes a checksummed address. No code change is needed there, as the issue says.
- `tests/unit/AuctionBidder.test.tsx` mocks all of `@atomica/sdk`. The new case needs `importActual` for `getDerivedAddress` or a separate file.
- The demo's `tests/integration/wallet/SimpleTransfer.test.ts` passes `TEST_ACCOUNT` without lowercasing. Its default is lowercase, so it is unaffected (and it runs in no CI job).
- `helpers/auction-setup.ts` `ethAccountAddress` lowercases by hand, which is why no browser test caught the defect.

**CI:**
- Unit Tests (atomica-sdk, atomica-web-components) runs `AuctionBidder.test.tsx`.

## 233 Bidder registers its FakeUSD lock and uses the real lock id

**Sites marked:** 20 (ADD 0, EDIT 13, REMOVE 2, TEST 5, DOC 0)

**Sites:**
- `source/atomica-demo/vitest.config.ts:24` EDIT — the same hazard starts when AuctionBidder imports the proof generator.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:15` EDIT — this header says the lock id is a placeholder typed by hand; rewrite it for the real proof and registration.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:78` EDIT — the pair input moves to the lock step, and the same bytes feed lockBinding, sealBid and submitBid.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:87` EDIT — after the lock, read the Locked event (lockFromReceipt), wait for a certified block, build the FakeUSD proof, register it (getRegisterLockPayload with asset FakeUSD) and keep the lock nonce for a retry.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:110` EDIT — bind the lock to the pair the bidder will bid on.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:123` REMOVE — a transaction hash is not a lock id; use the lockId of the Locked event.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:166` EDIT — the 32 zero byte fallback goes; the lock step always supplies the real lock id.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:328` EDIT — move this pair input to the lock step.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:358` EDIT — the bidder reuses this proof step with the FakeUSD token; extract it so both flows share it.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:405` EDIT — getRegisterLockPayload gains an asset parameter; FakeETH stays the default here.
- `source/atomica-web-components/tests/integration/09-submit-bid.test.tsx:293` TEST — a bidder approves, locks and registers FakeUSD through AuctionBidder, bids, get_bid_count rises by one and the receipt of that lock id reads claimed
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:263` EDIT — AuctionBidder will import the proof generator too, which would break 09-submit-bid in the same way.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:251` REMOVE — build this payload with the SDK getRegisterLockPayload(proof, asset); the SDK uses its own CONTRACT_ADDR, not moduleAddr.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:616` EDIT — this stays the Node-side path; the new bidder-screen case locks and registers through AuctionBidder.
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:44` EDIT — add lockFromReceipt, and mock the proof generator, waitForCertifiedBlock and getRegisterLockPayload.
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:209` TEST — after the lock, the collateral lock id field equals the lockId of the Locked event and never the transaction hash
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:210` TEST — the lock step calls approve, lock, the certified block wait, the proof generator with the FakeUSD token and the register transaction with asset FakeUSD, in that order
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:211` TEST — the pair bytes passed to lockBinding equal the pair bytes passed to sealBid and submitBid
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:212` TEST — when the register transaction rejects, the error shows, the step stays on the lock step, and a retry sends no second approve or lock
- `source/atomica-web-components/vitest.config.ts:35` EDIT — a browser test that locks and registers through AuctionBidder runs the proof generator in the page; its Node-only dependencies need polyfills here first.

**Issue text corrections:**
- `AuctionBidder.tsx` will import `@atomica/sdk/ethereum/proofs`. The browser test config (`vitest.config.ts`) has no Node polyfills. `14-happy-path.test.tsx` already avoids `SellFlow` for this reason (`@ethereumjs/util` EventEmitter). Both 09 and 14 render `AuctionBidder`, so bid-settle and happy-path may fail to load the module.
- `source/atomica-demo/vitest.config.ts` also lacks the polyfills that the demo's `vite.config.ts` has, so the demo app test in Web Tests (meta) can break the same way.
- `helpers/auction-setup.ts` `registerLockPayload` builds the payload with the test's `moduleAddr`. The SDK builder uses its own `CONTRACT_ADDR`. Check they agree on the fixture before switching.
- The 32 zero byte fallback lock id in `AuctionBidder.tsx` goes too.

**Hidden costs:**
- Polyfills in `vitest.config.ts` for both packages before the new browser case can run.

**Cross-issue pressure:**
- `AuctionBidder.tsx` lock step is also edited by 218, 221, 224, 234 and the SDK unwind issue (195) domain check. Land 233 first and let the others add to its lock step.

**CI:**
- Browser Tests (bid-settle) runs 09. Unit Tests runs `AuctionBidder.test.tsx`.

## 234 Client refuses to lock when its LockBox differs from the pin

**Sites marked:** 10 (ADD 0, EDIT 6, REMOVE 0, TEST 4, DOC 0)

**Sites:**
- `source/atomica-web-components/src/components/AuctionBidder.tsx:88` EDIT — no code change expected: the SDK approve and lock reject on a pin mismatch and the catch below shows the message; add the unit test.
- `source/atomica-web-components/src/components/SettlementStatus.tsx:36` EDIT — a second LockBox address source (VITE_LOCK_BOX_ADDRESS, not getChainConfig); read-only, so no pin check is needed, but the SDK unwind issue (195) should read getChainConfig here.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:285` EDIT — no code change expected: approveFakeEth and lockFakeEth reject on a LockBox or token pin mismatch and setError shows the message.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:824` TEST — an SDK approve and lock passes the pin check against the live eth_proof::get_config (no SDK lock runs in this suite today
- `source/atomica-web-components/tests/integration/fixtures/dual-chain.ts:141` EDIT — the pin check compares this config with eth_proof::get_config; the fixture pins the same LockBox and tokens, so live tests pass unchanged.
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:45` EDIT — make approveFakeUsd or lockFakeUsd reject with the pin mismatch error.
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:213` TEST — when the SDK lock rejects with the pin mismatch error, the lock step shows the expected address and does not advance
- `source/atomica-web-components/tests/unit/SellFlow.error.test.tsx:178` TEST — the Step2Lock error line shows the pinned address of the mismatch error
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:537` EDIT — this existing case already covers a rejected lock; extend it with the pin mismatch message (the issue names SellFlow.error.test.tsx instead).
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:586` TEST — lockEth shows the pinned address and stays at the lock step when the SDK rejects with the pin mismatch

**Issue text corrections:**
- `hooks/sell-flow-state.test.tsx` already has a `lockEth error` case to extend. The issue names `SellFlow.error.test.tsx`, which renders `Step2Lock` with an error prop only.
- `SettlementStatus.tsx` reads `VITE_LOCK_BOX_ADDRESS` directly, not through `getChainConfig`. It is read-only, so no guard is needed, but it is a second address source.
- No component change is expected: `useSellFlow` and `AuctionBidder` already show a rejected lock's message.

**Hidden costs:**
- `14-happy-path.test.tsx` never calls the SDK lock functions (it locks through a testnet browser command), so the issue's 'guard accepts the live deployment' check does not run there today.

**Cross-issue pressure:**
- Same lock step as 233 and 195.

**CI:**
- Unit Tests runs the unit cases. Browser Tests (happy-path) does not exercise the guard.

**Questions answered or sharpened by the code:**
- To prove the guard on live chains, a browser case must call `lockFakeUsd` or `lockFakeEth` directly.

## 235 Client builds bid identity and associated data locally, keeps the salt

**Sites marked:** 22 (ADD 5, EDIT 10, REMOVE 0, TEST 6, DOC 1)

**Stubs added:**
- `src/storage/bidStorage.ts` `interface BidOpening { price; salt; commitment }`, `saveBidOpening(windowId, bidderAddr, opening): void`, `loadBidOpening(windowId, bidderAddr): BidOpening | null`, `clearBidOpening(windowId, bidderAddr): void` — all throw.
- `tests/unit/bidStorage.test.ts` new file with `it.todo` cases (the existing storage cases in `12a-bid-storage.test.tsx` run in no CI job).

**Sites:**
- `source/atomica-web-components/README.md:52` DOC — this table gains the bid opening functions.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:24` EDIT — sealBid builds the identity and associated data locally and cross-checks the node; rewrite this sentence.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:180` EDIT — sealBid may now throw when a node lies about the identity, the associated data or the key; keep the salt it returns.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:199` EDIT — store price, salt and commitment with saveBidOpening, only after submitBid resolves.
- `source/atomica-web-components/src/index.ts:23` ADD — export saveBidOpening, loadBidOpening and clearBidOpening (stubs in storage/bidStorage.ts).
- `source/atomica-web-components/src/storage/bidStorage.ts:2` EDIT — the key is documented as seller and bidder, but AuctionBidder passes the window id; key the opening by window, pair, bidder and bid, or a second bid overwrites the first salt.
- `source/atomica-web-components/src/storage/bidStorage.ts:52` ADD — what a bidder must keep to open its own bid with open_bid while commit and reveal exists.
- `source/atomica-web-components/src/storage/bidStorage.ts:63` ADD — store the price, salt and commitment after submit_bid succeeds.
- `source/atomica-web-components/src/storage/bidStorage.ts:72` ADD — return the stored opening of a bid, or null when none exists.
- `source/atomica-web-components/src/storage/bidStorage.ts:80` ADD — remove the stored opening once the bid is opened or the window is final.
- `source/atomica-web-components/tests/integration/12a-bid-storage.test.tsx:20` EDIT — this file runs in no CI job (exemptions list); the new storage cases go in tests/unit/bidStorage.test.ts.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:543` EDIT — sealBid cross-checks the node's identity and associated data here, on live chains.
- `source/atomica-web-components/tests/integration/fixtures/dual-chain.ts:142` EDIT — the chain config gains optional extra Aptos endpoints; this fixture has one node URL.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:709` EDIT — sealBid adds node cross-checks; one configured endpoint must keep working here.
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:25` EDIT — the stored opening must equal this mocked salt and commitment.
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:57` EDIT — mock saveBidOpening too, or use the real storage for the loadBidOpening case.
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:214` TEST — after a successful bid, loadBidOpening returns the price, salt and commitment that sealBid returned
- `source/atomica-web-components/tests/unit/AuctionBidder.test.tsx:215` TEST — nothing is stored when submitBid rejects
- `source/atomica-web-components/tests/unit/bidStorage.test.ts:14` TEST — saveBidOpening then loadBidOpening returns the same price, salt and commitment
- `source/atomica-web-components/tests/unit/bidStorage.test.ts:16` TEST — loadBidOpening returns null when nothing is stored
- `source/atomica-web-components/tests/unit/bidStorage.test.ts:18` TEST — computeBidCommitment(price, salt, ad) of a loaded opening equals its stored commitment
- `source/atomica-web-components/tests/unit/bidStorage.test.ts:21` TEST — two bids of one bidder in one window keep separate openings

**Issue text corrections:**
- `bidStorage.ts` documents its key as seller and bidder, but `AuctionBidder` passes the window id as the first part. A second bid by one bidder in one window overwrites the first. Key the opening by window, pair, bidder and bid.
- `fixtures/dual-chain.ts` sets one Aptos node URL. The optional extra endpoints need a fixture value, or the comparison never runs in browser tests.

**Cross-issue pressure:**
- The commit-and-reveal issue (228) deletes this storage. If 228 is near, skip the storage half.

**CI:**
- `tests/unit/bidStorage.test.ts` and `AuctionBidder.test.tsx` run in the Unit Tests job. `12a-bid-storage.test.tsx` is exempt.

**Questions answered or sharpened by the code:**
- Owner decision on a single endpoint is unanswered by the code: the fixture has one node.

## 236 UI completes a trade: open, settle and release replace the faucet claim

**Sites marked:** 57 (ADD 4, EDIT 20, REMOVE 16, TEST 15, DOC 2)

**Stubs added:**
- `src/components/ReleaseButton.tsx` `ReleaseButton(props: { windowId: bigint; pairBcs: Uint8Array }): null` — renders nothing, exported from no index, mounted nowhere.
- `src/hooks/useWindowRelease.ts` `useWindowRelease(windowId, pairBcs, account): WindowReleaseState` with types `WindowLockStatus`, `WindowLockRelease`, `WindowReleaseState` — throws.
- `tests/unit/ReleaseButton.test.tsx` new file with `it.todo` cases.
- `source/atomica-demo/vite.config.ts` commented-out `server.proxy` block for `/aptos-api` and `/eth-api`.

**Sites:**
- `source/atomica-demo/README.md:88` DOC — this list gains open, settle and release, and loses the faucet claim.
- `source/atomica-demo/src/App.tsx:1` EDIT — import SellFlow, AuctionRevealer, SettleButton and ReleaseButton once the package index exports them.
- `source/atomica-demo/src/App.tsx:57` EDIT — mount SellFlow, AuctionBidder, the open step, SettleButton and ReleaseButton here.
- `source/atomica-demo/tests/app-component.test.tsx:13` TEST — the rendered app contains the sell flow, the bidder, the open step, the settle action and the release action when a wallet is connected
- `source/atomica-demo/tests/app-component.test.tsx:16` TEST — the vite dev proxy table has the /aptos-api and /eth-api keys
- `source/atomica-demo/vite.config.ts:18` ADD — dev proxies for the two API paths the SDK calls in a browser (network-host.ts).
- `source/atomica-demo/vitest.config.ts:23` EDIT — App will import SellFlow, whose proof code needs the Node polyfills that vite.config.ts has and this config lacks; without them the app test of Web Tests (meta) may fail to load.
- `source/atomica-web-components/README.md:15` DOC — ClaimButton leaves this table; AuctionRevealer, SellFlow and ReleaseButton join it.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:13` EDIT — this component gets exported and mounted, so it needs windowId and pairBcs props instead of free-text inputs.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:52` EDIT — make the open step one action, built from decryptWindowBids before on-chain decryption (228) and from openBids after it.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:60` REMOVE — the user types no price and no salt.
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:82` EDIT — only is_revealed is polled, so an expired timelock waits forever; report it and hand over to Unwind (SDK unwind issue (195)).
- `source/atomica-web-components/src/components/AuctionRevealer.tsx:162` EDIT — one open-and-clear transaction with no typed input.
- `source/atomica-web-components/src/components/ClaimButton.tsx:1` REMOVE — whole file (the claim mints the clearing price from the public faucet and moves nothing from the seller).
- `source/atomica-web-components/src/components/ReleaseButton.tsx:1` ADD — ReleaseButton, the third step of the UI happy path (open, settle, release); this stub renders nothing.
- `source/atomica-web-components/src/components/SellFlow/SellFlow.tsx:13` EDIT — SellFlow gets exported from the package index and mounted in the demo.
- `source/atomica-web-components/src/components/SellFlow/SellFlow.tsx:83` EDIT — pass windowId and pairBcs; without them Step8Monitor never renders the settle or release step.
- `source/atomica-web-components/src/components/SellFlow/steps/Step8Monitor.tsx:3` REMOVE — ClaimButton import; import the open step and ReleaseButton.
- `source/atomica-web-components/src/components/SellFlow/steps/Step8Monitor.tsx:101` EDIT — the badge says Settled as soon as the local clock ends; drive open, settle and release from chain state.
- `source/atomica-web-components/src/components/SellFlow/steps/Step8Monitor.tsx:166` EDIT — SellFlow passes no windowId and no pairBcs, so this never renders in the sell flow; add the open step before settle.
- `source/atomica-web-components/src/components/SellFlow/steps/Step8Monitor.tsx:176` REMOVE — ClaimButton; mount ReleaseButton here.
- `source/atomica-web-components/src/components/SettleButton.tsx:13` EDIT — the button is gated on a client-clock auctionEndTime prop and stays disabled without one; gate it on chain state so the demo can mount it.
- `source/atomica-web-components/src/hooks/useWindowRelease.ts:1` ADD — useWindowRelease, the state and the action behind ReleaseButton; this stub throws and no component imports it.
- `source/atomica-web-components/src/index.ts:9` REMOVE — drop the ClaimButton export with the component.
- `source/atomica-web-components/src/index.ts:10` ADD — export AuctionRevealer, SellFlow and ReleaseButton here; SellFlow pulls @atomica/sdk/ethereum/proofs (Node-only dependencies) into every consumer of this index, so check the demo browser test first.
- `source/atomica-web-components/tests/integration/11-claim-and-reclaim.test.tsx:1` EDIT — this file becomes the release test; a rename also needs the claim-reclaim-fees file list of test-web.yaml (both tiers) and the exemptions list changed.
- `source/atomica-web-components/tests/integration/11-claim-and-reclaim.test.tsx:49` REMOVE — import ReleaseButton instead.
- `source/atomica-web-components/tests/integration/11-claim-and-reclaim.test.tsx:235` REMOVE — the faucet mint of the clearing price; assert ERC-20 balances on Ethereum after release.
- `source/atomica-web-components/tests/integration/11-claim-and-reclaim.test.tsx:264` TEST — release pressed by a wallet that is neither seller nor bidder pays the winner FakeETH and the seller FakeUSD on Ethereum
- `source/atomica-web-components/tests/integration/11-claim-and-reclaim.test.tsx:265` TEST — LockBox.statuses reads released for the seller lock and the winner collateral lock
- `source/atomica-web-components/tests/integration/11-claim-and-reclaim.test.tsx:266` TEST — a second press finds no open lock and sends no transaction
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:130` REMOVE — import ReleaseButton instead.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:262` EDIT — the demo will mount SellFlow, but this browser suite cannot import it; the happy path keeps direct helpers unless vitest.config.ts gains polyfills.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:271` EDIT — the suite ends with release on Ethereum instead of the faucet claim; the header comment (steps 8b to 11) needs the same rewrite.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:580` EDIT — the open step is one click on the real component.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:722` REMOVE — step 11, the faucet claim; replace it with the release action and ERC-20 balance asserts on Ethereum.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:744` REMOVE — render ReleaseButton here instead.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:823` TEST — release: the winner's FakeETH and the seller's FakeUSD ERC-20 balances rise by the outcome amounts and both locks read released
- `source/atomica-web-components/tests/integration/fixtures/dual-chain.ts:62` EDIT — the release browser test needs that address, and a validator image that serves /v1/atomica/event_proof.
- `source/atomica-web-components/tests/integration/helpers/selectors.ts:81` EDIT — the same block changes for the single open action.
- `source/atomica-web-components/tests/integration/helpers/selectors.ts:103` REMOVE — the claimButton block; add a releaseButton block.
- `source/atomica-web-components/tests/integration/helpers/selectors.ts:140` REMOVE — flat export.
- `source/atomica-web-components/tests/integration/selectors.test.tsx:26` REMOVE — the ClaimButton import and its two cases below.
- `source/atomica-web-components/tests/integration/selectors.test.tsx:299` REMOVE — both ClaimButton cases.
- `source/atomica-web-components/tests/integration/selectors.test.tsx:388` REMOVE — both claimButton asserts.
- `source/atomica-web-components/tests/unit/AuctionRevealer.test.tsx:61` EDIT — the same suite asserts one open-and-clear transaction with no typed price or salt.
- `source/atomica-web-components/tests/unit/AuctionRevealer.test.tsx:240` TEST — the open step sends one open-and-clear transaction built from decryptWindowBids, with no price or salt typed by the user
- `source/atomica-web-components/tests/unit/ClaimButton.test.tsx:1` REMOVE — whole file.
- `source/atomica-web-components/tests/unit/ReleaseButton.test.tsx:15` TEST — calls the outcome carrier before any releaseByOutcome
- `source/atomica-web-components/tests/unit/ReleaseButton.test.tsx:17` TEST — skips the carrier when LockBox.outcomes(auctionKey) is already set
- `source/atomica-web-components/tests/unit/ReleaseButton.test.tsx:19` TEST — calls releaseByOutcome once per open lock
- `source/atomica-web-components/tests/unit/ReleaseButton.test.tsx:21` TEST — shows the status of each lock and is disabled when every lock is released
- `source/atomica-web-components/tests/unit/ReleaseButton.test.tsx:24` TEST — a second press finds no open lock and sends no transaction
- `source/atomica-web-components/tests/unit/ReleaseButton.test.tsx:27` TEST — works for a wallet that is neither the seller nor a bidder
- `source/atomica-web-components/tests/unit/SellFlow.test.tsx:168` TEST — the monitoring step passes windowId and pairBcs, so the settle and release steps render
- `source/atomica-web-components/tests/unit/SettleButton.test.tsx:23` TEST — enables from chain state when no auctionEndTime prop is passed
- `source/atomica-web-components/vitest.config.ts:36` EDIT — the same limit keeps SellFlow out of the browser suite (see 14-happy-path.test.tsx).

**Issue text corrections:**
- **What 236 adds:** `ReleaseButton` and `useWindowRelease`; exports of `AuctionRevealer`, `SellFlow` and `ReleaseButton` from `src/index.ts`; `windowId` and `pairBcs` props on `AuctionRevealer` in place of free-text inputs; one open action in `AuctionRevealer`; `SettleButton` enabled from chain state when no `auctionEndTime` is passed (today it stays disabled without that prop); `SellFlow` passing `windowId` and `pairBcs` to `Step8Monitor` (today it passes neither, so settle never renders in the sell flow); `Step8Monitor` mounting the open step and `ReleaseButton` in place of `ClaimButton`; the demo `App.tsx` mount and the `vite.config.ts` proxies; removal of `ClaimButton`, its unit test, its selectors and its two `selectors.test.tsx` cases.
- **What 236 leaves to the SDK unwind issue (195):** the outcome carrier (`carryOutcome`: event proof fetch, `advanceEpoch`, `recordOutcome`), the `recordOutcome`, `releaseByOutcome` and `reclaim` bindings, `UnwindButton`, `ReclaimLockButton`, the `getSiweDomain` check in the lock steps, and the rewrite of `SettlementStatus` and `WithdrawWinnings`.
- **SDK functions 236 needs that do not exist:** `getWindowLockIds` (reader for the existing `auction::get_window_lock_ids` view), `getLockOutcome` (reader for `lock_receipt::get_lock_outcome`, which exists only in pull request 213), `getLockById` (a `Locked` event reader by lock id; `getLocks` filters by depositor and token), `getRecordedOutcome` (reads `LockBox.outcomes(auctionKey)`), `carryOutcome` and `releaseByOutcome` (195), and a `recordOutcome` fragment in `LOCKBOX_ABI`. `buildOutcomeTree`, `outcomeProof`, `auctionKey`, `getLockStatus` and `LOCK_STATUS` exist.
- The carrier needs the version and event index of the `settle` transaction. Nothing on chain stores them, so a wallet that did not send `settle` must scan for the `AuctionOutcome` event. Neither 236 nor 195 names this.
- `AuctionRevealer` polls only `is_revealed`. An expired timelock waits forever. It should report expiry and hand over to Unwind (195).
- Exporting `SellFlow` from the package index pulls `@atomica/sdk/ethereum/proofs` into every consumer, including the demo app test. The demo `vitest.config.ts` has no Node polyfills.
- `AuctionCreator.tsx` has a 32 zero byte default lock id. 236 assigns it to the create-auction issue (243), whose text does not mention it.
- The 11 file rename needs both tiers of the claim-reclaim-fees `test_files` and the exemptions list changed (INFRA partition).

**Hidden costs:**
- The release browser test needs a LockBox wired to a real light client (219) and a validator image that serves `/v1/atomica/event_proof`. The INFRA scout notes the anvil tier starts on the cancun hardfork.

**Cross-issue pressure:**
- Depends on 195 for the carrier and bindings, and on pull request 213 for `get_lock_outcome`.
- Collides with 228 in `AuctionRevealer` and the happy path step 8b, with 238 in `Step8Monitor` and `src/index.ts`, and with 217 in the displays.
- `ReleaseButton` must fall back to `reclaimUnpayable` (222).

**CI:**
- Unit Tests runs `ReleaseButton.test.tsx`, `SettleButton.test.tsx`, `AuctionRevealer.test.tsx` and `SellFlow.test.tsx` with no workflow edit.
- Browser Tests (claim-reclaim-fees) runs 11; Browser Tests (happy-path) runs 14.
- Web Tests (meta) runs the demo tests by explicit file list, so a new demo test file needs a workflow edit (INFRA). The two new demo cases are `it.todo` in the existing `app-component.test.tsx`.

**Questions answered or sharpened by the code:**
- Who pays the carrier gas (K-2) stays with 195.

## 238 Remove dead Move code

**Sites marked:** 46 (ADD 0, EDIT 17, REMOVE 25, TEST 2, DOC 2)

**Sites:**
- `source/atomica-demo/README.md:89` DOC — MPK Generation is not a client step; create_auction takes no key.
- `source/atomica-demo/scripts/deploy.ts:232` REMOVE — the registry::initialize init function.
- `source/atomica-demo/scripts/dual-testnet-orchestrator.ts:201` REMOVE — the registry::initialize init function.
- `source/atomica-demo/scripts/orchestrator.ts:116` REMOVE — the registry::initialize init function.
- `source/atomica-demo/scripts/orchestrator.ts:202` REMOVE — the registry::initialize run.
- `source/atomica-web-components/README.md:16` DOC — FeeRebateDisplay, useFeeRebate and the fee-rebate wording in Purpose go.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:16` EDIT — this header says the stored price feeds useFeeRebate; that hook is removed.
- `source/atomica-web-components/src/components/AuctionBidder.tsx:201` EDIT — nothing reads this value once useFeeRebate is deleted.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:4` REMOVE — drop the getMpk import.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:12` EDIT — this header describes the MPK fetch and the mpk_bytes argument; both go.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:31` EDIT — mpk_bytes leaves this argument list.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:55` REMOVE — create_auction has no _mpk_bytes argument, so the getMpk fetch goes.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:86` EDIT — drop the mpk argument.
- `source/atomica-web-components/src/components/FeeRebateDisplay.tsx:1` REMOVE — whole file.
- `source/atomica-web-components/src/components/SellFlow/steps/Step8Monitor.tsx:7` REMOVE — the FeeRebateDisplay and useFeeRebate imports.
- `source/atomica-web-components/src/components/SellFlow/steps/Step8Monitor.tsx:106` REMOVE — the useFeeRebate call.
- `source/atomica-web-components/src/components/SellFlow/steps/Step8Monitor.tsx:185` REMOVE — the FeeRebateDisplay block.
- `source/atomica-web-components/src/components/SettleButton.tsx:67` EDIT — get_settlement returns the filled total, not total_supply, so the Total filled line below changes value.
- `source/atomica-web-components/src/components/SettleButton.tsx:102` EDIT — these matches are stale: settle raises E_DEADLINE_NOT_PASSED (31) and E_WINDOW_ALREADY_SETTLED (11), and E_ALREADY_SETTLED (5) is never raised; fix them when the unused codes go.
- `source/atomica-web-components/src/components/SettleButton.tsx:157` EDIT — this value is the window supply today; it becomes the sum of the winners' fills.
- `source/atomica-web-components/src/hooks/useAptosBalances.ts:54` EDIT — no code change: the SDK check requires the registry module; if the Move package drops it before the SDK list changes, this hook reports the contracts as missing.
- `source/atomica-web-components/src/hooks/useFeeRebate.ts:1` REMOVE — whole file (fetchRebates and auction::compute_rebates are deleted).
- `source/atomica-web-components/src/hooks/useSellFlow.ts:447` REMOVE — the mpk argument.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:463` EDIT — drop mpk.
- `source/atomica-web-components/src/index.ts:12` REMOVE — drop the FeeRebateDisplay export.
- `source/atomica-web-components/src/index.ts:20` REMOVE — drop the useFeeRebate and FeeRebateResult exports.
- `source/atomica-web-components/src/index.ts:25` EDIT — saveBidPrice has no reader once useFeeRebate is gone (no component calls loadBidPrice today).
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:325` EDIT — no mpk argument.
- `source/atomica-web-components/tests/integration/10-settle.test.tsx:350` TEST — get_settlement returns the sum of the winners' fills and SettleButton shows it as the total filled
- `source/atomica-web-components/tests/integration/12-fee-rebate.test.tsx:1` REMOVE — whole file; also remove it from the claim-reclaim-fees chunk of test-web.yaml (both tiers) and from the exemptions list.
- `source/atomica-web-components/tests/integration/12b-fee-rebate-computation.test.tsx:1` REMOVE — whole file; it is named in the exemptions list, which the issue does not mention.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:497` EDIT — drop the mpk_bytes argument.
- `source/atomica-web-components/tests/integration/helpers/selectors.ts:113` REMOVE — the feeRebateDisplay block.
- `source/atomica-web-components/tests/integration/helpers/selectors.ts:142` REMOVE — flat export.
- `source/atomica-web-components/tests/integration/selectors.test.tsx:28` REMOVE — the FeeRebateDisplay import and its two cases below.
- `source/atomica-web-components/tests/integration/selectors.test.tsx:322` REMOVE — both FeeRebateDisplay cases.
- `source/atomica-web-components/tests/integration/selectors.test.tsx:391` REMOVE — both feeRebateDisplay asserts.
- `source/atomica-web-components/tests/unit/AuctionCreator.test.tsx:21` REMOVE — the getMpk mock.
- `source/atomica-web-components/tests/unit/AuctionCreator.test.tsx:87` EDIT — there is no getMpk call.
- `source/atomica-web-components/tests/unit/AuctionCreator.test.tsx:102` EDIT — no mpk at the end.
- `source/atomica-web-components/tests/unit/FeeRebateDisplay.test.tsx:1` REMOVE — whole file.
- `source/atomica-web-components/tests/unit/SettleButton.test.tsx:17` TEST — shows the filled total that get_settlement returns, not the window supply
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:416` EDIT — no mpk argument.
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:462` EDIT — the payload loses mpk; three arguments remain.
- `source/atomica-web-components/tests/unit/hooks/useFeeRebate.test.tsx:1` REMOVE — whole file.
- `source/atomica-web-components/tests/useFeeRebate.test.tsx:1` REMOVE — whole file; it is named in the exemptions list, which the issue does not mention.

**Issue text corrections:**
- Missed: `src/hooks/useAptosBalances.ts` uses the SDK module check that requires `registry`. If Move drops the module before the SDK list changes, the hook reports contracts missing.
- Missed: `tests/integration/12b-fee-rebate-computation.test.tsx` and `tests/useFeeRebate.test.tsx` are named in the exemptions list. Deleting them without the list fails the coverage guard.
- `SettleButton.tsx` matches `E_AUCTION_NOT_ENDED` with `abort 3`, which also matches `abort 31` (`E_DEADLINE_NOT_PASSED`), and `E_ALREADY_SETTLED` matches `E_WINDOW_ALREADY_SETTLED`. `E_ALREADY_SETTLED` (5) is never raised. Fix these matches when the unused codes go.
- `saveBidPrice` has no reader once `useFeeRebate` goes.
- Demo scripts `deploy.ts`, `orchestrator.ts` (two places) and `dual-testnet-orchestrator.ts` call `registry::initialize`, as the issue says.

**Cross-issue pressure:**
- Removing `auction::E_NOT_IMPLEMENTED` conflicts with the scout stubs in the Move partition, which abort with it. Replace or delete those stubs first.
- 241 and 243 edit the same `create_auction` call sites (`AuctionCreator`, `useSellFlow`, `createAuctionDirect`, 07).

**CI:**
- Browser Tests (claim-reclaim-fees) runs `12-fee-rebate.test.tsx` today; drop it from both tiers.
- Unit Tests runs `FeeRebateDisplay.test.tsx` and `hooks/useFeeRebate.test.tsx`.

## 239 Remove unused testnet SDKs and mocks

**Sites marked:** 3 (ADD 0, EDIT 3, REMOVE 0, TEST 0, DOC 0)

**Sites:**
- `source/atomica-demo/scripts/dual-testnet-orchestrator.ts:16` EDIT — repoint to @atomica/aptos-docker-testnet; the script also imports ../tests/meta/ethereum/solidity-compiler.js and ../test-utils/localnet, which do not exist.
- `source/atomica-demo/scripts/orchestrator.ts:1` EDIT — import DockerTestnet from @atomica/aptos-docker-testnet; @atomica/docker-testnet is not a dependency of this package, so the script fails at import today.
- `source/atomica-demo/scripts/testnet-only.ts:15` EDIT — repoint to @atomica/aptos-docker-testnet; the import above (@atomica/ethereum-docker-testnet) is not a dependency either, so the script still fails.

**Issue text corrections:**
- The three demo scripts fail at import today for more reasons than the package name: `testnet-only.ts` and `dual-testnet-orchestrator.ts` import `@atomica/ethereum-docker-testnet`, which the demo does not declare, and `dual-testnet-orchestrator.ts` imports `../tests/meta/ethereum/solidity-compiler.js` and `../test-utils/localnet`, which do not exist. Repointing one import does not make them run. Consider deleting them.

**Cross-issue pressure:**
- 238 edits the same scripts (`registry::initialize`).

**CI:**
- No CI job runs the demo scripts. Web Tests (meta) only type-checks and tests `src` and `tests`.

## 241 Remove the unused seller reserve price

**Sites marked:** 66 (ADD 0, EDIT 28, REMOVE 33, TEST 4, DOC 1)

**Sites:**
- `source/atomica-demo/README.md:87` DOC — Create Auction no longer sets a minimum price.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:13` EDIT — this header lists the minimum price; it goes.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:29` EDIT — min_price leaves this argument list.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:44` REMOVE — the minimum price state, its input and its argument.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:81` REMOVE — minPriceBn.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:84` EDIT — drop the minPriceBn argument.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:147` REMOVE — the Min Price field.
- `source/atomica-web-components/src/components/SellFlow/SellFlow.tsx:71` REMOVE — minPrice prop.
- `source/atomica-web-components/src/components/SellFlow/SellFlow.tsx:79` REMOVE — minPrice prop.
- `source/atomica-web-components/src/components/SellFlow/steps/Step2Lock.tsx:5` EDIT — onLock takes the amount only.
- `source/atomica-web-components/src/components/SellFlow/steps/Step2Lock.tsx:14` REMOVE — minimum price state.
- `source/atomica-web-components/src/components/SellFlow/steps/Step2Lock.tsx:21` REMOVE — minPriceWei.
- `source/atomica-web-components/src/components/SellFlow/steps/Step2Lock.tsx:56` REMOVE — the minimum price input (test id min-price-input).
- `source/atomica-web-components/src/components/SellFlow/steps/Step7Auction.tsx:7` REMOVE — minPrice prop.
- `source/atomica-web-components/src/components/SellFlow/steps/Step7Auction.tsx:35` REMOVE — priceFormatted and the min price text below.
- `source/atomica-web-components/src/components/SellFlow/steps/Step7Auction.tsx:42` EDIT — drop the min price half of this sentence.
- `source/atomica-web-components/src/components/SellFlow/steps/Step8Monitor.tsx:14` REMOVE — minPrice prop.
- `source/atomica-web-components/src/components/SellFlow/steps/Step8Monitor.tsx:114` REMOVE — priceFormatted and the Min price row.
- `source/atomica-web-components/src/components/SellFlow/steps/Step8Monitor.tsx:126` REMOVE — the Min price row.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:54` EDIT — keep reading saved state that still has minPrice, and ignore it.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:72` REMOVE — minPrice leaves the flow state.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:83` EDIT — lockEth takes the amount only.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:157` REMOVE — restore of minPrice (first of two copies of this block).
- `source/atomica-web-components/src/hooks/useSellFlow.ts:193` REMOVE — restore of minPrice (second copy).
- `source/atomica-web-components/src/hooks/useSellFlow.ts:217` REMOVE — minPrice is no longer persisted.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:232` REMOVE — minPrice leaves the persisted-state dependency list.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:284` EDIT — drop the minPrice parameter.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:322` REMOVE — lockEth stores no minPrice.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:427` EDIT — this guard returns early when minPrice is missing or zero; drop the minPrice test or createAuction never runs.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:461` EDIT — drop state.minPrice.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:483` EDIT — drop state.minPrice from this dependency list.
- `source/atomica-web-components/tests/integration/03-approve-and-lock.test.tsx:94` REMOVE — the min price input step (this file runs in no CI job).
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:55` REMOVE — MIN_PRICE and every minPrice argument and prop in this file.
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:192` EDIT — drop MIN_PRICE here and in the third case.
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:238` REMOVE — the min price half of this case.
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:323` EDIT — no minPrice argument.
- `source/atomica-web-components/tests/integration/08-auction-monitor.test.tsx:52` REMOVE — MIN_PRICE and the minPrice option below.
- `source/atomica-web-components/tests/integration/09-submit-bid.test.tsx:79` REMOVE — MIN_PRICE and the minPrice option below.
- `source/atomica-web-components/tests/integration/10-settle.test.tsx:76` REMOVE — MIN_PRICE and the minPrice option below.
- `source/atomica-web-components/tests/integration/11-claim-and-reclaim.test.tsx:69` REMOVE — MIN_PRICE and the minPrice option below.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:170` REMOVE — MIN_PRICE and the createAuctionDirect argument; this file is missing from the issue's touchpoints.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:461` EDIT — drop MIN_PRICE.
- `source/atomica-web-components/tests/integration/16-settle-100-bids.test.tsx:61` EDIT — MIN_PRICE is also the base of the bid price ladder; only the createLiveWindow option goes.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:495` EDIT — drop the minPrice parameter; every caller passes it by position, including 14-happy-path, which the issue does not list.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:545` EDIT — drop options.minPrice.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:579` REMOVE — the minPrice argument to createAuctionDirect.
- `source/atomica-web-components/tests/integration/helpers/selectors.ts:27` REMOVE — minPriceInput.
- `source/atomica-web-components/tests/integration/selectors.test.tsx:101` REMOVE — this case.
- `source/atomica-web-components/tests/integration/selectors.test.tsx:367` REMOVE — this assert.
- `source/atomica-web-components/tests/unit/AuctionCreator.test.tsx:65` EDIT — there is no Min Price field.
- `source/atomica-web-components/tests/unit/AuctionCreator.test.tsx:74` REMOVE — the Min Price label assert.
- `source/atomica-web-components/tests/unit/AuctionCreator.test.tsx:101` EDIT — the argument count drops (7 today).
- `source/atomica-web-components/tests/unit/AuctionCreator.test.tsx:164` TEST — submitCreateAuction is called without a price argument
- `source/atomica-web-components/tests/unit/SellFlow.error.test.tsx:48` EDIT — assert that onLock is called with the amount only.
- `source/atomica-web-components/tests/unit/SellFlow.error.test.tsx:122` EDIT — drop the minPrice prop below.
- `source/atomica-web-components/tests/unit/SellFlow.error.test.tsx:177` TEST — Step2Lock renders no element with test id min-price-input and calls onLock with the amount only
- `source/atomica-web-components/tests/unit/SellFlow.resume.test.tsx:138` EDIT — saved state with minPrice must still resume.
- `source/atomica-web-components/tests/unit/SellFlow.resume.test.tsx:250` EDIT — this case reaches monitoring only because the saved state has minPrice; createAuction returns early without it today.
- `source/atomica-web-components/tests/unit/SellFlow.resume.test.tsx:332` TEST — saved sell flow state that contains a minimum price resumes at the saved step and ignores the price
- `source/atomica-web-components/tests/unit/SellFlow.test.tsx:116` EDIT — minPrice leaves the mocked flow state here and in the next case.
- `source/atomica-web-components/tests/unit/SellFlow.test.tsx:140` REMOVE — the Min price row assert.
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:179` EDIT — minPrice is ignored on resume.
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:272` EDIT — lockEth takes the amount only (also in the two error cases below).
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:415` EDIT — no minPrice in the persisted state or in the payload.
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:460` EDIT — the payload loses minPrice.
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:585` TEST — createAuction runs when the saved state has no minimum price

**Issue text corrections:**
- Missed: `14-happy-path.test.tsx` passes `MIN_PRICE` to `createAuctionDirect` by position.
- Missed: `useSellFlow.ts` `createAuction` returns early when `state.minPrice` is missing or zero. Removing the field without that guard means `createAuction` never runs.
- `16-settle-100-bids.test.tsx` uses `MIN_PRICE` as the base of its bid price ladder. Only the `createLiveWindow` option goes.
- `03-approve-and-lock.test.tsx` and `selectors.test.tsx` run in no CI job, so their edits are unchecked.

**Cross-issue pressure:**
- Same call sites as 238 and 243. Land 241 and 238 in one pull request or in sequence before 243.

**CI:**
- Unit Tests runs SellFlow, AuctionCreator and sell-flow-state tests. Browser Tests (auction), (bid-settle), (settle-100-bids), (claim-reclaim-fees) and (happy-path) pass `minPrice`.

## 243 create_auction registers the window's timelock itself

**Sites marked:** 45 (ADD 1, EDIT 27, REMOVE 12, TEST 5, DOC 0)

**Stubs added:**
- `tests/integration/helpers/auction-setup.ts` `getWindowDeadlineUs(aptosClient, moduleAddr, windowId): Promise<bigint>`.

**Sites:**
- `source/atomica-web-components/src/components/AuctionCreator.tsx:3` REMOVE — drop the registerTimelock import.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:14` EDIT — this header says the screen registers the timelock; create_auction does it.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:30` EDIT — timelock_id leaves this argument list.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:59` REMOVE — create_auction registers the window timelock itself; this caller-chosen one hour deadline goes.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:72` EDIT — remove the 32 zero byte default lock id; the UI happy path issue (236) assigns it to this issue, whose text does not mention it.
- `source/atomica-web-components/src/components/AuctionCreator.tsx:85` EDIT — drop the timelockId argument.
- `source/atomica-web-components/src/components/SellFlow/steps/Step8Monitor.tsx:100` EDIT — ended comes from a local one hour clock; read the window deadline view so the countdown matches the chain.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:25` REMOVE — drop the registerTimelock import.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:90` EDIT — createAuction sends one transaction.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:451` REMOVE — registerTimelock and the local one hour auctionEndTime; read the window deadline from the new view instead.
- `source/atomica-web-components/src/hooks/useSellFlow.ts:462` EDIT — drop timelockId.
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:60` EDIT — the test no longer picks the deadline; it needs the test cap of open question 1.
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:157` REMOVE — the manual timelock registration; create_auction registers it.
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:193` EDIT — drop timelockId here and in the third case.
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:227` EDIT — expect the timelock id that create_auction registered (ibe_config::get_next_timelock_id before the call).
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:324` EDIT — no timelockId argument.
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:359` TEST — the window timelock deadline equals the window_deadline_us view and the TimelockRegistrationEvent sender is the registrar address
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:360` TEST — the SDK registrar address equals auction::timelock_registrar_address and 0x1::ibe_config::timelock_registrar
- `source/atomica-web-components/tests/integration/07-create-auction.test.tsx:361` TEST — register_timelock from the operator account fails with E_NOT_REGISTRAR
- `source/atomica-web-components/tests/integration/08-auction-monitor.test.tsx:57` EDIT — a 20 second deadline is not possible when the deadline is the window close; it needs the test cap.
- `source/atomica-web-components/tests/integration/09-submit-bid.test.tsx:87` EDIT — a 180 second deadline needs the test cap.
- `source/atomica-web-components/tests/integration/09-submit-bid.test.tsx:264` EDIT — this waits for auction.deadlineUs, which becomes the window close or the test cap.
- `source/atomica-web-components/tests/integration/10-settle.test.tsx:86` EDIT — a 120 second deadline needs the test cap.
- `source/atomica-web-components/tests/integration/11-claim-and-reclaim.test.tsx:77` EDIT — a 120 second deadline needs the test cap.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:186` EDIT — the test no longer sets the deadline; it needs the test cap.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:447` REMOVE — the manual timelock registration.
- `source/atomica-web-components/tests/integration/14-happy-path.test.tsx:462` EDIT — drop timelockId.
- `source/atomica-web-components/tests/integration/16-settle-100-bids.test.tsx:73` EDIT — a 300 second deadline needs the test cap.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:42` EDIT — getRegisterTimelockPayload and timelockIdFromEvents leave the SDK; keep a local payload for the E_NOT_REGISTRAR case.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:362` EDIT — this helper stays only for the case that expects E_NOT_REGISTRAR; createLiveWindow stops calling it.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:496` EDIT — drop the timelockId parameter.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:521` EDIT — timelockId and deadlineUs are read back from the chain, not chosen by the test.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:544` EDIT — stop registering a timelock; deadlineAheadUs needs the owner's answer on a test cap (open question 1), since tests use 20 to 600 seconds.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:811` EDIT — the timelock id read here is the one create_auction registered.
- `source/atomica-web-components/tests/integration/helpers/auction-setup.ts:916` ADD — read auction::window_deadline_us, the timelock deadline that create_auction derives from the window id.
- `source/atomica-web-components/tests/unit/AuctionCreator.test.tsx:20` REMOVE — the registerTimelock mock.
- `source/atomica-web-components/tests/unit/AuctionCreator.test.tsx:100` REMOVE — this case; assert one transaction and no register_timelock.
- `source/atomica-web-components/tests/unit/AuctionCreator.test.tsx:163` TEST — the create step submits exactly one transaction and none to 0x1::ibe_config::register_timelock
- `source/atomica-web-components/tests/unit/SellFlow.resume.test.tsx:51` REMOVE — the registerTimelock mock.
- `source/atomica-web-components/tests/unit/SellFlow.resume.test.tsx:251` EDIT — still two Aptos transactions (register lock, create auction) and no timelock registration.
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:55` REMOVE — the registerTimelock mock.
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:414` REMOVE — the timelock registration asserts and the local one hour end time.
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:461` EDIT — the payload loses timelockId.
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:482` REMOVE — this case.
- `source/atomica-web-components/tests/unit/hooks/sell-flow-state.test.tsx:584` TEST — createAuction submits exactly one transaction and never calls registerTimelock

**Issue text corrections:**
- `AuctionCreator.tsx` 32 zero byte default lock id is assigned to this issue by 236. This issue does not mention it.
- `useSellFlow.ts` and `Step8Monitor.tsx` use a local one hour `auctionEndTime`. The countdown must read the window deadline view instead.
- Every browser test picks a deadline 20 to 600 s ahead (`DEADLINE_AHEAD_US` in 07 to 16). Open question 1 is a hard blocker for every live chunk, not only for 07.

**Hidden costs:**
- All window-creating browser chunks change at once with the pin bump.

**Cross-issue pressure:**
- Land after 224 (allowlist) and 241 and 238 (signature). Ship with the fork registrar image (225).

**CI:**
- Browser Tests (auction) runs 07; bid-settle, settle-100-bids, claim-reclaim-fees and happy-path all create windows.

**Questions answered or sharpened by the code:**
- Open question 1 (test cap) decides whether any reveal, settle or refund browser test can finish in CI.

## No sites in this partition

223, 226, 227, 229, 230, 237, 240, 242. The beacon light client (237) has no importer here. The docs issue (242) touches only `docs/`.

## Unmarkable sites

- `source/atomica-web-components/package.json`, 236 and 233: the browser suite may need Node polyfill dependencies if `AuctionBidder` or `SellFlow` load `@atomica/sdk/ethereum/proofs` in the page.
- `source/atomica-demo/package.json`, 239: does not declare `@atomica/docker-testnet` or `@atomica/ethereum-docker-testnet`, which three scripts import.
- No JSON fixture exists under the tests of either package, so every test site above is markable.

## Seen outside my partition

- `.github/test-coverage-exemptions.yaml` reason text says CI runs only 14-happy-path, but the browser matrix runs 01, 02, 07 to 14 and 16. The list itself is right because the guard does not expand the matrix.
- `source/evm-contracts/src/tokens/FakeUSD.sol` `MAX_MINT_AMOUNT` (10,000 USD per call) is what bounds every browser test's collateral. Pull request 213 learned this in `b3b7dbc`. Issues 216, 217 and 218 size tests without naming it.
- `auction::E_NOT_IMPLEMENTED`, which the Move scout stubs abort with, is deleted by 238.

## Check results

All run in the product worktree, local runs, not CI.
- `source/atomica-web-components`: `bun run build` passed (tsc, no output).
- `source/atomica-web-components`: `bun run lint` passed (only the MODULE_TYPELESS_PACKAGE_JSON node warning).
- `source/atomica-web-components`: `bun run format:check` first failed on `src/hooks/useSellFlow.ts` (marker indent); fixed with `bunx prettier --write src/hooks/useSellFlow.ts` (only the marker line moved); then 'All matched files use Prettier code style!'.
- `source/atomica-web-components`: `bun run test:unit` (the Unit Tests job command): 17 files passed, 4 skipped; 124 tests passed, 46 todo.
- `source/atomica-demo`: `bunx tsc -b --noEmit` passed; `bun run lint` passed; `bun run format:check` first failed on `tests/app-component.test.tsx`; fixed with `bunx prettier --write` on that file; then passed.
- Repo root: `bun scripts/check-test-coverage.js --verbose`: 'Test files under source/: 118. Run by a CI job: 84. Exempt: 34. Test coverage guard passed.' The four new unit files map to `test-web.yaml / unit-tests`.
- `git merge-tree --write-tree` of HEAD plus my partition against `origin/pr213` (`b3b7dbc`): no conflicts. The first version had four conflicts (11, 14, 16, `auction-setup.ts`); I moved those markers one line below the constant they describe and said so in the marker text.
- The SDK was not rebuilt; the existing `source/atomica-sdk/dist` was used. No tracked build output changed. Browser integration tests were not run.
- `git status --short` for my partition: 65 modified files and 6 new files, all intended.

## Suggested order

1. getDerivedAddress lowercase (232): independent, one SDK line.
2. Pull request 213 (194), then the price unit (217): every test size depends on both.
3. Bid validity (216), then caps (218): resize 10 and 16 once, with whole-USD prices, a seller supply of at least 0.01 FakeETH, and quantities at or below supply.
4. Reserve price (241) and dead Move code (238) together: same `create_auction` call sites.
5. Pair allowlist (224), then create_auction registers the timelock (243) with the fork registrar image (225): same `createLiveWindow` and `AuctionCreator` lines; 243 needs the test-cap answer first.
6. Window id formula (220), then LockBox deadline (221) and leaf rule (222) with the SDK unwind issue (195) in one LockBox redeploy.
7. FakeUSD registration (233), then pin check (234): same bidder lock step; add browser polyfills first.
8. On-chain bid opening (228), then the salt issue (235) without its storage half, then the UI happy path (236) on top of 195.
