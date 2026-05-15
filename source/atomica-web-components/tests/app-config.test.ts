/**
 * @file app-config.test.ts
 * @description Unit tests for AppConfig localStorage persistence.
 *
 * Covers the test plan items from issue #91:
 *   - loadConfig with missing key returns defaults.
 *   - loadConfig with stale version resets and returns defaults.
 *   - saveConfig + reload roundtrip persists values.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  loadConfig,
  saveConfig,
  resetConfig,
  DEFAULT_CONFIG,
  CONFIG_VERSION,
} from "../src/state/app-config";

const STORAGE_KEY = "atomica:app-config";

describe("app-config", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loadConfig with missing key returns defaults", () => {
    const cfg = loadConfig();
    expect(cfg.version).toBe(CONFIG_VERSION);
    expect(cfg.ethereumRpc).toBe(DEFAULT_CONFIG.ethereumRpc);
    expect(cfg.aptosRpc).toBe(DEFAULT_CONFIG.aptosRpc);
    expect(cfg.pollingInterval).toBe(DEFAULT_CONFIG.pollingInterval);
  });

  it("loadConfig with stale version resets and returns defaults without throwing", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: -999,
        ethereumRpc: "http://stale:9999",
        aptosRpc: "http://stale:8080/v1",
        pollingInterval: 99999,
      }),
    );
    const cfg = loadConfig();
    expect(cfg.version).toBe(CONFIG_VERSION);
    expect(cfg.ethereumRpc).toBe(DEFAULT_CONFIG.ethereumRpc);
    // Stale entry should have been removed.
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("saveConfig + loadConfig roundtrip restores values", () => {
    const custom = {
      ...DEFAULT_CONFIG,
      ethereumRpc: "http://custom:8545",
      aptosRpc: "http://custom:8080/v1",
      pollingInterval: 10000,
    };
    saveConfig(custom);
    const loaded = loadConfig();
    expect(loaded.ethereumRpc).toBe("http://custom:8545");
    expect(loaded.aptosRpc).toBe("http://custom:8080/v1");
    expect(loaded.pollingInterval).toBe(10000);
    expect(loaded.version).toBe(CONFIG_VERSION);
  });

  it("resetConfig removes persisted entry and returns defaults", () => {
    saveConfig({ ...DEFAULT_CONFIG, pollingInterval: 30000 });
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    const cfg = resetConfig();
    expect(cfg.pollingInterval).toBe(DEFAULT_CONFIG.pollingInterval);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("loadConfig handles malformed JSON by returning defaults", () => {
    localStorage.setItem(STORAGE_KEY, "not-valid-json{{{");
    const cfg = loadConfig();
    expect(cfg.version).toBe(CONFIG_VERSION);
    expect(cfg.ethereumRpc).toBe(DEFAULT_CONFIG.ethereumRpc);
  });
});
