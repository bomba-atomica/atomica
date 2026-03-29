const STORAGE_KEY = "atomica-testnet-host";
let runtimeHost = null;
// Safe access to import.meta.env — works in both Vite (browser/SSR) and plain Node.js
const metaEnv = import.meta.env || {};
function getBrowserHost() {
    return metaEnv.VITE_HOST_IP || "localhost";
}
export function getStoredHost() {
    if (runtimeHost && runtimeHost.trim()) {
        return runtimeHost.trim();
    }
    try {
        const stored = localStorage.getItem(STORAGE_KEY)?.trim();
        const resolved = stored || getBrowserHost();
        runtimeHost = resolved;
        return resolved;
    }
    catch {
        const fallback = getBrowserHost();
        runtimeHost = fallback;
        return fallback;
    }
}
export function setStoredHost(host) {
    runtimeHost = host.trim();
    try {
        localStorage.setItem(STORAGE_KEY, runtimeHost);
    }
    catch {
        // Persistence is best-effort; runtime host remains authoritative.
    }
}
function parseTargetHost(target) {
    const trimmed = target.trim();
    if (!trimmed) {
        return new URL("http://localhost");
    }
    if (trimmed.includes("://")) {
        return new URL(trimmed);
    }
    return new URL(`http://${trimmed}`);
}
function ensurePort(url, port) {
    if (!url.port) {
        url.port = port;
    }
    return url;
}
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
export function buildEthRpcUrl(host) {
    if (typeof window !== "undefined") {
        // Route through Vite's /eth-api proxy; path will be rewritten to "/"
        return `${window.location.origin}/eth-api`;
    }
    // Node / test context — explicit override takes precedence, then derive from host
    const override = metaEnv.VITE_ETH_RPC_URL;
    if (override) {
        return override;
    }
    const port = metaEnv.VITE_ETHEREUM_HTTP_PORT || "8545";
    const url = ensurePort(parseTargetHost(host), port);
    if (url.pathname === "/") {
        url.pathname = "";
    }
    return url.toString();
}
/**
 * Returns the Aptos fullnode URL.
 *
 * In a browser context the Vite dev server proxies /aptos-api/* through to the
 * Aptos node (rewriting the prefix away), so /aptos-api/v1 → <node>:8080/v1.
 *
 * In non-browser contexts we construct a direct URL using the stored host and
 * the configured HTTP port.
 */
export function buildAptosFullnodeUrl(host) {
    if (typeof window !== "undefined") {
        // Route through Vite's /aptos-api proxy; the rewrite strips /aptos-api
        // so /aptos-api/v1 reaches the node at /v1
        return `${window.location.origin}/aptos-api/v1`;
    }
    // Node / test context — explicit override takes precedence, then derive from host
    const override = metaEnv.VITE_APTOS_FULLNODE_URL;
    if (override) {
        return override;
    }
    const port = metaEnv.VITE_APTOS_HTTP_PORT || "8080";
    const url = ensurePort(parseTargetHost(host), port);
    url.pathname = "/v1";
    return url.toString();
}
