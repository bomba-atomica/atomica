/**
 * Removes the '0x' prefix from a hex string if present.
 *
 * @param hex - Hex string that may or may not have '0x' prefix
 * @returns Hex string without '0x' prefix
 */
export function stripHexPrefix(hex: string): string {
  return hex.toLowerCase().startsWith("0x") ? hex.slice(2) : hex;
}

/**
 * Ensures a hex string has the '0x' prefix.
 *
 * @param hex - Hex string that may or may not have '0x' prefix
 * @returns Hex string with '0x' prefix
 */
export function ensureHexPrefix(hex: string): string {
  return hex.toLowerCase().startsWith("0x") ? hex : `0x${hex}`;
}

/**
 * Strips '0x' prefix from all hex strings in an array.
 *
 * @param hexArray - Array of hex strings
 * @returns Array of hex strings without '0x' prefixes
 */
export function stripHexArray(hexArray: string[]): string[] {
  return hexArray.map(stripHexPrefix);
}
