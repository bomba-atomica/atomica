/**
 * Unit tests for the bid price storage (src/storage/bidStorage.ts) and the
 * bid history storage (src/hooks/useBidHistory.ts).
 *
 * Prices are whole USD per whole base token. The v2 keys mark that unit; an
 * entry under an old unversioned key may hold another unit, so it is dropped
 * on load, not migrated.
 *
 * Runs in the Unit Tests (atomica-sdk, atomica-web-components) job through
 * vitest.unit.config.ts.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import * as bidStorage from "../../src/storage/bidStorage";
import { loadBidPrice, saveBidPrice } from "../../src/storage/bidStorage";
import { useBidHistory } from "../../src/hooks/useBidHistory";

const SELLER = "0xSeLLeR0000000000000000000000000000000001";
const BIDDER = "0xBiDDeR0000000000000000000000000000000002";
const WALLET = "0xWaLLeT0000000000000000000000000000000003";

describe("bidStorage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("a stored price is read back in whole USD per whole base token", () => {
    saveBidPrice(SELLER, BIDDER, 2000n);
    expect(
      localStorage.getItem(
        `atomica:bid:v2:${SELLER.toLowerCase()}:${BIDDER.toLowerCase()}`,
      ),
    ).toBe("2000");
    expect(loadBidPrice(SELLER, BIDDER)).toBe(2000n);
  });

  it("an old-unit bid price under the unversioned key reads as null and is removed", () => {
    const oldKey = `atomica:bid:${SELLER.toLowerCase()}:${BIDDER.toLowerCase()}`;
    localStorage.setItem(oldKey, "2000000");
    expect(loadBidPrice(SELLER, BIDDER)).toBeNull();
    expect(localStorage.getItem(oldKey)).toBeNull();
  });

  it("old-unit bid history under the unversioned key is dropped on load", () => {
    const oldKey = `bid-history-${WALLET.toLowerCase()}`;
    localStorage.setItem(
      oldKey,
      JSON.stringify([
        { auctionId: SELLER, clearingPrice: "2000000000", settledAt: 1 },
      ]),
    );
    const { result } = renderHook(() => useBidHistory(WALLET));
    expect(result.current.entries).toEqual([]);
    expect(localStorage.getItem(oldKey)).toBeNull();
  });

  it("the opening storage is gone and no salt is written to localStorage", () => {
    // The chain opens every bid with open_bids, so nothing stores an opening.
    expect(Object.keys(bidStorage).sort()).toEqual([
      "clearBidPrice",
      "loadBidPrice",
      "saveBidPrice",
    ]);
    // The only stored value is the decimal price: no salt, no commitment.
    bidStorage.saveBidPrice(SELLER, BIDDER, 2010n);
    expect(localStorage.length).toBe(1);
    const key = localStorage.key(0)!;
    expect(key).not.toMatch(/salt|opening|commit/i);
    expect(localStorage.getItem(key)).toBe("2010");
  });
});
