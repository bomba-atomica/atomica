/**
 * Unit tests for AuctionCreator component.
 *
 * Verifies that:
 *   1. Form fields for window_id and lock_id are rendered, with no price field.
 *   2. The submit button sends one transaction, submitCreateAuction, with no
 *      timelock id: create_auction registers the window timelock itself.
 *   3. An error message is shown when the transaction is rejected, or when
 *      the lock id is empty (then nothing is submitted).
 *
 * Mocks @atomica/sdk/aptos and ethers so no blockchain connection is needed.
 *
 * @see docs/architecture/v0-architecture.md
 * @see #135 — Web component unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { WalletContext } from "../../src/context/WalletContext";

vi.mock("@atomica/sdk/aptos", () => ({
  submitCreateAuction: vi.fn().mockResolvedValue({ hash: "0xdeadbeef" }),
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
import * as aptosSdk from "@atomica/sdk/aptos";
import { submitCreateAuction } from "@atomica/sdk/aptos";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";

const ACCOUNT = "0xAbCd1234567890123456789012345678901234Ab";
const LOCK_ID_HEX = "0x" + "ab".repeat(32);

function renderAuctionCreator(
  account: string | null = ACCOUNT,
  lockIdHex: string = LOCK_ID_HEX,
) {
  const view = render(
    <WalletContext.Provider value={{ account, connect: vi.fn() }}>
      <AuctionCreator />
    </WalletContext.Provider>,
  );
  fireEvent.change(screen.getByPlaceholderText("0x..."), {
    target: { value: lockIdHex },
  });
  return view;
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

  it("the create step submits exactly one transaction and none to 0x1::ibe_config::register_timelock", async () => {
    renderAuctionCreator();

    fireEvent.click(screen.getByRole("button", { name: /Create Auction/i }));

    await waitFor(() => {
      expect(submitCreateAuction).toHaveBeenCalledTimes(1);
    });
    // The SDK has no timelock registration to call, and the one transaction
    // is create_auction(window_id, pair_bcs, lock_id) with no timelock id.
    expect("registerTimelock" in aptosSdk).toBe(false);
    expect("getRegisterTimelockPayload" in aptosSdk).toBe(false);
    const args = vi.mocked(submitCreateAuction).mock.calls[0];
    expect(args).toHaveLength(4);
  });

  it("with an empty lock id the create step shows an error and submits nothing", async () => {
    renderAuctionCreator(ACCOUNT, "");

    fireEvent.click(screen.getByRole("button", { name: /Create Auction/i }));

    await waitFor(() => {
      expect(screen.getByText(/Error: enter the lock id/i)).toBeTruthy();
    });
    expect(submitCreateAuction).not.toHaveBeenCalled();
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

  it("submitCreateAuction is called without a price argument", async () => {
    renderAuctionCreator();

    fireEvent.click(screen.getByRole("button", { name: /Create Auction/i }));

    await waitFor(() => {
      expect(submitCreateAuction).toHaveBeenCalledTimes(1);
    });
    // (account, windowId, pairBcs, lockId): no price and no timelock id.
    const args = vi.mocked(submitCreateAuction).mock.calls[0];
    expect(args).toEqual([
      ACCOUNT,
      0n,
      LAUNCH_PAIR_BCS,
      new Uint8Array(32).fill(0xab),
    ]);
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
