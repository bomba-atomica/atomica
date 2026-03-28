/**
 * TestnetHost
 *
 * Shows the host the webapp is being served from. All API calls are proxied
 * through this origin, so this reflects the actual testnet being used.
 */

export function TestnetSelector() {
  const host =
    typeof window !== "undefined" ? window.location.host : "localhost";

  return (
    <span className="text-xs font-mono text-zinc-400 border border-zinc-800 rounded px-2 py-1.5 bg-zinc-900/60">
      {host}
    </span>
  );
}
