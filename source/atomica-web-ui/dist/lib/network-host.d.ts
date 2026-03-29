export declare function getStoredHost(): string;
export declare function setStoredHost(host: string): void;
/**
 * Returns the Ethereum JSON-RPC URL.
 *
 * In a browser context the Vite dev server proxies /eth-api/* through to the
 * Ethereum node, so we return a same-origin relative URL.  This means the
 * browser request inherits the webapp's SSL cert and avoids mixed-content and
 * CORS issues.
 *
 * In non-browser contexts (Node scripts, tests) we construct a direct URL
 * using the stored host and the configured HTTP port.
 */
export declare function buildEthRpcUrl(host: string): string;
/**
 * Returns the Aptos fullnode URL.
 *
 * In a browser context the Vite dev server proxies /aptos-api/* through to the
 * Aptos node (rewriting the prefix away), so /aptos-api/v1 → <node>:8080/v1.
 *
 * In non-browser contexts we construct a direct URL using the stored host and
 * the configured HTTP port.
 */
export declare function buildAptosFullnodeUrl(host: string): string;
//# sourceMappingURL=network-host.d.ts.map