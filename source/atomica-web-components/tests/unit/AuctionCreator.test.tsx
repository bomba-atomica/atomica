/**
 * Unit tests for AuctionCreator component.
 *
 * Verifies that:
 *   1. Form fields for window_id, min_price, and lock_id are rendered.
 *   2. The submit button calls submitCreateAuction mock on click.
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

vi.mock("@atomica/sdk/aptos", () => ({
  submitCreateAuction: vi.fn().mockResolvedValue({ hash: "0xdeadbeef" }),
  getMpk: vi.fn().mockResolvedValue(new Uint8Array(48)),
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
import { submitCreateAuction, getMpk } from "@atomica/sdk/aptos";

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

  it("renders form fields for window_id, min_price, and lock_id", () => {
    renderAuctionCreator();

    // Window ID input
    const windowIdLabel = screen.getByText(/Window ID/i);
    expect(windowIdLabel).toBeTruthy();

    // Min Price input
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
      expect(getMpk).toHaveBeenCalled();
      expect(submitCreateAuction).toHaveBeenCalled();
    });
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
    expect(submitCreateAuction).not.toHaveBeenCalled();
  });
});
