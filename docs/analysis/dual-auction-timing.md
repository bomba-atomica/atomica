# Dual Auction Timing Specification: Triple-Hub Bridge

## Executive Summary

**Standard Times: 16:15 UTC and 07:45 UTC**

Atomica's dual-auction model is a strategically calibrated system designed to synchronize global liquidity. A core pillar of the strategy is the **Consolidation of the Americas**, ensuring that both California (SF) and New York (NY) are served by the same daily liquidity event: the **Western Daily**.

| Auction | UTC Time | Strategic Market | Primary Bridge | Strategic Anchor |
| :--- | :--- | :--- | :--- | :--- |
| **Western Daily** | **16:15 UTC** | **WEST MARKET** | Atlantic / Americas Bridge | **Unified Americas (SF & NY)** $\leftrightarrow$ London Afternoon |
| **Eastern Daily** | **07:45 UTC** | **EAST MARKET** | Euro-Asia Bridge | Tokyo Close $\leftrightarrow$ London Morning |

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

The **Western Daily (16:15 UTC)**, visualized as the **WEST MARKET** corridor, is specifically optimized to pool the liquidity of both US coasts into a single ocean of collateral.

| Hub | Local (Winter) | Seller QoL (2h Prep) | Coordination Status |
| :--- | :--- | :--- | :--- |
| **New York** | 11:15 AM | **Perfect** (09:15 AM start) | Peak institutional morning. |
| **San Francisco** | 08:15 AM | **Tight** (06:15 AM start) | Requires early readiness; anchors the US market open. |

### Why Unified Americas Wins:
1. **Network Effect**: Pooling SF and NY volume into the same 15-minute window creates a much higher "Gravity" for global bidders.
2. **Standardization**: Provides a single "Market Open" event for all US-based DAOs and funds.
3. **The 17:00 UTC Alternative**: Shifting toward 17:00 UTC (9 AM PT / 12 PM ET) would make the window "Perfect" for both coasts but pushes the European session into the post-market "Closing Pulse."

---

## 3. Impact on European Peak Hours

The choice of the Western Daily time creates a direct trade-off for European participants.

### 3.1 16:15 UTC (The Atlantic Peak)
- **London (4:15 PM GMT)**: Maximum institutional activity. High overlap with the US morning entry.
- **Frankfurt (5:15 PM CET)**: Final hour of the core trading day.
- **Verdict**: This is the **Maximum Liquidity Overlap**.

### 3.2 17:00 UTC (The Closing Pulse)
- **London (5:00 PM GMT)**: Post-LSE close (4:30 PM). Desks shift to "Clean-up" mode.
- **Verdict**: Higher friction for active trading, better for automated settlement.

---

## 4. The Euro-Asia Bridge (Eastern Daily: EAST MARKET)

The **Eastern Daily (07:45 UTC)**, or **EAST MARKET**, bridges the closing volume of the Asian session with the opening of the European desks.

- **Tokyo (4:45 PM JST)**: Captures the "Closing Cross." **Perfect QoL.**
- **Singapore/Hong Kong (3:45 PM SGT/HKT)**: Mid-afternoon liquidity.
- **London (7:45 AM GMT)**: Desk arrival; captures early-bird institutional flow.

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
