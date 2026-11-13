/**
 * Unit tests for AuctionCreator component.
 *
 * Verifies that:
 *   1. Form fields for window_id, min_price, and lock_id are rendered.
 *   2. The submit button registers the timelock, then calls
 *      submitCreateAuction with the returned timelock id.
 *   3. An error message is shown when the transaction is rejected.
 *
 * Mocks @atomica/sdk/aptos and ethers so no blockchain connection is needed.
 *
 * @see docs/specifications/web-architecture.md
 * @see #135 — Web component unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { WalletContext } from "../../src/context/WalletContext";

// SCOUT(#243) REMOVE: the registerTimelock mock.
vi.mock("@atomica/sdk/aptos", () => ({
  submitCreateAuction: vi.fn().mockResolvedValue({ hash: "0xdeadbeef" }),
  registerTimelock: vi.fn().mockResolvedValue(5n),
}));

vi.mock("ethers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ethers")>();
  return {
    ...actual,
    ethers: {
      ...actual.ethers,
      getBytes: vi.fn().mockReturnValue(new Uint8Array(32)),
    },
  };
});

import { AuctionCreator } from "../../src/components/AuctionCreator";
import { submitCreateAuction, registerTimelock } from "@atomica/sdk/aptos";

const ACCOUNT = "0xAbCd1234567890123456789012345678901234Ab";

function renderAuctionCreator(account: string | null = ACCOUNT) {
  return render(
    <WalletContext.Provider value={{ account, connect: vi.fn() }}>
      <AuctionCreator />
    </WalletContext.Provider>,
  );
}

describe("AuctionCreator — unit", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // SCOUT(#241) EDIT: there is no Min Price field.
  it("renders form fields for window_id, min_price, and lock_id", () => {
    renderAuctionCreator();

    // Window ID input
    const windowIdLabel = screen.getByText(/Window ID/i);
    expect(windowIdLabel).toBeTruthy();

    // Min Price input
    // SCOUT(#241) REMOVE: the Min Price label assert.
    const minPriceLabel = screen.getByText(/Min Price/i);
    expect(minPriceLabel).toBeTruthy();

    // Lock ID input
    const lockIdLabel = screen.getByText(/Lock ID/i);
    expect(lockIdLabel).toBeTruthy();

    // Submit button
    const submitButton = screen.getByRole("button", { name: /Create Auction/i });
    expect(submitButton).toBeTruthy();
  });

  it("calls submitCreateAuction when the button is clicked with a connected account", async () => {
    renderAuctionCreator();

    const button = screen.getByRole("button", { name: /Create Auction/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(submitCreateAuction).toHaveBeenCalled();
    });
  });

  // SCOUT(#243) REMOVE: this case; assert one transaction and no register_timelock.
  // SCOUT(#241) EDIT: the argument count drops (6 today).
  it("registers the timelock before create_auction and passes its id", async () => {
    renderAuctionCreator();

    fireEvent.click(screen.getByRole("button", { name: /Create Auction/i }));

    await waitFor(() => {
      expect(submitCreateAuction).toHaveBeenCalledTimes(1);
    });
    expect(registerTimelock).toHaveBeenCalledTimes(1);
    expect(vi.mocked(registerTimelock).mock.calls[0][0]).toBe(ACCOUNT);
    expect(
      vi.mocked(registerTimelock).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(submitCreateAuction).mock.invocationCallOrder[0]);
    // submitCreateAuction(account, windowId, pairBcs, lockId, minPrice, timelockId)
    const args = vi.mocked(submitCreateAuction).mock.calls[0];
    expect(args).toHaveLength(6);
    expect(args[5]).toBe(5n);
  });

  it("shows success status with tx hash after successful submission", async () => {
    renderAuctionCreator();

    const button = screen.getByRole("button", { name: /Create Auction/i });
    fireEvent.click(button);

    await waitFor(() => {
      const statusEl = screen.getByText(/Auction Created!/i);
      expect(statusEl).toBeTruthy();
    });
  });

  it("shows error message when the transaction is rejected", async () => {
    vi.mocked(submitCreateAuction).mockRejectedValueOnce(
      new Error("User rejected transaction"),
    );

    renderAuctionCreator();

    const button = screen.getByRole("button", { name: /Create Auction/i });
    fireEvent.click(button);

    await waitFor(() => {
      const statusEl = screen.getByText(/Error: User rejected transaction/i);
      expect(statusEl).toBeTruthy();
    });
  });

  it("does not call submitCreateAuction when account is null", async () => {
    renderAuctionCreator(null);

    const button = screen.getByRole("button", { name: /Create Auction/i });
    fireEvent.click(button);

    // Short wait to confirm no SDK call happened
    await new Promise((r) => setTimeout(r, 50));
    expect(registerTimelock).not.toHaveBeenCalled();
    expect(submitCreateAuction).not.toHaveBeenCalled();
  });

  it.todo("SCOUT(#243) the create step submits exactly one transaction and none to 0x1::ibe_config::register_timelock");
  it.todo("SCOUT(#241) submitCreateAuction is called without a price argument");
  it.todo("SCOUT(#224) the pair defaults to the SDK launch pair constant");
});
