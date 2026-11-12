/**
 * Planned tests for the price unit helpers (src/price.ts).
 *
 * A price is whole USD per whole base token, as an unsigned integer with no
 * decimal shift.
 */
import { describe, it } from "vitest";

describe("price unit (planned, SCOUT)", () => {
  it.todo(
    "SCOUT(#217) parsePrice of 2000 is 2000n and formatPrice of 2000n is $2000",
  );
  it.todo(
    "SCOUT(#217) parsePrice throws on an empty string, 0, -1, 2000.5, abc and 18446744073709551616",
  );
  it.todo(
    "SCOUT(#217) quoteForFill of 10^18 base units at parsePrice of 2000 is 2000 * 10^6 FakeUSD units",
  );
});
