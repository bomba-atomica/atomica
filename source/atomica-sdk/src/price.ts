/**
 * Price unit: one parser and one formatter for every price in the product.
 *
 * A price is whole USD per whole base token, as an unsigned integer with no
 * decimal shift. FakeUSD token amounts keep their 6 decimals; only
 * `quoteForFill` turns a price into FakeUSD units.
 *
 * Stubs. Nothing calls them yet.
 */

// SCOUT(#217) ADD: parses a whole number of USD; throws on an empty string, a sign, a decimal point, zero, or a value above u64.
export function parsePrice(_text: string): bigint {
  throw new Error("NOT_IMPLEMENTED: SCOUT(#217) parsePrice");
}

// SCOUT(#217) ADD: formats a price for display; formatPrice(2000n) is "$2000".
export function formatPrice(_price: bigint): string {
  throw new Error("NOT_IMPLEMENTED: SCOUT(#217) formatPrice");
}

// SCOUT(#217) ADD: quoteForFill moves here from settlement/bridge.ts, which the SDK unwind issue (195) rewrites; Move's quote_for_fill names it as its mirror.
