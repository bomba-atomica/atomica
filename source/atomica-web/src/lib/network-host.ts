const STORAGE_KEY = "atomica-testnet-host";
let runtimeHost: string | null = null;

function getBrowserHost(): string {
  if (typeof window === "undefined") {
    return "localhost";
  }
  const host = window.location.hostname?.trim();
  return host || "localhost";
}

export function getStoredHost(): string {
  if (runtimeHost && runtimeHost.trim()) {
    return runtimeHost.trim();
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY)?.trim();
    const resolved = stored || getBrowserHost();
    runtimeHost = resolved;
    return resolved;
  } catch {
    const fallback = getBrowserHost();
    runtimeHost = fallback;
    return fallback;
  }
}

export function setStoredHost(host: string): void {
  runtimeHost = host.trim();
  try {
    localStorage.setItem(STORAGE_KEY, runtimeHost);
  } catch {
    // Persistence is best-effort; runtime host remains authoritative.
  }
}

function parseTargetHost(target: string): URL {
  const trimmed = target.trim();
  if (!trimmed) {
    return new URL("http://localhost");
  }
  if (trimmed.includes("://")) {
    return new URL(trimmed);
  }
  return new URL(`http://${trimmed}`);
}

function ensurePort(url: URL, port: string): URL {
  if (!url.port) {
    url.port = port;
  }
  return url;
}

export function buildEthRpcUrl(host: string): string {
  const url = ensurePort(parseTargetHost(host), "8545");
  if (url.pathname === "/") {
    url.pathname = "";
  }
  return url.toString();
}

export function buildAptosFullnodeUrl(host: string): string {
  const url = ensurePort(parseTargetHost(host), "8080");
  url.pathname = "/v1";
  return url.toString();
}

export function buildAptosFaucetUrl(host: string): string {
  const url = ensurePort(parseTargetHost(host), "8081");
  if (url.pathname === "/") {
    url.pathname = "";
  }
  return url.toString();
}
