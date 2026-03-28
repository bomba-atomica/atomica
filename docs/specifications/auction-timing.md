# Auction Timing Specification (Canonical)

**Status:** Canonical
**Last Updated:** 2026-03-02
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

- All protocol-level timing MUST be specified in UTC.
- Frontends MAY display localized times, but UTC is authoritative.
- Scheduling, decryption deadlines, and settlement windows MUST key off UTC timestamps.

## Settlement Coupling

- Auction close occurs at the canonical timestamps above.
- Settlement target remains **1-3 hours post-close** (see PRD for settlement flow details).

## Superseded Documents

- `docs/analysis/optimal-time-of-day.md` (historical single-window analysis)
- `docs/analysis/dual-auction-timing.md` (intermediate dual-window analysis)

## Related Docs

- `docs/specifications/prd.md`
- `docs/game-theory/batch-auction-economics.md`
- `docs/analysis/market-volume-by-participant-category.md`
