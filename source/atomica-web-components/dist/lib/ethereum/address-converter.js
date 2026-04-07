/**
 * Convert Ethereum address (20 bytes) to Aptos address (32 bytes)
 * Pads with zeros on the left
 */
export function ethereumToAptosAddress(ethAddress) {
    // Remove 0x prefix if present
    const hex = ethAddress.toLowerCase().startsWith("0x")
        ? ethAddress.slice(2)
        : ethAddress;
    // Validate Ethereum address is 20 bytes (40 hex chars)
    if (hex.length !== 40) {
        throw new Error(`Invalid Ethereum address: ${ethAddress}`);
    }
    // Pad to 32 bytes (64 hex chars) by adding 12 zero bytes on the left
    const padded = "0".repeat(24) + hex;
    return "0x" + padded;
}
/**
 * Convert Aptos address (32 bytes) to Ethereum address (20 bytes)
 * Takes the last 20 bytes
 */
export function aptosToEthereumAddress(aptosAddress) {
    // Remove 0x prefix if present
    const hex = aptosAddress.toLowerCase().startsWith("0x")
        ? aptosAddress.slice(2)
        : aptosAddress;
    // Validate Aptos address is 32 bytes (64 hex chars)
    if (hex.length !== 64) {
        throw new Error(`Invalid Aptos address: ${aptosAddress}`);
    }
    // Take last 20 bytes (40 hex chars)
    const ethHex = hex.slice(-40);
    return "0x" + ethHex;
}
//# sourceMappingURL=address-converter.js.map