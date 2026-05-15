/**
 * @file app-config.ts
 * @description Typed AppConfig schema with versioned localStorage persistence.
 *
 * Canonical doc: docs/architecture/v0-architecture.md §1 (package layout).
 *
 * Responsibilities:
 *   - Define the `AppConfig` shape (network endpoints, polling interval).
 *   - Expose `loadConfig()` that reads from localStorage, migrates or resets
 *     on version mismatch, and always returns a valid config.
 *   - Expose `saveConfig()` and `resetConfig()` for write paths.
 *
 * Out of scope: multi-account support, server-side persistence (v1+).
 */

export const CONFIG_VERSION = 1;
const STORAGE_KEY = "atomica:app-config";

export interface AppConfig {
  /** Schema version — used to detect stale persisted configs. */
  version: number;
  /** Aptos / EVM shared hostname for local dev (e.g. "localhost"). */
  host: string;
  /** Ethereum JSON-RPC endpoint. Defaults to a local Anvil node. */
  ethereumRpc: string;
  /** Aptos fullnode REST endpoint. Derived from `host` when blank. */
  aptosRpc: string;
  /** Balance / contract-status polling interval in milliseconds. */
  pollingInterval: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  version: CONFIG_VERSION,
  host: "localhost",
  ethereumRpc: "http://localhost:8545",
  aptosRpc: "http://localhost:8080/v1",
  pollingInterval: 5000,
};

/**
 * Load config from localStorage.
 *
 * - Missing key → returns defaults.
 * - Parse error → returns defaults.
 * - Version mismatch → resets to defaults (clears stale entry) and returns
 *   defaults without throwing.
 */
export function loadConfig(): AppConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<AppConfig>;
    if (parsed.version !== CONFIG_VERSION) {
      localStorage.removeItem(STORAGE_KEY);
      return { ...DEFAULT_CONFIG };
    }
    // Merge with defaults so new fields added in future versions have values.
    return { ...DEFAULT_CONFIG, ...parsed, version: CONFIG_VERSION };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Persist config to localStorage, stamping the current VERSION.
 */
export function saveConfig(config: AppConfig): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ ...config, version: CONFIG_VERSION }),
  );
}

/**
 * Reset config to defaults and remove the persisted entry.
 */
export function resetConfig(): AppConfig {
  localStorage.removeItem(STORAGE_KEY);
  return { ...DEFAULT_CONFIG };
}
