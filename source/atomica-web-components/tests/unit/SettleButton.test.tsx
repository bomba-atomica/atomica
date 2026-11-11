/**
 * Planned unit tests for SettleButton.
 *
 * Scout stub: every case is a todo. SettleButton has no unit test today. Its
 * only tests are the live browser cases in tests/integration/10-settle.test.tsx
 * and 14-happy-path.test.tsx.
 *
 * Runs in the Unit Tests (atomica-sdk, atomica-web-components) job through
 * vitest.unit.config.ts.
 */

import { describe, it } from "vitest";

describe("SettleButton — planned", () => {
  it.todo("SCOUT(#217) renders a clearing price of 2000n as $2000");
  it.todo(
    "SCOUT(#238) shows the filled total that get_settlement returns, not the window supply",
  );
  it.todo(
    "SCOUT(#238) shows the raw abort message for an unknown abort, with no E_NOT_IMPLEMENTED branch",
  );
  it.todo(
    "SCOUT(#236) enables from chain state when no auctionEndTime prop is passed",
  );
});
