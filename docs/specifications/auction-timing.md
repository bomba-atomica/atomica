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

- All protocol-level timing MUST be specified in UTC.
- Frontends MAY display localized times, but UTC is authoritative.
- Scheduling, decryption deadlines, and settlement windows MUST key off UTC timestamps.
- The decryption deadline of a window is its close. The first `create_auction`
  of a window id registers the window's one timelock with deadline
  `eth_proof::window_close_secs(window_id)`; no seller picks it.
- Only a test chain (chain id 4) may store a shorter window schedule, through
  `eth_proof::set_window_schedule` (the docker testnet uses `900:900`, one close
  every 15 minutes). A production chain always closes at 07:45 and 16:15 UTC.

## Settlement Coupling

<!-- SCOUT(#242) DOC: "Settlement target remains 1-3 hours post-close" has no mechanism: settle is callable from the reveal and the budget below allows up to 72 h before reclaim. -->

- Auction close occurs at the canonical timestamps above.
- Settlement target remains **1-3 hours post-close** (see PRD for settlement flow details).

## Ethereum Lock Deadline

Every Ethereum lock is bound to one auction window and carries that window's
lock deadline (issue 203). LockBox computes the deadline from the window id,
`lockDeadline(windowId)`; the caller passes none (issue 221). `LockBox.lock`
reverts `WindowClosed` for a window below the current one and
`WindowTooFarAhead` for one more than one ahead, the same two windows Aptos
`create_auction` accepts. So no wallet can strand a lock behind a wrong or
far-future deadline. A lock sent in a window's last seconds may be mined in
the next window and revert with no funds moved: clients should target the
next window near a close. After the deadline, anyone may `reclaim` an open
lock to its depositor on Ethereum. Before it, only a proven Aptos
`AuctionOutcome` closes the lock: `releaseByOutcome` pays its leaf, or
`reclaimUnpayable` returns it whole when that leaf is unpayable (issue 222).

LockBox takes its window clock as constructor immutables: seconds per day and
one or two close offsets (`DeployLockBox.productionWindowSchedule()`:
`86400` and `[27900, 58500]`). Nothing can change them after deploy.

- **Window close.** `auction::current_window_id` changes exactly at the two
  canonical closes, 07:45 UTC (27 900 s into the UTC day) and 16:15 UTC
  (58 500 s): `day * 2 + (t >= 27900 ? 1 : 0) + (t >= 58500 ? 1 : 0)`, with
  `day = s / 86400` and `t = s % 86400`. Window `w` closes at
  `close(w) = (w / 2) * 86400 + (w even ? 27900 : 58500)` (unix seconds), the
  first second of window `w + 1` (`eth_proof::window_close_secs`). An even
  window closes at 07:45 UTC, an odd window at 16:15 UTC.
- **`ETH_RECLAIM_DELAY_SECS = 259200` (72 hours)**
  (`eth_proof::ETH_RECLAIM_DELAY_SECS`, SDK `ETH_RECLAIM_DELAY_SECS`,
  `LockBox.RECLAIM_DELAY`). The immutable LockBox freezes it, so this value is
  final (review decision 36 settled it at 72 hours).
- **`eth_lock_deadline(w) = close(w) + ETH_RECLAIM_DELAY_SECS`**
  (`auction::eth_lock_deadline`, `LockBox.lockDeadline`). It is a pure
  function of the window id, because a lock is made before its window or
  timelock exists. LockBox computes it for every lock, and
  `register_ethereum_lock` proves the lock commitment against it, so every
  lock of an auction shares it. The shared table
  `source/atomica-sdk/tests/fixtures/window_clock_vectors.json` pins the
  values that Solidity, Move and the SDK must agree on.

### Settle deadline, stuck deadline and lock deadline

<!-- SCOUT(#242) DOC: the settle and stuck deadline bullets describe open pull request 213: main has no stuck deadline, no unwind and no time limit on settle. -->

The owner decision of 2026-11-11 (issue 194) keeps two Aptos deadlines apart
from the Ethereum lock deadline:

- **Settle.** From reveal onward, any account may call `settle`. It honours
  the cleared fills and stays callable until the window's stuck deadline.
- **Stuck deadline** (issues 194, 228): the reveal deadline plus the unwind
  grace. There is no opening window: the chain opens bids itself with
  `open_bids` once the key is revealed. A window whose bids nobody opens by the
  stuck deadline unwinds. After it, any account may `unwind` the window, and
  every coin it still holds goes back to its depositor.
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
stuck_deadline_us = timelock reveal expiry + unwind grace
settle:  timelock deadline <= now < stuck_deadline_us
unwind:  now >= stuck_deadline_us
```

`auction::get_stuck_deadline_us(window_id, pair_bcs)` returns it.

| Segment | Budget within the 72 h delay |
| --- | --- |
| Window close to reveal deadline (key release) | 10 min (reveal window) |
| Unwind grace (stuck deadline) | 24 h |
| Carrier margin | 24 h |
| **Total** | **48 h 10 min, within 72 h** |

The 72 h reclaim delay that LockBox freezes at deploy bounds the total. The
timelock deadline is the window close, so the first row is only the reveal
window.

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
