/**
 * Planned unit tests for ReleaseButton and useWindowRelease.
 *
 * Scout stub: every case is a todo. The component stub
 * (src/components/ReleaseButton.tsx) renders nothing and the hook stub
 * (src/hooks/useWindowRelease.ts) throws, so nothing is imported here yet.
 *
 * Runs in the Unit Tests (atomica-sdk, atomica-web-components) job through
 * vitest.unit.config.ts.
 */

import { describe, it } from "vitest";

describe("ReleaseButton — planned", () => {
  it.todo("SCOUT(#236) calls the outcome carrier before any releaseByOutcome");
  it.todo(
    "SCOUT(#236) skips the carrier when LockBox.outcomes(auctionKey) is already set",
  );
  it.todo("SCOUT(#236) calls releaseByOutcome once per open lock");
  it.todo(
    "SCOUT(#236) shows the status of each lock and is disabled when every lock is released",
  );
  it.todo(
    "SCOUT(#236) a second press finds no open lock and sends no transaction",
  );
  it.todo(
    "SCOUT(#236) works for a wallet that is neither the seller nor a bidder",
  );
  it.todo(
    "SCOUT(#222) falls back to reclaimUnpayable when the leaf of a lock is unpayable",
  );
});
