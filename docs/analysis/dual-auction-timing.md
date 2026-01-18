# Dual Auction Timing Specification: Triple-Hub Bridge

## Executive Summary

**Recommendation: 16:15 UTC and 07:45 UTC (15-minute windows)**

Atomica operates two daily batch auctions strategically timed as "Global Bridges." These windows hit the maximum overlap between closing and opening daily sessions in the three primary crypto-institutional hubs: Tokyo/Singapore, London/Europe, and New York/San Francisco.

| Auction | UTC Time | Rationale | Key Hub Status |
| :--- | :--- | :--- | :--- |
| **Western Daily** | **16:15 UTC** | Atlantic Bridge | SF 8:15 AM (Arrival) / NY 11:15 AM (Peak) / Lon 4:15 PM (Afternoon) |
| **Eastern Daily** | **07:45 UTC** | Euro-Asia Bridge | Lon 7:45 AM (Arrival) / Tokyo 4:45 PM (Closing Cross) |

---

## 1. Western Daily: The Atlantic Bridge (16:15 UTC)

### Strategic Goal
To capture the high-volume overlap of the New York morning institutional flow and the European afternoon peak, while anchoring to the desk arrival of San Francisco teams.

### Hub Status at 16:15 UTC
- **San Francisco (8:15 AM PT):** Professional desk arrival. First tactical window of the day.
- **New York (11:15 AM ET):** Institutional peak morning flow. Deepest volume window for US-based desks.
- **London/Frankfurt (4:15 PM GMT / 5:15 PM CET):** High-activity afternoon session. Desks are still fully staffed and active.

---

## 2. Eastern Daily: The Euro-Asia Bridge (07:45 UTC)

### Strategic Goal
To bridge the European morning arrival with the "Closing Cross" liquidity of the Tokyo and Pan-Asian sessions.

### Hub Status at 07:45 UTC
- **Tokyo (4:45 PM JST):** Closing session. Market-makers and desks are squaring positions for the daily close.
- **Singapore/Hong Kong (3:45 PM SGT/HKT):** Afternoon session peak.
- **London/Frankfurt (7:45 AM GMT / 8:45 AM CET):** Desk arrival. This captures the first "at-desk" coordination of the European morning.
- **Dubai (11:45 AM GST):** Mid-day peak activity.

---

## 3. Support for Professional Participation

Atomica's timing focuses on **Professional Liquidity Events**. By 07:45 and 16:15 local time, desks in London and SF are generally staffed, daily briefings are complete, and multi-sig signers are available to coordinate trades. 

Similarly, the 4:45 PM JST window in Tokyo captures the final burst of activity before Asian desks hand off their primary risk to the European session.

### Optimization Rationale:
1. **The "Hand-off" Pulse:** The schedule creates two deep liquidity events centered on the moments when global sessions transition (Asia $\rightarrow$ EU and EU $\rightarrow$ US).
2. **Stablecoin/CEX Depth:** These windows align with the deepest order book depth on major CEXs, providing accurate reference pricing for solvers and bidders.
3. **Institutional Synergy:** Allows professional desks to participate in at least one (and often two) auctions within their standard daily work hours.

---

## 4. Uncovered Windows

The primary gaps remain:
- **US Market Close (21:00 UTC):** Occurs 4.5 hours after the Western Daily auction. (Low crypto-native institutional priority).
- **Early-Morning Tokyo (00:00 UTC):** While a major retail window, it suffers from a global liquidity "dead zone" in other hubs.

---

## 5. Seasonal Performance & Daylight Saving Impact

Atomica maintains a **Fixed UTC** schedule. While this causes a 1-hour shift in local time for Western hubs, it ensures permanent stability for non-DST hubs like Tokyo, Singapore, and Dubai.

### Local Time Performance (07:45 & 16:15 UTC)

| Hub | Winter Local | Summer Local | Analysis |
| :--- | :--- | :--- | :--- |
| **Tokyo** | **4:45 PM** | **4:45 PM** | **Permanent Anchor.** Constant closing cross coverage. |
| **London** | **7:45 AM** | **8:45 AM** | **Improved.** Summer arrival (8:45 AM) allows better desk readiness. |
| **New York** | **11:15 AM**| **12:15 PM**| **High Liquidity.** Remains in the peak US institutional window. |
| **SF** | **8:15 AM** | **9:15 AM** | **Improved.** Reduces morning coordination friction for multi-sig. |

### Why Fixed UTC Wins:
1. **Network Regularity:** Avoids biannual "drift weeks" where US/UK DST dates diverge, preventing settlement confusion.
2. **Institutional Sync:** Professional traders in Asia (who do not use DST) are not forced to follow Western seasonal shifts.
3. **Smart Contract Simplicity:** Eliminates the need for complex DST-aware logic in time-lock encryption or settlement triggers.

---

## Related Documents
- [Optimal Time of Day (Historical Analysis)](./optimal-time-of-day.md)
- [Market Volume by Participant Category](./market-volume-by-participant-category.md)
- [Batch Auction Economics](../game-theory/batch-auction-economics.md)
