/**
 * UI component tests for AuctionRevealer.
 *
 * Verifies that:
 *   1. The component renders the polling controls.
 *   1b. The window comes from the windowId and pairBcs props: no window or
 *      pair input.
 *   2. The revealer reads the window's timelock id and polls its status.
 *   2b. An expired timelock is reported, polling stops, and the report points
 *      to Unwind.
 *   3. The open section is shown when the timelock is revealed. It has no
 *      price or salt input.
 *   4. "Open bids" sends `openBids` with `MAX_OPEN_BIDS_PER_CALL` until
 *      `getOpenCursor` reports every bid opened, shows the count, then sends
 *      `finalizeWindow` once.
 *   5. "Preview bids" decrypts the bids off chain (`decryptWindowBids`) and
 *      only shows them.
 *
 * Uses vi.mock to stub `@atomica/sdk/aptos` so no blockchain calls are made.
 *
 * @see docs/architecture/v0-architecture.md §2.6 — on-chain opening
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
  mockGetTimelockStatus,
  mockOpenBids,
  mockFinalizeWindow,
  mockGetOpenCursor,
  mockGetWindowTimelockId,
  mockDecryptWindowBids,
} = vi.hoisted(() => ({
  mockGetTimelockStatus: vi.fn(),
  mockOpenBids: vi.fn(),
  mockFinalizeWindow: vi.fn(),
  mockGetOpenCursor: vi.fn(),
  mockGetWindowTimelockId: vi.fn(),
  mockDecryptWindowBids: vi.fn(),
}));

vi.mock("@atomica/sdk/aptos", () => ({
  MAX_OPEN_BIDS_PER_CALL: 12n,
  getTimelockStatus: mockGetTimelockStatus,
  openBids: mockOpenBids,
  finalizeWindow: mockFinalizeWindow,
  getOpenCursor: mockGetOpenCursor,
  getWindowTimelockId: mockGetWindowTimelockId,
  decryptWindowBids: mockDecryptWindowBids,
}));

import { AuctionRevealer } from "../../src/components/AuctionRevealer";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";

const ACCOUNT = "0x1234567890123456789012345678901234567890";

function renderRevealer(account: string | null = ACCOUNT) {
  return render(
    <WalletContext.Provider value={{ account, connect: vi.fn() }}>
      <AuctionRevealer windowId={0n} pairBcs={LAUNCH_PAIR_BCS} />
    </WalletContext.Provider>,
  );
}

describe("AuctionRevealer — polling and the Open bids action", () => {
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
    expect(screen.getByTestId("start-polling-button")).toBeTruthy();
    expect(screen.getByTestId("stop-polling-button")).toBeTruthy();
  });

  it("takes windowId and pairBcs props and renders no window or pair input", async () => {
    const pair = new Uint8Array([9, 8, 7]);
    mockGetWindowTimelockId.mockResolvedValue(77n);
    mockGetTimelockStatus.mockResolvedValue({ status: "revealed" });
    mockGetOpenCursor.mockResolvedValue({ next: 0n, total: 0n });
    const { container } = render(
      <WalletContext.Provider value={{ account: ACCOUNT, connect: vi.fn() }}>
        <AuctionRevealer windowId={31n} pairBcs={pair} />
      </WalletContext.Provider>,
    );
    expect(container.querySelector("input")).toBeNull();
    expect(screen.queryByTestId("revealer-window-id-input")).toBeNull();
    expect(screen.queryByTestId("revealer-pair-bcs-input")).toBeNull();
    expect(screen.getByTestId("revealer-window").textContent).toContain("31");

    fireEvent.click(screen.getByTestId("start-polling-button"));
    await waitFor(() => {
      expect(screen.getByTestId("open-bids-button")).toBeTruthy();
    });
    expect(mockGetWindowTimelockId).toHaveBeenCalledWith(31n);
    expect(mockGetTimelockStatus).toHaveBeenCalledWith(77n);
    fireEvent.click(screen.getByTestId("open-bids-button"));
    await waitFor(() => {
      expect(mockGetOpenCursor).toHaveBeenCalledWith(31n, pair);
    });
  });

  it("reports an expired timelock and points to Unwind", async () => {
    mockGetTimelockStatus.mockResolvedValue({
      status: "expired",
      reason: "reveal-window-elapsed",
    });
    renderRevealer();
    fireEvent.click(screen.getByTestId("start-polling-button"));
    const report = await screen.findByTestId("timelock-expired");
    expect(report.textContent).toContain("expired");
    expect(report.textContent).toContain("reveal window elapsed");
    expect(report.textContent).toContain("Unwind");
    // Polling stops: the timelock can never reveal now.
    await waitFor(() => {
      expect(
        (screen.getByTestId("start-polling-button") as HTMLButtonElement)
          .disabled,
      ).toBe(false);
    });
    const calls = mockGetTimelockStatus.mock.calls.length;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(mockGetTimelockStatus.mock.calls.length).toBe(calls);
    expect(screen.queryByTestId("reveal-status")).toBeNull();
    expect(screen.queryByTestId("open-bids-section")).toBeNull();
  });

  it("polls is_revealed when Start is clicked (not-yet-revealed)", async () => {
    mockGetTimelockStatus.mockResolvedValue({ status: "pending" });
    renderRevealer();

    fireEvent.click(screen.getByTestId("start-polling-button"));

    await waitFor(() => {
      expect(screen.getByTestId("reveal-status")).toBeTruthy();
    });

    const status = screen.getByTestId("reveal-status");
    expect(status.textContent).toContain("Waiting for decryption key reveal");
    // The window id's timelock id, not the window id, is polled.
    expect(mockGetWindowTimelockId).toHaveBeenCalledWith(0n);
    expect(mockGetTimelockStatus).toHaveBeenCalledWith(42n);
  });

  it("shows the Open bids action, with no price or salt input, when is_revealed returns true", async () => {
    mockGetTimelockStatus.mockResolvedValue({ status: "revealed" });
    renderRevealer();

    fireEvent.click(screen.getByTestId("start-polling-button"));

    await waitFor(() => {
      expect(screen.getByTestId("open-bids-section")).toBeTruthy();
    });

    const status = screen.getByTestId("reveal-status");
    expect(status.textContent).toContain("REVEALED");
    expect(screen.getByTestId("open-bids-button").textContent).toBe(
      "Open bids",
    );
    expect(screen.queryByTestId("cleartexts-input")).toBeNull();
    expect(screen.queryByTestId("salts-input")).toBeNull();
  });

  it("Open bids calls openBids until every bid is opened, shows the count, then calls finalizeWindow once", async () => {
    mockGetTimelockStatus.mockResolvedValue({ status: "revealed" });
    // 25 bids: batches of 12, 12 and 1.
    mockGetOpenCursor
      .mockResolvedValueOnce({ next: 0n, total: 25n })
      .mockResolvedValueOnce({ next: 12n, total: 25n })
      .mockResolvedValueOnce({ next: 24n, total: 25n })
      .mockResolvedValueOnce({ next: 25n, total: 25n });
    mockOpenBids.mockResolvedValue({ hash: "0xopen" });
    mockFinalizeWindow.mockResolvedValue({ hash: "0xfinal" });
    renderRevealer();
    fireEvent.click(screen.getByTestId("start-polling-button"));
    await waitFor(() => {
      expect(screen.getByTestId("open-bids-button")).toBeTruthy();
    });

    fireEvent.click(screen.getByTestId("open-bids-button"));
    await waitFor(() => {
      expect(screen.getByTestId("open-status").textContent).toContain(
        "cleared the window",
      );
    });

    expect(mockOpenBids).toHaveBeenCalledTimes(3);
    for (const call of mockOpenBids.mock.calls) {
      expect(call).toEqual([ACCOUNT, 0n, LAUNCH_PAIR_BCS, 12n]);
    }
    expect(mockGetOpenCursor).toHaveBeenCalledWith(0n, LAUNCH_PAIR_BCS);
    expect(mockFinalizeWindow).toHaveBeenCalledTimes(1);
    expect(mockFinalizeWindow).toHaveBeenCalledWith(
      ACCOUNT,
      0n,
      LAUNCH_PAIR_BCS,
    );
    // finalize_window comes after the last open_bids.
    expect(mockFinalizeWindow.mock.invocationCallOrder[0]).toBeGreaterThan(
      mockOpenBids.mock.invocationCallOrder[2],
    );
    expect(screen.getByTestId("opened-count").textContent).toContain(
      "25 of 25",
    );
  });

  it("a window whose bids are all opened only sends finalizeWindow", async () => {
    mockGetTimelockStatus.mockResolvedValue({ status: "revealed" });
    mockGetOpenCursor.mockResolvedValue({ next: 3n, total: 3n });
    mockFinalizeWindow.mockResolvedValue({ hash: "0xfinal" });
    renderRevealer();
    fireEvent.click(screen.getByTestId("start-polling-button"));
    await waitFor(() => {
      expect(screen.getByTestId("open-bids-button")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("open-bids-button"));
    await waitFor(() => {
      expect(mockFinalizeWindow).toHaveBeenCalledTimes(1);
    });
    expect(mockOpenBids).not.toHaveBeenCalled();
  });

  it("a window with no bids sends nothing", async () => {
    mockGetTimelockStatus.mockResolvedValue({ status: "revealed" });
    mockGetOpenCursor.mockResolvedValue({ next: 0n, total: 0n });
    renderRevealer();
    fireEvent.click(screen.getByTestId("start-polling-button"));
    await waitFor(() => {
      expect(screen.getByTestId("open-bids-button")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("open-bids-button"));
    await waitFor(() => {
      expect(screen.getByTestId("open-status").textContent).toContain(
        "No bids",
      );
    });
    expect(mockOpenBids).not.toHaveBeenCalled();
    expect(mockFinalizeWindow).not.toHaveBeenCalled();
  });

  it("stops and shows the error when open_bids fails, without finalizing", async () => {
    mockGetTimelockStatus.mockResolvedValue({ status: "revealed" });
    mockGetOpenCursor.mockResolvedValue({ next: 0n, total: 5n });
    mockOpenBids.mockRejectedValueOnce(new Error("Move abort 20"));
    renderRevealer();
    fireEvent.click(screen.getByTestId("start-polling-button"));
    await waitFor(() => {
      expect(screen.getByTestId("open-bids-button")).toBeTruthy();
    });
    fireEvent.click(screen.getByTestId("open-bids-button"));
    await waitFor(() => {
      expect(screen.getByTestId("open-status").textContent).toContain(
        "Move abort 20",
      );
    });
    expect(mockOpenBids).toHaveBeenCalledTimes(1);
    expect(mockFinalizeWindow).not.toHaveBeenCalled();
  });

  it("Preview bids decrypts the bids off chain and only shows them", async () => {
    mockGetTimelockStatus.mockResolvedValue({ status: "revealed" });
    mockDecryptWindowBids.mockResolvedValue([
      {
        index: 0,
        bidder: "0x" + "0a".repeat(32),
        alreadyOpened: false,
        valid: true,
        price: 2000n,
      },
      {
        index: 1,
        bidder: "0x" + "0b".repeat(32),
        alreadyOpened: false,
        valid: true,
        error: "bid plaintext is not an 8-byte price",
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
    expect(mockDecryptWindowBids).toHaveBeenCalledWith(0n, LAUNCH_PAIR_BCS);
    const rows = screen.getAllByTestId("decrypted-bid");
    expect(rows[0].textContent).toContain("price $2000");
    expect(rows[0].textContent).toContain("not opened yet");
    expect(rows[1].textContent).toContain("8-byte price");
    expect(mockOpenBids).not.toHaveBeenCalled();
    expect(mockFinalizeWindow).not.toHaveBeenCalled();
  });

  it("an opened bid that the chain marks invalid is shown as invalid", async () => {
    mockGetTimelockStatus.mockResolvedValue({ status: "revealed" });
    mockDecryptWindowBids.mockResolvedValue([
      {
        index: 0,
        bidder: "0x" + "0a".repeat(32),
        alreadyOpened: true,
        valid: true,
        price: 2000n,
      },
      {
        index: 1,
        bidder: "0x" + "0b".repeat(32),
        alreadyOpened: true,
        valid: false,
        price: 300n,
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
    const rows = screen.getAllByTestId("decrypted-bid");
    expect(rows[0].textContent).toContain("(opened)");
    expect(rows[0].textContent).not.toContain("invalid");
    expect(rows[1].textContent).toContain("opened, invalid");
  });
});
