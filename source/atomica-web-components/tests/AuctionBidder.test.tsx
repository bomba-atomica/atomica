/**
 * UI component tests for AuctionBidder (Phase 3e IBE wiring closure).
 *
 * Verifies that:
 *   1. The component renders the FakeUSD lock step (Step 1) by default.
 *   2. The step indicator shows the active step correctly.
 *   3. Navigating to Step 2 via "Skip" renders the bid submission form.
 *   4. The collateral_lock_id and deadline fields are present in Step 2.
 *
 * Phase 3e change: `generateSystemParameters` is gone — replaced by `getMpk`
 * (on-chain fetch) and `computeIdentity` (from `@atomica/sdk/ibe`).
 *
 * Uses vi.mock to stub `@atomica/sdk/*` and `@atomica/state-proof-verifier/ibe`
 * so tests run without blockchain or cryptographic dependencies.
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
  getMpk: vi.fn().mockResolvedValue(new Uint8Array(48)),
}));

vi.mock("@atomica/sdk/ethereum", () => ({
  approveFakeUsd: vi.fn().mockResolvedValue({ hash: "0xapprove" }),
  lockFakeUsd: vi.fn().mockResolvedValue({ hash: "0xlock123" }),
}));

// Phase 3e: encrypt is imported directly (not via ibe.encrypt), computeIdentity via @atomica/sdk/ibe.
vi.mock("@atomica/state-proof-verifier/ibe", () => ({
  encrypt: vi.fn().mockResolvedValue({
    u: new Uint8Array(48),
    v: new Uint8Array(32),
  }),
}));

vi.mock("@atomica/sdk/ibe", () => ({
  computeIdentity: vi.fn().mockReturnValue(new Uint8Array(32)),
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

  it("shows the deadline-us input field in Step 2 (Phase 3e addition)", () => {
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    expect(screen.getByTestId("deadline-us-input")).toBeTruthy();
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
