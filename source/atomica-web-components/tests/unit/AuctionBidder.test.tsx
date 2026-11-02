/**
 * UI component tests for AuctionBidder (Phase 3e IBE wiring closure).
 *
 * Verifies that:
 *   1. The component renders the FakeUSD lock step (Step 1) by default.
 *   2. The step indicator shows the active step correctly.
 *   3. Navigating to Step 2 via "Skip" renders the bid submission form.
 *   4. The collateral_lock_id, ciphertext, commitment and quantity fields are present in Step 2.
 *
 * V2 bid wrapper: the component submits an operator-supplied V2 ciphertext and a
 * 32-byte price commitment. There is no client-side encryption any more.
 *
 * Uses vi.mock to stub `@atomica/sdk/*` so tests run without a blockchain.
 *
 * @see docs/architecture/v0-architecture.md §2.5 — Bidder Collateral
 * @see #90 — Phase 3e IBE wiring closure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { WalletContext } from "../../src/context/WalletContext";

// Stub SDK modules so no blockchain calls are made.
vi.mock("@atomica/sdk/aptos", () => ({
  submitBid: vi.fn().mockResolvedValue({ hash: "0xabc123" }),
}));

vi.mock("@atomica/sdk/ethereum", () => ({
  approveFakeUsd: vi.fn().mockResolvedValue({ hash: "0xapprove" }),
  lockFakeUsd: vi.fn().mockResolvedValue({ hash: "0xlock123" }),
}));

vi.mock("../../src/storage/bidStorage", () => ({
  saveBidPrice: vi.fn(),
}));

import { AuctionBidder } from "../../src/components/AuctionBidder";

const ACCOUNT = "0x1234567890123456789012345678901234567890";

function renderBidder(account: string | null = ACCOUNT) {
  return render(
    <WalletContext.Provider value={{ account, connect: vi.fn() }}>
      <AuctionBidder />
    </WalletContext.Provider>,
  );
}

describe("AuctionBidder — Phase 3e IBE wiring", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the FakeUSD lock step (Step 1) by default", () => {
    renderBidder();
    expect(screen.getByTestId("lock-collateral-step")).toBeTruthy();
    expect(screen.getByTestId("approve-lock-usd-button")).toBeTruthy();
    expect(screen.getByTestId("collateral-amount-input")).toBeTruthy();
  });

  it("shows Step 1 as active in the step indicator", () => {
    renderBidder();
    const lockIndicator = screen.getByTestId("step-indicator-lock");
    const bidIndicator = screen.getByTestId("step-indicator-bid");
    // Step 1 should have active (bold) styling class
    expect(lockIndicator.className).toContain("bg-zinc-100");
    expect(bidIndicator.className).not.toContain("bg-zinc-100");
  });

  it("navigates to Step 2 when Skip button is clicked", () => {
    renderBidder();
    const skipButton = screen.getByTestId("skip-to-bid-button");
    fireEvent.click(skipButton);

    expect(screen.getByTestId("submit-bid-step")).toBeTruthy();
    expect(screen.getByTestId("submit-bid-button")).toBeTruthy();
    expect(screen.getByTestId("collateral-lock-id-input")).toBeTruthy();
    expect(screen.getByTestId("bid-amount-input")).toBeTruthy();
    expect(screen.getByTestId("window-id-input")).toBeTruthy();
  });

  it("shows the V2 ciphertext, commitment and quantity inputs in Step 2", () => {
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    expect(screen.getByTestId("bid-ciphertext-input")).toBeTruthy();
    expect(screen.getByTestId("bid-commitment-input")).toBeTruthy();
    expect(screen.getByTestId("bid-quantity-input")).toBeTruthy();
  });

  it("rejects a commitment that is not 32 bytes without submitting", async () => {
    const { submitBid } = await import("@atomica/sdk/aptos");
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    fireEvent.change(screen.getByTestId("bid-ciphertext-input"), {
      target: { value: "0x2013" },
    });
    fireEvent.change(screen.getByTestId("bid-commitment-input"), {
      target: { value: "0x00" },
    });
    fireEvent.click(screen.getByTestId("submit-bid-button"));
    const status = await screen.findByTestId("bid-status");
    expect(status.textContent).toContain("32 bytes");
    expect(submitBid).not.toHaveBeenCalled();
  });

  it("submits ciphertext, commitment, lock id and quantity to submitBid", async () => {
    const { submitBid } = await import("@atomica/sdk/aptos");
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    fireEvent.change(screen.getByTestId("bid-ciphertext-input"), {
      target: { value: "0x2013ab" },
    });
    fireEvent.change(screen.getByTestId("bid-commitment-input"), {
      target: { value: "0x" + "ab".repeat(32) },
    });
    fireEvent.change(screen.getByTestId("collateral-lock-id-input"), {
      target: { value: "0x" + "cd".repeat(32) },
    });
    fireEvent.change(screen.getByTestId("bid-quantity-input"), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByTestId("submit-bid-button"));
    await screen.findByText(/Bid Submitted/);
    expect(submitBid).toHaveBeenCalledTimes(1);
    const args = vi.mocked(submitBid).mock.calls[0];
    expect(args[0]).toBe(ACCOUNT);
    expect(Array.from(args[3])).toEqual([0x20, 0x13, 0xab]);
    expect(args[4]).toHaveLength(32);
    expect(args[5]).toHaveLength(32);
    expect(args[6]).toBe(7n);
  });

  it("shows Step 2 as active in step indicator after skipping to bid", () => {
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));

    const lockIndicator = screen.getByTestId("step-indicator-lock");
    const bidIndicator = screen.getByTestId("step-indicator-bid");
    expect(bidIndicator.className).toContain("bg-zinc-100");
    expect(lockIndicator.className).not.toContain("bg-zinc-100");
  });

  it("navigates back to Step 1 when Back button is clicked", () => {
    renderBidder();
    // Go to Step 2
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    expect(screen.getByTestId("submit-bid-step")).toBeTruthy();

    // Go back to Step 1
    fireEvent.click(screen.getByTestId("back-to-lock-button"));
    expect(screen.getByTestId("lock-collateral-step")).toBeTruthy();
  });

  it("renders the Approve & Lock FakeUSD button on Step 1", () => {
    renderBidder();
    const lockButton = screen.getByTestId("approve-lock-usd-button");
    expect(lockButton.textContent).toContain("Approve & Lock FakeUSD");
  });

  it("renders the Submit Encrypted Bid button on Step 2", () => {
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    const bidButton = screen.getByTestId("submit-bid-button");
    expect(bidButton.textContent).toContain("Submit Encrypted Bid");
  });
});
