import { describe, expect, test } from "bun:test";
import { fetchLightClientBootstrap, fetchLightClientUpdates, fetchLightClientFinalityUpdate, fetchLightClientOptimisticUpdate, BEACON_CONFIGS, computeSyncCommitteePeriod, getBeaconApiUrls } from "../../dist/beacon/fetch";

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

  describe("getBeaconApiUrls", () => {
    test("should return mainnet URLs", () => {
      const urls = getBeaconApiUrls("mainnet");
      expect(urls.length).toBeGreaterThan(0);
      expect(urls[0]).toContain("beaconcha.in");
    });

    test("should return sepolia URLs", () => {
      const urls = getBeaconApiUrls("sepolia");
      expect(urls.length).toBe(1);
      expect(urls[0]).toContain("sepolia");
    });

    test("should throw for unknown chain", () => {
      expect(() => getBeaconApiUrls("unknown")).toThrow("Unknown chain");
    });
  });

  describe("fetchLightClientBootstrap", () => {
    test("should throw for invalid API URL", async () => {
      await expect(
        fetchLightClientBootstrap("https://invalid.example.com", "0x1234"),
      ).rejects.toThrow();
    });
  });

  describe("fetchLightClientUpdates", () => {
    test("should return empty array for invalid API", async () => {
      const updates = await fetchLightClientUpdates("https://invalid.example.com", 0, 1);
      expect(updates).toEqual([]);
    });
  });

  describe("fetchLightClientFinalityUpdate", () => {
    test("should throw for invalid API URL", async () => {
      await expect(
        fetchLightClientFinalityUpdate("https://invalid.example.com"),
      ).rejects.toThrow();
    });
  });

  describe("fetchLightClientOptimisticUpdate", () => {
    test("should throw for invalid API URL", async () => {
      await expect(
        fetchLightClientOptimisticUpdate("https://invalid.example.com"),
      ).rejects.toThrow();
    });
  });
});
