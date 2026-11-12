/**
 * Planned unit tests for every component that shows a price.
 *
 * Scout stub: every case is a todo. SettlementStatus and WithdrawWinnings
 * have browser-mode tests only (tests/*.test.tsx), which no CI job runs.
 * BidHistory is covered only by tests/integration/13-bid-history.test.tsx,
 * which runs in the Browser Tests (claim-reclaim-fees) chunk on live chains.
 *
 * Runs in the Unit Tests (atomica-sdk, atomica-web-components) job through
 * vitest.unit.config.ts.
 */

import { describe, it } from "vitest";

describe("price display — planned", () => {
  it.todo(
    "SCOUT(#217) BidHistory renders a recorded clearing price of 2000n as $2000",
  );
  it.todo(
    "SCOUT(#217) SettlementStatus renders a settlement event with clearing price 2000n as $2000",
  );
  it.todo(
    "SCOUT(#217) WithdrawWinnings renders a settlement event with clearing price 2000n as $2000",
  );
  it.todo(
    "SCOUT(#217) AuctionRevealer lists a decrypted bid of 2000n as $2000",
  );
  it.todo("SCOUT(#217) no component divides a price by one million");
});
