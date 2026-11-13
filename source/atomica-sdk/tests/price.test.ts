/**
 * Price unit helpers (src/price.ts).
 *
 * A price is whole USD per whole base token, as an unsigned integer with no
 * decimal shift.
 */
import { describe, expect, it } from "vitest";
import {
  formatPrice,
  parsePrice,
  quoteForFill as rootQuoteForFill,
} from "../src/index.js";
import { quoteForFill } from "../src/price.js";
import { quoteForFill as bridgeQuoteForFill } from "../src/settlement/bridge.js";

const ETH = 10n ** 18n;
const USD = 10n ** 6n;

describe("price unit", () => {
  it("parsePrice of 2000 is 2000n and formatPrice of 2000n is $2000", () => {
    expect(parsePrice("2000")).toBe(2000n);
    expect(formatPrice(2000n)).toBe("$2000");
    expect(formatPrice(parsePrice("2000"))).toBe("$2000");
  });

  it("parsePrice throws on an empty string, 0, -1, 2000.5, abc and 18446744073709551616", () => {
    for (const bad of [
      "",
      "0",
      "-1",
      "+1",
      "2000.5",
      "abc",
      "18446744073709551616",
    ]) {
      expect(() => parsePrice(bad), bad).toThrow();
    }
    // u64 max itself is accepted.
    expect(parsePrice("18446744073709551615")).toBe(2n ** 64n - 1n);
  });

  it("quoteForFill of 10^18 base units at parsePrice of 2000 is 2000 * 10^6 FakeUSD units", () => {
    expect(quoteForFill(ETH, parsePrice("2000"))).toBe(2000n * USD);
  });

  it("prices FakeUSD with 6 decimals against 18-decimal FakeETH, rounding down", () => {
    expect(quoteForFill(ETH / 2n, 2010n)).toBe(1_005n * USD);
    expect(quoteForFill(1n, 1n)).toBe(0n);
  });

  it("the root and settlement/bridge exports are the same quoteForFill", () => {
    expect(rootQuoteForFill).toBe(quoteForFill);
    expect(bridgeQuoteForFill).toBe(quoteForFill);
  });
});
