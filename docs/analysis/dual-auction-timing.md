# Dual Auction Timing Specification: Triple-Hub Bridge

## Executive Summary

**Standard Times: 16:30 UTC and 07:00 UTC**

Atomica's dual-auction model is a strategically calibrated system designed to synchronize global liquidity. A core pillar of the strategy is the **Consolidation of the Americas**, ensuring that both California (SF) and New York (NY) are served by the same daily liquidity event: the **Western Daily**.

| Auction | UTC Time | Strategic Market | Primary Bridge | Strategic Anchor |
| :--- | :--- | :--- | :--- | :--- |
| **Western Daily** | **16:30 UTC** | **WEST MARKET** | Atlantic / Americas Bridge | **Unified Americas (SF & NY)** $\leftrightarrow$ London Afternoon |
| **Eastern Daily** | **07:00 UTC** | **EAST MARKET** | Euro-Asia Bridge | Tokyo Afternoon $\leftrightarrow$ London Early-Bird |

---

## 1. The Quality of Life (QoL) Engine

Auction timing is dictated by the **Seller Signature Deadline** (Auction Start), which requires active coordination.

### 1.1 The Operational Buffer
- **2h Lead Time**: Sellers must finalize multisigs and audit transactions ~2 hours before the deadline.
- **Institutional Minimum**: A signature deadline before 08:30 AM local time is considered "High Friction."

### 1.2 The Bidding Flexibility
- **24h Lead Time**: Bidders are desk-independent. They can submit, adjust, or cancel bids well in advance of the session close.
- **Coverage**: This allows a New York trader to participate in the Eastern Daily session as a bidder without being awake at 02:45 AM.

---

## 2. Consolidation of the Americas (Western Daily: WEST MARKET)

The **Western Daily (16:30 UTC)**, visualized as the **WEST MARKET** corridor, is specifically optimized to pool the liquidity of both US coasts into a single ocean of collateral.

| Hub | Local (Winter) | Seller QoL (2h Prep) | Coordination Status |
| :--- | :--- | :--- | :--- |
| **New York** | 11:30 AM | **Perfect** (09:30 AM start) | Peak institutional morning. |
| **San Francisco** | 08:30 AM | **Perfect** (06:30 AM start) | Anchors the absolute start of the US market open. |

### Why Unified Americas Wins:
1. **Network Effect**: Pooling SF and NY volume into the same 15-minute window creates a much higher "Gravity" for global bidders.
2. **Standardization**: Provides a single "Market Open" event for all US-based DAOs and funds.
3. **Strategic Pivot**: Transitioning from 16:15 to 16:30 ensures the San Francisco desk hits the 08:30 AM threshold perfectly, maximizing West Coast participation.

---

## 3. Impact on European Peak Hours

The choice of the Western Daily time creates a direct trade-off for European participants.

### 3.1 16:30 UTC (The Atlantic Peak)
- **London (4:30 PM GMT)**: Trading day close; captures late-day liquidity volume.
- **Frankfurt (5:30 PM CET)**: Post-market wrap-up.
- **Verdict**: Maintains high liquidity while enabling a better US Open synchronization.

### 3.2 17:00 UTC (The Closing Pulse)
- **London (5:00 PM GMT)**: Post-LSE close (4:30 PM). Desks shift to "Clean-up" mode.
- **Verdict**: Higher friction for active trading, better for automated settlement.

---

## 4. The Euro-Asia Bridge (Eastern Daily: EAST MARKET)

The **Eastern Daily (07:00 UTC)**, or **EAST MARKET**, bridges the core Asian afternoon volume with the earliest European desk arrivals.

- **Tokyo (4:00 PM JST)**: Peak afternoon trading. **Perfect QoL.**
- **Singapore/Hong Kong (3:00 PM SGT/HKT)**: Core afternoon liquidity.
- **London (7:00 AM GMT)**: Early-bird desk arrival; requires automated high-readiness for coordinating desks.

---

## 5. Unified Global Synchronization Matrix

| Region | Morning (Arrival) | Mid-Day (Peak) | Afternoon (Closing) |
| :--- | :--- | :--- | :--- |
| **Americas** | Western Daily (SF) | Western Daily (NY) | — |
| **Europe** | Eastern Daily | — | Western Daily |
| **Asia** | — | — | Eastern Daily |

---

## Related Documents
- [Optimal Time of Day (Historical Analysis)](./optimal-time-of-day.md)
- [Market Volume by Participant Category](./market-volume-by-participant-category.md)
- [Batch Auction Economics](../game-theory/batch-auction-economics.md)
