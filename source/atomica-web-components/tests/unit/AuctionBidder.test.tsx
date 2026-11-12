/**
 * UI component tests for AuctionBidder (Phase 3e IBE wiring closure).
 *
 * Verifies that:
 *   1. The component renders the FakeUSD lock step (Step 1) by default.
 *   2. The step indicator shows the active step correctly.
 *   3. Navigating to Step 2 via "Skip" renders the bid submission form.
 *   4. The collateral_lock_id, price and quantity fields are present in Step 2.
 *   5. Submitting seals the bid in the client (`sealBid` reads the timelock key,
 *      identity and associated data from chain) for the wallet's derived Aptos
 *      address, then sends the sealed ciphertext and commitment to `submitBid`.
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
// SCOUT(#228) EDIT: the sealBid mock returns no commitment and no salt.
// SCOUT(#235) EDIT: the stored opening must equal this mocked salt and commitment.
vi.mock("@atomica/sdk/aptos", () => ({
  submitBid: vi.fn().mockResolvedValue({ hash: "0xabc123" }),
  sealBid: vi.fn().mockResolvedValue({
    timelockId: 11n,
    ciphertext: new Uint8Array([0x20, 0x13, 0xab]),
    commitment: new Uint8Array(32).fill(0xab),
    salt: new Uint8Array(32).fill(1),
  }),
}));

// SCOUT(#232) EDIT: this mock hides the checksum defect; the new case needs the real getDerivedAddress (importActual) or a file of its own.
vi.mock("@atomica/sdk", () => ({
  getDerivedAddress: vi
    .fn()
    .mockResolvedValue({ toString: () => "0x" + "0d".repeat(32) }),
}));

// SCOUT(#221) EDIT: the lockBinding mock returns a deadline.
// SCOUT(#233) EDIT: add lockFromReceipt, and mock the proof generator, waitForCertifiedBlock and getRegisterLockPayload.
// SCOUT(#234) EDIT: make approveFakeUsd or lockFakeUsd reject with the pin mismatch error.
vi.mock("@atomica/sdk/ethereum", () => ({
  approveFakeUsd: vi.fn().mockResolvedValue({ hash: "0xapprove" }),
  lockFakeUsd: vi.fn().mockResolvedValue({ hash: "0xlock123" }),
  currentWindowId: vi.fn(() => 7n),
  lockBinding: vi.fn((windowId: bigint) => ({
    windowId,
    pairHash: "0x" + "00".repeat(32),
    deadline: 1_800_000_000n,
  })),
}));

// SCOUT(#235) EDIT: mock saveBidOpening too, or use the real storage for the loadBidOpening case.
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

  it("asks for a price and quantity, not for ciphertext or commitment", () => {
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    expect(screen.queryByTestId("bid-ciphertext-input")).toBeNull();
    expect(screen.queryByTestId("bid-commitment-input")).toBeNull();
    expect(screen.getByTestId("bid-amount-input")).toBeTruthy();
    expect(screen.getByTestId("bid-quantity-input")).toBeTruthy();
  });

  // SCOUT(#217) EDIT: parsePrice rejects 0; the assert on the word positive depends on its message.
  it("rejects a price that is not positive without sealing or submitting", async () => {
    const { submitBid, sealBid } = await import("@atomica/sdk/aptos");
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    fireEvent.change(screen.getByTestId("bid-amount-input"), {
      target: { value: "0" },
    });
    fireEvent.click(screen.getByTestId("submit-bid-button"));
    const status = await screen.findByTestId("bid-status");
    expect(status.textContent).toContain("positive");
    expect(sealBid).not.toHaveBeenCalled();
    expect(submitBid).not.toHaveBeenCalled();
  });

  // SCOUT(#228) EDIT: the submitBid arguments shift (no commitment at index 4).
  // SCOUT(#217) EDIT: this types 200 and expects 200n; add the 2000 case.
  it("seals the bid for the derived address and submits ciphertext, commitment, lock id and quantity", async () => {
    const { submitBid, sealBid } = await import("@atomica/sdk/aptos");
    renderBidder();
    fireEvent.click(screen.getByTestId("skip-to-bid-button"));
    fireEvent.change(screen.getByTestId("window-id-input"), {
      target: { value: "9" },
    });
    fireEvent.change(screen.getByTestId("bid-amount-input"), {
      target: { value: "200" },
    });
    fireEvent.change(screen.getByTestId("collateral-lock-id-input"), {
      target: { value: "0x" + "cd".repeat(32) },
    });
    fireEvent.change(screen.getByTestId("bid-quantity-input"), {
      target: { value: "7" },
    });
    fireEvent.click(screen.getByTestId("submit-bid-button"));
    await screen.findByText(/Bid Submitted/);

    expect(sealBid).toHaveBeenCalledTimes(1);
    const sealArgs = vi.mocked(sealBid).mock.calls[0];
    expect(sealArgs[0]).toBe(9n);
    expect(sealArgs[2]).toBe("0x" + "0d".repeat(32));
    expect(sealArgs[3]).toBe(200n);

    expect(submitBid).toHaveBeenCalledTimes(1);
    const args = vi.mocked(submitBid).mock.calls[0];
    expect(args[0]).toBe(ACCOUNT);
    expect(args[1]).toBe(9n);
    expect(Array.from(args[3])).toEqual([0x20, 0x13, 0xab]);
    expect(args[4]).toEqual(new Uint8Array(32).fill(0xab));
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

  it.todo("SCOUT(#217) typing 2000 in the price field makes sealBid receive 2000n");
  it.todo("SCOUT(#217) a price of 2000.5, -1 or an empty field shows an error and neither seals nor submits");
  it.todo("SCOUT(#232) with a checksummed account and the real getDerivedAddress, sealBid receives the address derived from the lowercase account");
  it.todo("SCOUT(#233) after the lock, the collateral lock id field equals the lockId of the Locked event and never the transaction hash");
  it.todo("SCOUT(#233) the lock step calls approve, lock, the certified block wait, the proof generator with the FakeUSD token and the register transaction with asset FakeUSD, in that order");
  it.todo("SCOUT(#233) the pair bytes passed to lockBinding equal the pair bytes passed to sealBid and submitBid");
  it.todo("SCOUT(#233) when the register transaction rejects, the error shows, the step stays on the lock step, and a retry sends no second approve or lock");
  it.todo("SCOUT(#234) when the SDK lock rejects with the pin mismatch error, the lock step shows the expected address and does not advance");
  it.todo("SCOUT(#235) after a successful bid, loadBidOpening returns the price, salt and commitment that sealBid returned");
  it.todo("SCOUT(#235) nothing is stored when submitBid rejects");
  it.todo("SCOUT(#228) submitBid is called with no commitment");
});
