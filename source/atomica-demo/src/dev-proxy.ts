/**
 * The dev server proxy table (`server.proxy` in vite.config.ts).
 *
 * In a browser the SDK calls two same-origin paths (network-host.ts,
 * contract-check.ts): `/aptos-api` reaches the Aptos node and `/eth-api` the
 * Ethereum JSON-RPC, each with its prefix stripped. Each extra Aptos endpoint
 * of VITE_APTOS_EXTRA_FULLNODE_URLS gets its own `/aptos-api-<n>` path (the
 * SDK's buildExtraAptosFullnodeUrls points endpoint n there).
 *
 * Vite takes the first key that prefixes the request path, so the
 * `/aptos-api-<n>` entries come before `/aptos-api`.
 *
 * Kept free of Node imports so the demo browser tests can load it.
 */

export interface ProxyEntry {
  target: string;
  rewrite: (path: string) => string;
}

/** Default Aptos node of the local testnet. */
export const APTOS_PROXY_TARGET = "http://127.0.0.1:8080";
/** Default Ethereum JSON-RPC of the local testnet. */
export const ETH_PROXY_TARGET = "http://127.0.0.1:8545";

function stripPrefix(prefix: string): (path: string) => string {
  return (path) =>
    path.startsWith(prefix) ? path.slice(prefix.length) || "/" : path;
}

/** The proxy table, given VITE_APTOS_EXTRA_FULLNODE_URLS (comma separated). */
export function devProxy(
  extraAptosFullnodeUrls: string | undefined,
): Record<string, ProxyEntry> {
  const extras = (extraAptosFullnodeUrls ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter((url) => url.length > 0)
    .map((url, i): [string, ProxyEntry] => {
      const prefix = `/aptos-api-${i + 1}`;
      return [
        prefix,
        { target: new URL(url).origin, rewrite: stripPrefix(prefix) },
      ];
    });
  return {
    ...Object.fromEntries(extras),
    "/aptos-api": {
      target: APTOS_PROXY_TARGET,
      rewrite: stripPrefix("/aptos-api"),
    },
    "/eth-api": { target: ETH_PROXY_TARGET, rewrite: stripPrefix("/eth-api") },
  };
}
