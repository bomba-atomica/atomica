/**
 * Price unit: one parser and one formatter for every price in the product.
 *
 * A price is whole USD per whole base token, as an unsigned integer with no
 * decimal shift. It is the unit of Move `auction` prices (`SealedBid.price`,
 * `clearing_price`). FakeUSD token amounts keep their 6 decimals; only
 * `quoteForFill` turns a price into FakeUSD units.
 */

/** Largest Move `u64`, the on-chain type of a price. */
const U64_MAX = 2n ** 64n - 1n;

/**
 * Parse a price typed as a whole number of USD per whole base token.
 *
 * Accepts digits only. Throws on an empty string, a sign, a decimal point,
 * zero, any other non-digit, or a value above `u64`. Surrounding whitespace is
 * ignored.
 */
export function parsePrice(text: string): bigint {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed) || BigInt(trimmed) === 0n) {
    throw new Error(
      "The price must be a positive whole number of USD per whole base token.",
    );
  }
  const price = BigInt(trimmed);
  if (price > U64_MAX) {
    throw new Error("The price is above the largest on-chain price (u64).");
  }
  return price;
}

/**
 * Format a price for display: `formatPrice(2000n)` is `"$2000"`.
 * The value is whole USD per whole base token, so no decimal shift applies.
 */
export function formatPrice(price: bigint): string {
  return `$${price.toString()}`;
}

/** FakeUSD has 6 decimals, FakeETH 18. */
const QUOTE_UNIT = 10n ** 6n;
const BASE_UNIT = 10n ** 18n;

/**
 * FakeUSD units a winner pays for `baseAmount` FakeETH wei at
 * `clearingPrice` (whole USD per whole base token, no decimal shift).
 * Rounds down. Mirrors Move `auction::quote_for_fill`, and is the only place
 * in the SDK that turns a price into FakeUSD units.
 */
export function quoteForFill(
  baseAmount: bigint,
  clearingPrice: bigint,
): bigint {
  return (baseAmount * clearingPrice * QUOTE_UNIT) / BASE_UNIT;
}
