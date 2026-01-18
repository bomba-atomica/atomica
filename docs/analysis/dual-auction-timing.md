# Dual Auction Timing Specification: Triple-Hub Bridge

## Executive Summary

**Recommendation: 16:15 UTC and 07:45 UTC (15-minute windows)**

Atomica operates two daily batch auctions strategically timed as "Global Bridges." These windows hit the maximum overlap between closing and opening daily sessions in the three primary crypto-institutional hubs: Tokyo/Singapore, London/Europe, and New York/San Francisco.

| Auction | UTC Time | Rationale | Key Hub Status |
| :--- | :--- | :--- | :--- |
| **Western Daily** | **16:15 UTC** | Atlantic Bridge | SF 8:15 AM (Arrival) / NY 11:15 AM (Peak) / Lon 4:15 PM (Afternoon) |
| **Eastern Daily** | **07:45 UTC** | Euro-Asia Bridge | Lon 7:45 AM (Arrival) / Tokyo 4:45 PM (Closing Cross) |

---

## 1. Quality of Life (QoL) Metrics

To ensure high participation, we analyze timing through two distinct Quality of Life lenses:

### 1.1 Seller Operationalization (High Overhead)
- **The Buffer**: "Auction Start" is the deadline for sellers to sign lock transactions.
- **Requirement**: Sellers often need **2 hours of lead time** before the start to coordinate multisigs and operationalize the trade. 
- **QoL Failure**: A deadline at 8:15 AM local time implies a coordination window starting at 6:15 AM—a "Poor" QoL for most humans.

### 1.2 Bidder Flexibility (Low Overhead)
- **The Window**: Bidders can submit at any point during the auction window or pre-plan bids up to 24h in advance.
- **QoL Success**: Bidders are desk-independent. As long as the auction window exists during their daytime (for manual oversight) or they have lead time to set automated parameters, QoL is "Good."

---

## 2. Western Daily: The Atlantic Bridge (16:15 UTC)

### Strategic Goal
To capture the high-volume overlap of the New York morning institutional flow and the European afternoon peak, while anchoring to the desk arrival of San Francisco teams.

### Hub Status at 16:15 UTC (Standard Time)
- **San Francisco (8:15 AM PT):** 
    - **Institutional**: Professional desk arrival. First tactical window of the day.
    - **"SF Degenerate"**: Poor QoL. With an 11:00 AM wake-up preference, the 8:15 AM deadline (requiring 6:15 AM prep) creates a real-world coordination friction.
- **New York (11:15 AM ET):** Institutional peak morning flow. Deepest volume window for US-based desks.
- **London/Frankfurt (4:15 PM GMT / 5:15 PM CET):** High-activity afternoon session. Desks are still fully staffed and active.

---

## 3. Eastern Daily: The Euro-Asia Bridge (07:45 UTC)

### Strategic Goal
To bridge the European morning arrival with the "Closing Cross" liquidity of the Tokyo and Pan-Asian sessions.

### Hub Status at 07:45 UTC (Standard Time)
- **Tokyo (4:45 PM JST):** Closing session. Market-makers and desks are squaring positions for the daily close. **Ideal QoL.**
- **Singapore/Hong Kong (3:45 PM SGT/HKT):** Afternoon session peak.
- **London/Frankfurt (7:45 AM GMT / 8:45 AM CET):** Desk arrival. High friction for sellers needing 2h prep (5:45 AM GMT start).
- **Dubai (11:45 AM GST):** Mid-day peak activity.

---

## 4. Trader Archetypes & Coordination Issues

Real-world coordination is governed by trader archetypes rather than just timezone math.

| Archetype | Active Hours | QoL Constraint |
| :--- | :--- | :--- |
| **Institutional** | 09:00 – 18:00 | Require standard business hours for compliance & multisig. |
| **SF Degenerate** | 11:00 – 03:00 | "Don't get out of bed early." High friction for morning deadlines. |

### The "Atlantic Gap" Critique
While the **Western Daily (16:15 UTC)** is perfectly centered on NY/London, it creates a significant burden for **SF-based Sellers**:
1. Items can be listed 24h in advance.
2. However, the final signature deadline (8:15 AM local) forces an "early rise" for multisig signers.
3. Bidders face no such constraint as they can bid throughout the previous 24h or during their local daytime afternoon.

---

## 5. Support for Professional Participation

Atomica's timing focuses on **Professional Liquidity Events**. By 07:45 and 16:15 local time, desks in London and SF are generally staffed, daily briefings are complete, and multi-sig signers are available to coordinate trades. 

Similarly, the 4:45 PM JST window in Tokyo captures the final burst of activity before Asian desks hand off their primary risk to the European session.

### Optimization Rationale:
1. **The "Hand-off" Pulse:** The schedule creates two deep liquidity events centered on the moments when global sessions transition (Asia $\rightarrow$ EU and EU $\rightarrow$ US).
2. **Stablecoin/CEX Depth:** These windows align with the deepest order book depth on major CEXs, providing accurate reference pricing for solvers and bidders.
3. **Institutional Synergy:** Allows professional desks to participate in at least one (and often two) auctions within their standard daily work hours.

---

## 6. Uncovered Windows

The primary gaps remain:
- **US Market Close (21:00 UTC):** Occurs 4.5 hours after the Western Daily auction. (Low crypto-native institutional priority).
- **Early-Morning Tokyo (00:00 UTC):** While a major retail window, it suffers from a global liquidity "dead zone" in other hubs.

---

## 7. Seasonal Performance & Daylight Saving Impact

Atomica maintains a **Fixed UTC** schedule. While this causes a 1-hour shift in local time for Western hubs, it ensures permanent stability for non-DST hubs like Tokyo, Singapore, and Dubai.

### Local Time Performance (07:45 & 16:15 UTC)

| Hub | Winter Local | Summer Local | QoL Analysis |
| :--- | :--- | :--- | :--- |
| **Tokyo** | **4:45 PM** | **4:45 PM** | **Permanent Anchor.** Constant closing cross coverage. Perfect QoL. |
| **London** | **7:45 AM** | **8:45 AM** | **Friction.** Summer arrival (8:45 AM) reduces prep friction vs Winter (7:45 AM). |
| **New York** | **11:15 AM**| **12:15 PM**| **High Liquidity.** Ideally suited for both Institutional and Degen archetypes. |
| **SF** | **8:15 AM** | **9:15 AM** | **Friction.** Winter (8:15 AM) is a major "Degen" coordination blocker. |

---

## Related Documents
- [Optimal Time of Day (Historical Analysis)](./optimal-time-of-day.md)
- [Market Volume by Participant Category](./market-volume-by-participant-category.md)
- [Batch Auction Economics](../game-theory/batch-auction-economics.md)
