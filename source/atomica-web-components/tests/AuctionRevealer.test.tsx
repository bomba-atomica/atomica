/**
 * UI component tests for AuctionRevealer (Phase 3e IBE wiring closure).
 *
 * Verifies that:
 *   1. The component renders the polling controls.
 *   2. The revealer starts polling `is_revealed` when the Start button is clicked.
 *   3. The cleartext submission section is shown when `is_revealed` returns true.
 *   4. The submitted cleartext count is displayed after submission.
 *
 * Uses vi.mock to stub `@atomica/sdk/aptos` so no blockchain calls are made.
 *
 * @see docs/architecture/v0-architecture.md §2.6 — cleartext submission
 * @see #90 — Phase 3e IBE wiring closure
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import { WalletContext } from "../../src/context/WalletContext";

const mockIsRevealed = vi.fn();
const mockSubmitCleartextAndClear = vi.fn();

vi.mock("@atomica/sdk/aptos", () => ({
  isRevealed: mockIsRevealed,
  submitCleartextAndClear: mockSubmitCleartextAndClear,
}));

import { AuctionRevealer } from "../../src/components/AuctionRevealer";

const ACCOUNT = "0x1234567890123456789012345678901234567890";

function renderRevealer(account: string | null = ACCOUNT) {
  return render(
    <WalletContext.Provider value={{ account, connect: vi.fn() }}>
      <AuctionRevealer />
    </WalletContext.Provider>,
  );
}

describe("AuctionRevealer — Phase 3e polling and cleartext submission", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the revealer with polling controls", () => {
    renderRevealer();
    expect(screen.getByTestId("revealer-window-id-input")).toBeTruthy();
    expect(screen.getByTestId("start-polling-button")).toBeTruthy();
    expect(screen.getByTestId("stop-polling-button")).toBeTruthy();
  });

  it("polls is_revealed when Start is clicked (not-yet-revealed)", async () => {
    mockIsRevealed.mockResolvedValue(false);
    renderRevealer();

    fireEvent.click(screen.getByTestId("start-polling-button"));

    await waitFor(() => {
      expect(screen.getByTestId("reveal-status")).toBeTruthy();
    });

    const status = screen.getByTestId("reveal-status");
    expect(status.textContent).toContain("Waiting for decryption key reveal");
  });

  it("shows cleartext submission section when is_revealed returns true", async () => {
    mockIsRevealed.mockResolvedValue(true);
    renderRevealer();

    fireEvent.click(screen.getByTestId("start-polling-button"));

    await waitFor(() => {
      expect(screen.getByTestId("cleartext-submission-section")).toBeTruthy();
    });

    const status = screen.getByTestId("reveal-status");
    expect(status.textContent).toContain("REVEALED");
    expect(screen.getByTestId("submit-cleartexts-button")).toBeTruthy();
    expect(screen.getByTestId("cleartexts-input")).toBeTruthy();
  });

  it("calls submitCleartextAndClear and shows submitted count", async () => {
    mockIsRevealed.mockResolvedValue(true);
    mockSubmitCleartextAndClear.mockResolvedValue({ hash: "0xsubmit" });
    renderRevealer();

    fireEvent.click(screen.getByTestId("start-polling-button"));

    await waitFor(() => {
      expect(screen.getByTestId("cleartext-submission-section")).toBeTruthy();
    });

    // Enter cleartext prices
    fireEvent.change(screen.getByTestId("cleartexts-input"), {
      target: { value: "110, 105, 95" },
    });

    fireEvent.click(screen.getByTestId("submit-cleartexts-button"));

    await waitFor(() => {
      expect(screen.getByTestId("submitted-count")).toBeTruthy();
    });

    expect(mockSubmitCleartextAndClear).toHaveBeenCalledWith(
      ACCOUNT,
      0n,
      new Uint8Array(0),
      [110n, 105n, 95n],
    );

    const count = screen.getByTestId("submitted-count");
    expect(count.textContent).toContain("3");
  });
});
