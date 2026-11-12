/**
 * Planned unit tests for the bid opening storage (src/storage/bidStorage.ts).
 *
 * Scout stub: every case is a todo. The existing storage cases live in
 * tests/integration/12a-bid-storage.test.tsx, which no CI job runs. New cases
 * go here so the Unit Tests (atomica-sdk, atomica-web-components) job runs
 * them through vitest.unit.config.ts.
 */

import { describe, it } from "vitest";

describe("bidStorage — planned", () => {
  it.todo(
    "SCOUT(#235) saveBidOpening then loadBidOpening returns the same price, salt and commitment",
  );
  it.todo("SCOUT(#235) loadBidOpening returns null when nothing is stored");
  it.todo(
    "SCOUT(#235) computeBidCommitment(price, salt, ad) of a loaded opening equals its stored commitment",
  );
  it.todo(
    "SCOUT(#235) two bids of one bidder in one window keep separate openings",
  );
  it.todo(
    "SCOUT(#217) a stored price is read back in whole USD per whole base token",
  );
  it.todo(
    "SCOUT(#228) the opening storage is gone and no salt is written to localStorage",
  );
});
