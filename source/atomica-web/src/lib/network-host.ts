const STORAGE_KEY = "atomica-testnet-host";

function getBrowserHost(): string {
  if (typeof window === "undefined") {
    return "localhost";
  }
  const host = window.location.hostname?.trim();
  return host || "localhost";
}

export function getStoredHost(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || getBrowserHost();
  } catch {
    return getBrowserHost();
  }
}

export function setStoredHost(host: string): void {
  localStorage.setItem(STORAGE_KEY, host);
}
