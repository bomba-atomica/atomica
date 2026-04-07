/**
 * Convert Ethereum address (20 bytes) to Aptos address (32 bytes)
 * Pads with zeros on the left
 */
export declare function ethereumToAptosAddress(ethAddress: string): string;
/**
 * Convert Aptos address (32 bytes) to Ethereum address (20 bytes)
 * Takes the last 20 bytes
 */
export declare function aptosToEthereumAddress(aptosAddress: string): string;
//# sourceMappingURL=address-converter.d.ts.map