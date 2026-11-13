/**
 * Unit tests for AuctionCreator component.
 *
 * Verifies that:
 *   1. Form fields for window_id and lock_id are rendered, with no price field.
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
      getBytes: vi.fn((v: string) => actual.ethers.getBytes(v)),
    },
  };
});

import { AuctionCreator } from "../../src/components/AuctionCreator";
import { submitCreateAuction, registerTimelock } from "@atomica/sdk/aptos";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";

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

  it("renders form fields for window_id and lock_id, and no Min Price field", () => {
    renderAuctionCreator();

    // Window ID input
    const windowIdLabel = screen.getByText(/Window ID/i);
    expect(windowIdLabel).toBeTruthy();

    // There is no reserve price field.
    expect(screen.queryByText(/Min Price/i)).toBeNull();

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
    // submitCreateAuction(account, windowId, pairBcs, lockId, timelockId)
    const args = vi.mocked(submitCreateAuction).mock.calls[0];
    expect(args).toHaveLength(5);
    expect(args[4]).toBe(5n);
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
  it("submitCreateAuction is called without a price argument", async () => {
    renderAuctionCreator();

    fireEvent.click(screen.getByRole("button", { name: /Create Auction/i }));

    await waitFor(() => {
      expect(submitCreateAuction).toHaveBeenCalledTimes(1);
    });
    // (account, windowId, pairBcs, lockId, timelockId): the lock id is
    // followed directly by the timelock id, with no price between them.
    const args = vi.mocked(submitCreateAuction).mock.calls[0];
    expect(args).toEqual([ACCOUNT, 0n, LAUNCH_PAIR_BCS, new Uint8Array(32), 5n]);
  });

  it("the pair defaults to the SDK launch pair constant", async () => {
    renderAuctionCreator();
    const input = screen.getByPlaceholderText(/launch pair/i) as HTMLInputElement;
    expect(input.value).toBe(
      "0x08657468657265756d0746616b6545544808657468657265756d0746616b65555344",
    );

    // An empty input also means the launch pair.
    fireEvent.change(input, { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /Create Auction/i }));
    await waitFor(() => {
      expect(submitCreateAuction).toHaveBeenCalledTimes(1);
    });
    expect(vi.mocked(submitCreateAuction).mock.calls[0][2]).toEqual(
      LAUNCH_PAIR_BCS,
    );
  });
});
