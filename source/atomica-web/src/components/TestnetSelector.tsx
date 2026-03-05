/**
 * TestnetHost
 *
 * Shows the testnet host that the Vite dev-server proxy is targeting.
 * This is set at server start via VITE_HOST_IP and cannot be changed
 * at runtime in a browser context (all API calls go through the proxy).
 */

const PROXY_HOST = import.meta.env.VITE_HOST_IP || "localhost";

export function TestnetSelector() {
  return (
    <span className="text-xs font-mono text-zinc-400 border border-zinc-800 rounded px-2 py-1.5 bg-zinc-900/60">
      {PROXY_HOST}
    </span>
  );
}
