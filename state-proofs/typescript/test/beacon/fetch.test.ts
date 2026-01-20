import { describe, expect, test, beforeAll, afterAll, mock } from "bun:test";
import { fetchLightClientBootstrap, fetchLightClientUpdates, fetchLightClientFinalityUpdate, BEACON_CONFIGS, computeSyncCommitteePeriod } from "../src/beacon/fetch";

describe("Beacon API Fetching", () => {
  describe("BEACON_CONFIGS", () => {
    test("should have mainnet config", () => {
      expect(BEACON_CONFIGS.mainnet).toBeDefined();
      expect(BEACON_CONFIGS.mainnet.name).toBe("mainnet");
      expect(BEACON_CONFIGS.mainnet.slotsPerEpoch).toBe(32);
      expect(BEACON_CONFIGS.mainnet.epochsPerSyncCommitteePeriod).toBe(256);
    });

    test("should have sepolia config", () => {
      expect(BEACON_CONFIGS.sepolia).toBeDefined();
      expect(BEACON_CONFIGS.sepolia.name).toBe("sepolia");
    });

    test("should have holesky config", () => {
      expect(BEACON_CONFIGS.holesky).toBeDefined();
      expect(BEACON_CONFIGS.holesky.name).toBe("holesky");
    });
  });

  describe("computeSyncCommitteePeriod", () => {
    test("should return 0 for genesis slot", () => {
      expect(computeSyncCommitteePeriod(0, BEACON_CONFIGS.mainnet)).toBe(0);
    });

    test("should return correct period for arbitrary slot", () => {
      const slotsPerPeriod = BEACON_CONFIGS.mainnet.epochsPerSyncCommitteePeriod * BEACON_CONFIGS.mainnet.slotsPerEpoch;
      expect(computeSyncCommitteePeriod(slotsPerPeriod * 5, BEACON_CONFIGS.mainnet)).toBe(5);
    });
  });

  describe("fetchLightClientBootstrap", () => {
    test("should throw not implemented error", async () => {
      await expect(fetchLightClientBootstrap("https://example.com", "0x1234")).rejects.toThrow("Not implemented");
    });
  });

  describe("fetchLightClientUpdates", () => {
    test("should throw not implemented error", async () => {
      await expect(fetchLightClientUpdates("https://example.com", 0, 1)).rejects.toThrow("Not implemented");
    });
  });

  describe("fetchLightClientFinalityUpdate", () => {
    test("should throw not implemented error", async () => {
      await expect(fetchLightClientFinalityUpdate("https://example.com")).rejects.toThrow("Not implemented");
    });
  });
});
