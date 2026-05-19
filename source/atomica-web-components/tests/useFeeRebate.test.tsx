/**
 * Unit tests for useFeeRebate hook — issue #113.
 *
 * Verifies that the hook returns real rebate values from mocked settled
 * auction data, with isWinner determined from getBidResults.
 *
 * Uses vi.mock to stub @atomica/sdk/aptos so no network is required.
 *
 * @see docs/architecture/v0-architecture.md §2 (fee/rebate section)
 * @see source/atomica-web-components/src/hooks/useFeeRebate.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { FeeRebateDisplay } from "../src/components/FeeRebateDisplay";
import { useFeeRebate } from "../src/hooks/useFeeRebate";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockIsSettled = vi.fn();
const mockGetSettlement = vi.fn();
const mockGetBidResults = vi.fn();
const mockFetchRebates = vi.fn();

vi.mock("@atomica/sdk/aptos", () => ({
  isSettled: (...args: unknown[]) => mockIsSettled(...args),
  getSettlement: (...args: unknown[]) => mockGetSettlement(...args),
  getBidResults: (...args: unknown[]) => mockGetBidResults(...args),
  fetchRebates: (...args: unknown[]) => mockFetchRebates(...args),
}));

// ─── Test harness ─────────────────────────────────────────────────────────────

function FeeRebateHarness({
  windowId,
  pairBcs,
  bidderAddress,
}: {
  windowId: bigint | null;
  pairBcs: Uint8Array | null;
  bidderAddress: string;
}) {
  const result = useFeeRebate(windowId, pairBcs, bidderAddress);

  if (!result.ready) {
    return <div data-testid="fee-rebate-loading">Loading...</div>;
  }

  if (result.pending) {
    return <div data-testid="fee-rebate-pending">Pending...</div>;
  }

  return (
    <div>
      <div data-testid="fee-rebate-ready">ready</div>
      <div data-testid="fee-rebate-is-winner">
        {result.isWinner ? "true" : "false"}
      </div>
      <FeeRebateDisplay
        rebateAmount={result.rebateAmount}
        feeAmount={result.feeAmount}
      />
    </div>
  );
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const PAIR_BCS = new Uint8Array([1, 2, 3]);
const WINDOW_ID = 42n;
const BIDDER = "0xdeadbeef";
const CLEARING_PRICE = 1_000_000n; // $1.00

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useFeeRebate — real rebate values from mocked settled auction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSettled.mockResolvedValue(true);
    mockGetSettlement.mockResolvedValue({
      clearingPrice: CLEARING_PRICE,
      totalFilled: 1_000_000_000_000_000_000n,
    });
    mockGetBidResults.mockResolvedValue([
      { bidder: BIDDER, fillAmount: 1_000_000_000_000_000_000n, isWinner: true },
    ]);
    mockFetchRebates.mockResolvedValue([
      { bidder: BIDDER, amount: 100_000n }, // $0.10 rebate
    ]);
  });

  afterEach(() => {
    cleanup();
  });

  it("stays loading when windowId is null", () => {
    render(
      <FeeRebateHarness
        windowId={null}
        pairBcs={PAIR_BCS}
        bidderAddress={BIDDER}
      />,
    );
    expect(screen.getByTestId("fee-rebate-loading")).toBeTruthy();
  });

  it("stays loading when settlement returns false", async () => {
    mockIsSettled.mockResolvedValue(false);

    render(
      <FeeRebateHarness
        windowId={WINDOW_ID}
        pairBcs={PAIR_BCS}
        bidderAddress={BIDDER}
      />,
    );

    // Give hook time to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(screen.getByTestId("fee-rebate-loading")).toBeTruthy();
  });

  it("returns real rebate amount from mocked settled auction", async () => {
    render(
      <FeeRebateHarness
        windowId={WINDOW_ID}
        pairBcs={PAIR_BCS}
        bidderAddress={BIDDER}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("fee-rebate-ready")).toBeTruthy();
    });

    // rebate-amount: 100_000 micro-USD → $0.10
    const rebateEl = screen.getByTestId("rebate-amount");
    expect(rebateEl.textContent).toContain("$0.10");
  });

  it("sets isWinner=true when bidder appears in getBidResults as winner", async () => {
    render(
      <FeeRebateHarness
        windowId={WINDOW_ID}
        pairBcs={PAIR_BCS}
        bidderAddress={BIDDER}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("fee-rebate-ready")).toBeTruthy();
    });

    expect(screen.getByTestId("fee-rebate-is-winner").textContent).toBe("true");
  });

  it("sets isWinner=false when bidder is not a winner", async () => {
    mockGetBidResults.mockResolvedValue([
      { bidder: BIDDER, fillAmount: 0n, isWinner: false },
    ]);
    mockFetchRebates.mockResolvedValue([
      { bidder: BIDDER, amount: 0n },
    ]);

    render(
      <FeeRebateHarness
        windowId={WINDOW_ID}
        pairBcs={PAIR_BCS}
        bidderAddress={BIDDER}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("fee-rebate-ready")).toBeTruthy();
    });

    expect(screen.getByTestId("fee-rebate-is-winner").textContent).toBe(
      "false",
    );
  });

  it("shows pending state when fetchRebates returns null (E_NOT_IMPLEMENTED)", async () => {
    mockFetchRebates.mockResolvedValue(null);

    render(
      <FeeRebateHarness
        windowId={WINDOW_ID}
        pairBcs={PAIR_BCS}
        bidderAddress={BIDDER}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("fee-rebate-pending")).toBeTruthy();
    });
  });

  it("feeAmount is always 0 in v0 Beta", async () => {
    render(
      <FeeRebateHarness
        windowId={WINDOW_ID}
        pairBcs={PAIR_BCS}
        bidderAddress={BIDDER}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("fee-rebate-ready")).toBeTruthy();
    });

    const feeEl = screen.getByTestId("fee-amount");
    expect(feeEl.textContent).toContain("$0.00");
  });
});
