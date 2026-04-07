/**
 * @file 12a-bid-storage.test.tsx
 * @description Unit tests for bid price localStorage persistence.
 *
 * Verifies that saveBidPrice / loadBidPrice / clearBidPrice correctly
 * round-trip bid prices through localStorage, keyed by seller+bidder.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  saveBidPrice,
  loadBidPrice,
  clearBidPrice,
} from "../../src/lib/bidStorage";

beforeEach(() => {
  localStorage.clear();
});

describe("12a: bidStorage — localStorage persistence", () => {
  const seller = "0xAABB";
  const bidder = "0xCCDD";

  it("saves and loads a bid price", () => {
    saveBidPrice(seller, bidder, 110_000_000n);
    const result = loadBidPrice(seller, bidder);
    expect(result).toBe(110_000_000n);
  });

  it("returns null when no bid is stored", () => {
    expect(loadBidPrice(seller, bidder)).toBeNull();
  });

  it("clears a stored bid price", () => {
    saveBidPrice(seller, bidder, 50_000_000n);
    clearBidPrice(seller, bidder);
    expect(loadBidPrice(seller, bidder)).toBeNull();
  });

  it("stores bids independently per seller+bidder pair", () => {
    const seller2 = "0x1111";
    saveBidPrice(seller, bidder, 100n);
    saveBidPrice(seller2, bidder, 200n);

    expect(loadBidPrice(seller, bidder)).toBe(100n);
    expect(loadBidPrice(seller2, bidder)).toBe(200n);
  });

  it("key lookup is case-insensitive", () => {
    saveBidPrice("0xABCD", "0xEF01", 42n);
    expect(loadBidPrice("0xabcd", "0xef01")).toBe(42n);
  });

  it("overwrites previous bid for same seller+bidder", () => {
    saveBidPrice(seller, bidder, 100n);
    saveBidPrice(seller, bidder, 200n);
    expect(loadBidPrice(seller, bidder)).toBe(200n);
  });
});
