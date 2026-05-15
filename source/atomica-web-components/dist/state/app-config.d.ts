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
export declare const CONFIG_VERSION = 1;
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
export declare const DEFAULT_CONFIG: AppConfig;
/**
 * Load config from localStorage.
 *
 * - Missing key → returns defaults.
 * - Parse error → returns defaults.
 * - Version mismatch → resets to defaults (clears stale entry) and returns
 *   defaults without throwing.
 */
export declare function loadConfig(): AppConfig;
/**
 * Persist config to localStorage, stamping the current VERSION.
 */
export declare function saveConfig(config: AppConfig): void;
/**
 * Reset config to defaults and remove the persisted entry.
 */
export declare function resetConfig(): AppConfig;
//# sourceMappingURL=app-config.d.ts.map