import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import {
  calculateLockedBalanceStorageKey,
  calculateUnlockTimeStorageKey,
  calculateBatchStorageKeys,
} from "../../../src/lib/ethereum/proofs/storage-key.js";

/**
 * Unit tests for storage key calculation
 *
 * These tests verify that our TypeScript storage key calculation
 * matches Solidity's storage layout for nested mappings.
 */
describe("Storage Key Calculation", () => {
  const ALICE = "0x0000000000000000000000000000000000000001";
  const BOB = "0x0000000000000000000000000000000000000002";
  const FAKE_ETH = "0x0000000000000000000000000000000000000010";
  const FAKE_USD = "0x0000000000000000000000000000000000000020";

  describe("calculateLockedBalanceStorageKey", () => {
    it("should calculate storage key for Alice + FakeETH", () => {
      const key = calculateLockedBalanceStorageKey(ALICE, FAKE_ETH);

      // Should be a valid hex string
      expect(key).toMatch(/^0x[0-9a-f]{64}$/i);

      // Should be deterministic
      const key2 = calculateLockedBalanceStorageKey(ALICE, FAKE_ETH);
      expect(key).toBe(key2);
    });

    it("should calculate different keys for different users", () => {
      const aliceKey = calculateLockedBalanceStorageKey(ALICE, FAKE_ETH);
      const bobKey = calculateLockedBalanceStorageKey(BOB, FAKE_ETH);

      expect(aliceKey).not.toBe(bobKey);
    });

    it("should calculate different keys for different tokens", () => {
      const ethKey = calculateLockedBalanceStorageKey(ALICE, FAKE_ETH);
      const usdKey = calculateLockedBalanceStorageKey(ALICE, FAKE_USD);

      expect(ethKey).not.toBe(usdKey);
    });

    it("should handle checksummed addresses", () => {
      const checksummed = ethers.getAddress(ALICE.toLowerCase());
      const key1 = calculateLockedBalanceStorageKey(ALICE, FAKE_ETH);
      const key2 = calculateLockedBalanceStorageKey(checksummed, FAKE_ETH);

      expect(key1).toBe(key2);
    });

    it("should match Solidity's nested mapping calculation", () => {
      // For mapping(address => mapping(address => uint256)) at slot 0
      // Solidity calculates: keccak256(abi.encode(user, keccak256(abi.encode(token, 0))))

      const innerKey = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256"],
          [FAKE_ETH, 0],
        ),
      );

      const expectedKey = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "bytes32"],
          [ALICE, innerKey],
        ),
      );

      const actualKey = calculateLockedBalanceStorageKey(ALICE, FAKE_ETH);

      expect(actualKey).toBe(expectedKey);
    });

    it("should use custom slot if provided", () => {
      const slot0 = calculateLockedBalanceStorageKey(ALICE, FAKE_ETH, 0);
      const slot1 = calculateLockedBalanceStorageKey(ALICE, FAKE_ETH, 1);
      const slot2 = calculateLockedBalanceStorageKey(ALICE, FAKE_ETH, 2);

      // All should be different
      expect(slot0).not.toBe(slot1);
      expect(slot1).not.toBe(slot2);
      expect(slot0).not.toBe(slot2);
    });
  });

  describe("calculateUnlockTimeStorageKey", () => {
    it("should calculate storage key at slot 1", () => {
      const unlockKey = calculateUnlockTimeStorageKey(ALICE, FAKE_ETH);
      const slot1Key = calculateLockedBalanceStorageKey(ALICE, FAKE_ETH, 1);

      expect(unlockKey).toBe(slot1Key);
    });

    it("should be different from locked balance key", () => {
      const balanceKey = calculateLockedBalanceStorageKey(ALICE, FAKE_ETH);
      const unlockKey = calculateUnlockTimeStorageKey(ALICE, FAKE_ETH);

      expect(balanceKey).not.toBe(unlockKey);
    });
  });

  describe("calculateBatchStorageKeys", () => {
    it("should calculate keys for multiple users and tokens", () => {
      const users = [ALICE, BOB];
      const tokens = [FAKE_ETH, FAKE_USD];

      const keys = calculateBatchStorageKeys(users, tokens);

      // Should have 2 users × 2 tokens = 4 keys
      expect(keys).toHaveLength(4);

      // All keys should be unique
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(4);
    });

    it("should calculate keys in correct order", () => {
      const users = [ALICE, BOB];
      const tokens = [FAKE_ETH, FAKE_USD];

      const keys = calculateBatchStorageKeys(users, tokens);

      // Order should be: Alice+ETH, Alice+USD, Bob+ETH, Bob+USD
      expect(keys[0]).toBe(calculateLockedBalanceStorageKey(ALICE, FAKE_ETH));
      expect(keys[1]).toBe(calculateLockedBalanceStorageKey(ALICE, FAKE_USD));
      expect(keys[2]).toBe(calculateLockedBalanceStorageKey(BOB, FAKE_ETH));
      expect(keys[3]).toBe(calculateLockedBalanceStorageKey(BOB, FAKE_USD));
    });

    it("should handle single user and token", () => {
      const keys = calculateBatchStorageKeys([ALICE], [FAKE_ETH]);

      expect(keys).toHaveLength(1);
      expect(keys[0]).toBe(calculateLockedBalanceStorageKey(ALICE, FAKE_ETH));
    });

    it("should handle empty arrays", () => {
      const keys = calculateBatchStorageKeys([], []);

      expect(keys).toHaveLength(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle zero address", () => {
      const zeroAddr = ethers.ZeroAddress;

      const key = calculateLockedBalanceStorageKey(zeroAddr, FAKE_ETH);

      expect(key).toMatch(/^0x[0-9a-f]{64}$/i);
    });

    it("should handle same user and token address", () => {
      // Edge case: user address == token address
      const key = calculateLockedBalanceStorageKey(ALICE, ALICE);

      expect(key).toMatch(/^0x[0-9a-f]{64}$/i);

      // Should be different from Alice + FAKE_ETH
      const normalKey = calculateLockedBalanceStorageKey(ALICE, FAKE_ETH);
      expect(key).not.toBe(normalKey);
    });

    it("should throw on invalid address", () => {
      expect(() => {
        calculateLockedBalanceStorageKey("not-an-address", FAKE_ETH);
      }).toThrow();

      expect(() => {
        calculateLockedBalanceStorageKey(ALICE, "not-an-address");
      }).toThrow();
    });
  });

  describe("Consistency with Solidity", () => {
    it("should produce same key as Solidity calculateStorageKey", () => {
      // These test vectors verify the math against known manual calculations
      const user = "0x0000000000000000000000000000000000000001";
      const token = "0x0000000000000000000000000000000000000010";
      const key = calculateLockedBalanceStorageKey(user, token);

      // Calculate manually
      const inner = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "uint256"],
          [token, 0],
        ),
      );
      const expected = ethers.keccak256(
        ethers.AbiCoder.defaultAbiCoder().encode(
          ["address", "bytes32"],
          [user, inner],
        ),
      );

      expect(key).toBe(expected);
    });
  });
});
