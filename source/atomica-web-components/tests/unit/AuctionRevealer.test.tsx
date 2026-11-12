/**
 * UI component tests for AuctionRevealer (Phase 3e IBE wiring closure).
 *
 * Verifies that:
 *   1. The component renders the polling controls.
 *   2. The revealer reads the window's timelock id and polls `is_revealed` for it.
 *   3. The cleartext submission section is shown when `is_revealed` returns true.
 *   4. The submitted cleartext count is displayed after submission.
 *   5. "Decrypt Bids" opens the bids off chain (`decryptWindowBids`, which reads
 *      `timelock::get_decryption_key`) and fills in the prices and salts.
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

const {
  mockIsRevealed,
  mockSubmitCleartextAndClear,
  mockGetWindowTimelockId,
  mockDecryptWindowBids,
} = vi.hoisted(() => ({
  mockIsRevealed: vi.fn(),
  mockSubmitCleartextAndClear: vi.fn(),
  mockGetWindowTimelockId: vi.fn(),
  mockDecryptWindowBids: vi.fn(),
}));

// SCOUT(#228) EDIT: mock openBids instead of submitCleartextAndClear.
vi.mock("@atomica/sdk/aptos", () => ({
  isRevealed: mockIsRevealed,
  submitCleartextAndClear: mockSubmitCleartextAndClear,
  getWindowTimelockId: mockGetWindowTimelockId,
  decryptWindowBids: mockDecryptWindowBids,
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

// SCOUT(#228) EDIT: rewrite this suite for the single Open bids action.
// SCOUT(#236) EDIT: the same suite asserts one open-and-clear transaction with no typed price or salt.
describe("AuctionRevealer — Phase 3e polling and cleartext submission", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockGetWindowTimelockId.mockResolvedValue(42n);
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
    // The window's timelock id, not the window id, is polled.
    // SCOUT(#224) EDIT: an empty pair input means the launch pair, so expect the SDK launch pair bytes.
    expect(mockGetWindowTimelockId).toHaveBeenCalledWith(0n, new Uint8Array(0));
    expect(mockIsRevealed).toHaveBeenCalledWith(42n);
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

  // SCOUT(#228) REMOVE: this case.
  // SCOUT(#217) EDIT: it types the cleartext prices 110, 105, 95.
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
    const salt = "0x" + "11".repeat(32);
    fireEvent.change(screen.getByTestId("salts-input"), {
      target: { value: `${salt}, ${salt}, ` },
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
      [
        new Uint8Array(32).fill(0x11),
        new Uint8Array(32).fill(0x11),
        new Uint8Array(0),
      ],
    );

    const count = screen.getByTestId("submitted-count");
    expect(count.textContent).toContain("3");
  });

  // SCOUT(#228) REMOVE: this case.
  it("rejects a salt count that does not match the cleartexts", async () => {
    mockIsRevealed.mockResolvedValue(true);
    renderRevealer();
    fireEvent.click(screen.getByTestId("start-polling-button"));
    await waitFor(() => {
      expect(screen.getByTestId("cleartext-submission-section")).toBeTruthy();
    });
    fireEvent.change(screen.getByTestId("cleartexts-input"), {
      target: { value: "110, 105" },
    });
    fireEvent.change(screen.getByTestId("salts-input"), {
      target: { value: "0x" + "11".repeat(32) },
    });
    fireEvent.click(screen.getByTestId("submit-cleartexts-button"));
    await waitFor(() => {
      expect(screen.getByTestId("submit-status").textContent).toContain(
        "one salt per cleartext",
      );
    });
    expect(mockSubmitCleartextAndClear).not.toHaveBeenCalled();
  });

  // SCOUT(#228) EDIT: decrypt is a preview only, with no salts.
  // SCOUT(#217) EDIT: it asserts the text price 200.
  it("decrypts the bids with the revealed key and fills in prices and salts", async () => {
    mockIsRevealed.mockResolvedValue(true);
    mockSubmitCleartextAndClear.mockResolvedValue({ hash: "0xsubmit" });
    const salt = new Uint8Array(32).fill(0x22);
    mockDecryptWindowBids.mockResolvedValue([
      {
        index: 0,
        bidder: "0x" + "0a".repeat(32),
        alreadyOpened: false,
        price: 200n,
        salt,
        matchesCommitment: true,
      },
      {
        index: 1,
        bidder: "0x" + "0b".repeat(32),
        alreadyOpened: false,
        matchesCommitment: false,
        error: "bad signature",
      },
    ]);
    renderRevealer();
    fireEvent.click(screen.getByTestId("start-polling-button"));
    await waitFor(() => {
      expect(screen.getByTestId("decrypt-bids-button")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("decrypt-bids-button"));
    await waitFor(() => {
      expect(screen.getAllByTestId("decrypted-bid")).toHaveLength(2);
    });
    expect(mockDecryptWindowBids).toHaveBeenCalledWith(0n, new Uint8Array(0));
    const rows = screen.getAllByTestId("decrypted-bid");
    expect(rows[0].textContent).toContain("price 200");
    expect(rows[0].textContent).toContain("matches commitment");
    expect(rows[1].textContent).toContain("cannot open");
    expect(
      (screen.getByTestId("cleartexts-input") as HTMLInputElement).value,
    ).toBe("200, 0");

    fireEvent.click(screen.getByTestId("submit-cleartexts-button"));
    await waitFor(() => {
      expect(screen.getByTestId("submitted-count")).toBeTruthy();
    });
    expect(mockSubmitCleartextAndClear).toHaveBeenCalledWith(
      ACCOUNT,
      0n,
      new Uint8Array(0),
      [200n, 0n],
      [salt, new Uint8Array(0)],
    );
  });

  it.todo("SCOUT(#236) the open step sends one open-and-clear transaction built from decryptWindowBids, with no price or salt typed by the user");
  it.todo("SCOUT(#228) Open bids calls openBids until every bid is opened and shows the count");
  it.todo("SCOUT(#216) an opened bid that the chain marks invalid is shown as invalid");
});
