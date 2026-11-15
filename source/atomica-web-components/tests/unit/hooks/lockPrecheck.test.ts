import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@atomica/sdk/aptos", () => ({
  auctionExists: vi.fn(async () => true),
  getBidCount: vi.fn(async () => 0n),
  getWindowLimits: vi.fn(async () => ({
    maxBidsPerWindow: 100n,
    maxSellerLocksPerWindow: 100n,
    minSellerLockAmount: 10n,
    minBidCollateral: 10n,
  })),
  getWindowLockIds: vi.fn(async () => ({ sellers: [], collateral: [] })),
}));

import * as precheck from "../../../src/hooks/lockPrecheck";
import {
  auctionExists,
  getBidCount,
  getWindowLockIds,
} from "@atomica/sdk/aptos";

const WINDOW_ID = 7n;
const PAIR_BCS = new Uint8Array([1, 2, 3]);

describe("lock pre-checks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("checks auctionExists and skips lock ids for a seller's unopened window", async () => {
    vi.mocked(auctionExists).mockResolvedValueOnce(false);
    await expect(
      precheck.sellerLockRefusal(10n, WINDOW_ID, PAIR_BCS),
    ).resolves.toBeNull();
    expect(auctionExists).toHaveBeenCalledWith(WINDOW_ID, PAIR_BCS);
    expect(getWindowLockIds).not.toHaveBeenCalled();
  });

  it("propagates getWindowLockIds errors instead of interpreting abort text as empty", async () => {
    vi.mocked(getWindowLockIds).mockRejectedValueOnce(
      new Error("E_AUCTION_NOT_FOUND"),
    );
    await expect(
      precheck.sellerLockRefusal(10n, WINDOW_ID, PAIR_BCS),
    ).rejects.toThrow("E_AUCTION_NOT_FOUND");
  });

  it("refuses bid collateral when the target window does not exist", async () => {
    vi.mocked(auctionExists).mockResolvedValueOnce(false);
    await expect(
      precheck.bidCollateralRefusal(10n, WINDOW_ID, PAIR_BCS),
    ).resolves.toContain("current window is closing");
    expect(getBidCount).not.toHaveBeenCalled();
  });

  it("allows a bid pre-check for an existing window under the caps", async () => {
    await expect(
      precheck.bidCollateralRefusal(10n, WINDOW_ID, PAIR_BCS),
    ).resolves.toBeNull();
    expect(auctionExists).toHaveBeenCalledWith(WINDOW_ID, PAIR_BCS);
    expect(getBidCount).toHaveBeenCalledWith(WINDOW_ID, PAIR_BCS);
  });

  it("no longer exports isWindowNotFound", () => {
    expect("isWindowNotFound" in precheck).toBe(false);
  });
});
