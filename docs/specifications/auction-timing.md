# Auction Timing Specification (Canonical)

**Status:** Canonical
**Last Updated:** 2026-11-11
**Owner:** Product + Protocol Design

This document is the single source of truth for Atomica auction timing.

## Canonical Schedule

- **Eastern Auction:** `07:45 UTC`
- **Western Auction:** `16:15 UTC`
- **Frequency:** Twice daily

## Naming

- `07:45 UTC`: **Euro-Asia Bridge**
- `16:15 UTC`: **Atlantic / Americas Bridge**

## Rationale

- Captures global professional desk overlap windows.
- Aligns with Tokyo late-session, London morning, and US morning participation.
- Concentrates liquidity into two predictable clearing events.
- Provides stable UTC anchors (no DST ambiguity in protocol logic).

## Operational Guidance

<!-- SCOUT(#231) DOC: add the chain epoch rule: epochs end at fixed UTC times at least 25 minutes from both closes (after the owner answers the questions of this issue). -->
<!-- SCOUT(#243) DOC: "decryption deadlines MUST key off UTC timestamps": the first seller of a window picks the timelock deadline today; say that create_auction registers it at the window close. -->

- All protocol-level timing MUST be specified in UTC.
- Frontends MAY display localized times, but UTC is authoritative.
- Scheduling, decryption deadlines, and settlement windows MUST key off UTC timestamps.

## Settlement Coupling

<!-- SCOUT(#242) DOC: "Settlement target remains 1-3 hours post-close" has no mechanism: settle is callable from the reveal and the budget below allows up to 72 h before reclaim. -->

- Auction close occurs at the canonical timestamps above.
- Settlement target remains **1-3 hours post-close** (see PRD for settlement flow details).

## Ethereum Lock Deadline

<!-- SCOUT(#221) DOC: "carries that window's lock deadline": LockBox computes it from the window id; the caller passes none, and lock rejects a closed window or one more than one ahead. -->
<!-- SCOUT(#222) DOC: "Before it, only a proven Aptos AuctionOutcome releases the lock": add reclaimUnpayable for a recorded but unpayable leaf. -->

Every Ethereum lock is bound to one auction window and carries that window's
lock deadline (issue 203). After the deadline, anyone may `reclaim` an open
lock to its depositor on Ethereum. Before it, only a proven Aptos
`AuctionOutcome` releases the lock.

<!-- SCOUT(#221) DOC: reclaim delay bullet: the value is frozen into the immutable LockBox, so the owner fixes it first (review decision 36); third bullet: "Aptos registers a lock only with this deadline" becomes "LockBox computes it". -->

- **Window close.** `auction::current_window_id` changes exactly at the two
  canonical closes, 07:45 UTC (27 900 s into the UTC day) and 16:15 UTC
  (58 500 s): `day * 2 + (t >= 27900 ? 1 : 0) + (t >= 58500 ? 1 : 0)`, with
  `day = s / 86400` and `t = s % 86400`. Window `w` closes at
  `close(w) = (w / 2) * 86400 + (w even ? 27900 : 58500)` (unix seconds), the
  first second of window `w + 1` (`eth_proof::window_close_secs`). An even
  window closes at 07:45 UTC, an odd window at 16:15 UTC.
- **`ETH_RECLAIM_DELAY_SECS = 259200` (72 hours)**
  (`eth_proof::ETH_RECLAIM_DELAY_SECS`, SDK `ETH_RECLAIM_DELAY_SECS`).
- **`eth_lock_deadline(w) = close(w) + ETH_RECLAIM_DELAY_SECS`**
  (`auction::eth_lock_deadline`). It is a pure function of the window id,
  because a lock is made before its window or timelock exists. Aptos
  registers a lock only with this deadline, so every lock of an auction
  shares it.

### Settle deadline, stuck deadline and lock deadline

<!-- SCOUT(#242) DOC: the settle and stuck deadline bullets describe open pull request 213: main has no stuck deadline, no unwind and no time limit on settle. -->
<!-- SCOUT(#228) DOC: stuck deadline bullet: drop "plus the 10-minute opening window (OPENING_WINDOW_US)", and drop OPENING_WINDOW_US from the stuck_deadline_us block that open pull request 213 adds below. -->

The owner decision of 2026-11-11 (issue 194) keeps two Aptos deadlines apart
from the Ethereum lock deadline:

- **Settle.** From reveal onward, any account may call `settle`. It honours
  the cleared fills and stays callable until the window's stuck deadline.
- **Stuck deadline** (issue 194): the reveal deadline plus the 10-minute
  opening window (`OPENING_WINDOW_US`) plus the unwind grace. After it, any
  account may `unwind` the window, and every coin it still holds goes back to
  its depositor.
- **Carrier margin:** the time any user needs to fetch the outcome proof from
  an Atomica node and call `LockBox.recordOutcome` on Ethereum, including any
  light client epoch advance.

The order is a protocol invariant:

```
stuck deadline + carrier margin  <  eth_lock_deadline(window_id)
```

So unwind and outcome carrying always finish before Ethereum reclaim opens,
and a reclaim never races an outcome that Aptos already finalized.
`create_auction` aborts `E_STUCK_AFTER_LOCK_DEADLINE` when the window's
timelock breaks it. `submit_bid` needs no second check: the window's timelock
and the configured values never change after `create_auction`.

On Aptos (all times in microseconds):

```
stuck_deadline_us = timelock reveal expiry + OPENING_WINDOW_US + unwind grace
settle:  timelock deadline <= now < stuck_deadline_us
unwind:  now >= stuck_deadline_us
```

`auction::get_stuck_deadline_us(window_id, pair_bcs)` returns it.

<!-- SCOUT(#221) DOC: budget table: the 72 h total is the reclaim delay the owner must fix before LockBox freezes it (review decision 36). -->
<!-- SCOUT(#228) DOC: budget table: remove the "Opening window, 10 min" row. -->
<!-- SCOUT(#243) DOC: budget table: once the timelock deadline is the window close, the first row shrinks from 23 h 50 min to the 10-minute reveal window. -->

| Segment | Budget within the 72 h delay |
| --- | --- |
| Window close to reveal deadline (key release) | at most 23 h 50 min |
| Opening window | 10 min |
| Unwind grace (stuck deadline) | 24 h |
| Carrier margin | 24 h |
| **Total** | **at most 72 h** |

The unwind grace and the carrier margin are `timelock_config` values
(`get_unwind_grace_us`, `get_carrier_margin_us`), both 24 h. Any choice must
keep the sum within `ETH_RECLAIM_DELAY_SECS`. The receipt cancel delay
(`get_receipt_cancel_delay_us`, 24 h) is the age after which anyone may cancel
a receipt no window claimed.

## Superseded Documents

- `docs/analysis/optimal-time-of-day.md` (historical single-window analysis)
- `docs/analysis/dual-auction-timing.md` (intermediate dual-window analysis)

## Related Docs

- `docs/specifications/prd.md`
- `docs/game-theory/batch-auction-economics.md`
- `docs/analysis/market-volume-by-participant-category.md`
