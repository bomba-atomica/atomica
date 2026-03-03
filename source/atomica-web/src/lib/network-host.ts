const STORAGE_KEY = "atomica-testnet-host";
let runtimeHost: string | null = null;

function getBrowserHost(): string {
  if (typeof window === "undefined") {
    return import.meta.env.VITE_HOST_IP || "localhost";
  }
  const host = window.location.hostname?.trim();
  return host || import.meta.env.VITE_HOST_IP || "localhost";
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
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const defaultPort = isHttps
    ? (import.meta.env.VITE_ETHEREUM_SSL_PORT || "8546")
    : (import.meta.env.VITE_ETHEREUM_HTTP_PORT || "8545");

  const url = ensurePort(parseTargetHost(host), defaultPort);
  if (isHttps) {
    url.protocol = "https:";
  }

  if (url.pathname === "/") {
    url.pathname = "";
  }
  return url.toString();
}

export function buildAptosFullnodeUrl(host: string): string {
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const defaultPort = isHttps
    ? (import.meta.env.VITE_APTOS_SSL_PORT || "8443")
    : (import.meta.env.VITE_APTOS_HTTP_PORT || "8080");

  const url = ensurePort(parseTargetHost(host), defaultPort);
  if (isHttps) {
    url.protocol = "https:";
  }

  url.pathname = "/v1";
  return url.toString();
}
