/**
 * UI component tests for SellFlow step rendering.
 *
 * Verifies that the correct step panel is displayed for each flow state.
 * Uses vi.mock to control useSellFlow output and avoid blockchain calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { WalletContext } from "../../src/context/WalletContext";

// Mock balance hooks so BalancesProvider doesn't make real network calls.
vi.mock("../../src/hooks/useEthereumBalances", () => ({
  useEthereumBalances: vi.fn().mockReturnValue({
    ethAccountExists: true,
    ethBalance: 0n,
    ethFakeETH: 10n * 10n ** 18n,
    ethFakeUSD: 0n,
    ethContractsDeployed: true,
    loading: false,
    refetch: vi.fn(),
  }),
}));
vi.mock("../../src/hooks/useAptosBalances", () => ({
  useAptosBalances: vi.fn().mockReturnValue({
    apt: 1,
    aptAccountExists: true,
    aptosContractsDeployed: true,
    loading: false,
    refetch: vi.fn(),
  }),
}));

// The trade steps the monitoring step mounts: stubs that show their props.
vi.mock("../../src/components/AuctionRevealer", () => ({
  AuctionRevealer: (p: { windowId: bigint; pairBcs: Uint8Array }) => (
    <div
      data-testid="stub-open"
      data-window={p.windowId.toString()}
      data-pair={p.pairBcs.length}
    />
  ),
}));
vi.mock("../../src/components/SettleButton", () => ({
  SettleButton: (p: { windowId: bigint; pairBcs: Uint8Array }) => (
    <div
      data-testid="stub-settle"
      data-window={p.windowId.toString()}
      data-pair={p.pairBcs.length}
    />
  ),
}));
vi.mock("../../src/components/ReleaseButton", () => ({
  ReleaseButton: (p: { windowId: bigint; pairBcs: Uint8Array }) => (
    <div
      data-testid="stub-release"
      data-window={p.windowId.toString()}
      data-pair={p.pairBcs.length}
    />
  ),
}));
vi.mock("@atomica/sdk/aptos", () => ({
  getWindowDeadlineUs: vi.fn().mockRejectedValue(new Error("no timelock")),
  isSettled: vi.fn().mockResolvedValue(false),
}));

// Mock useSellFlow so we can control the displayed step. The factory keeps
// vitest from loading the real hook and its SDK imports.
vi.mock("../../src/hooks/useSellFlow", () => ({ useSellFlow: vi.fn() }));

import { useSellFlow } from "../../src/hooks/useSellFlow";
import { SellFlow } from "../../src/components/SellFlow/SellFlow";
import { BalancesProvider } from "../../src/context/BalancesContext";
import { LAUNCH_PAIR_BCS } from "@atomica/sdk/settlement/bridge";

const ACCOUNT = "0x1234567890123456789012345678901234567890";

const BASE_FLOW = {
  loading: false,
  blockConfirmed: false,
  lockEth: vi.fn(),
  generateProof: vi.fn(),
  submitProof: vi.fn(),
  createAuction: vi.fn(),
  cancelAndUnlock: vi.fn(),
  reset: vi.fn(),
};

function renderSellFlow(account: string | null = ACCOUNT) {
  return render(
    <WalletContext.Provider value={{ account, connect: vi.fn() }}>
      <BalancesProvider>
        <SellFlow />
      </BalancesProvider>
    </WalletContext.Provider>,
  );
}

describe("SellFlow step rendering", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.mocked(useSellFlow).mockReturnValue({ ...BASE_FLOW, step: "lock" });
  });

  it("shows Step1Connect when no account is connected", () => {
    vi.mocked(useSellFlow).mockReturnValue({ ...BASE_FLOW, step: "connect" });
    renderSellFlow(null);
    expect(screen.getAllByText(/Connect/i).length).toBeGreaterThan(0);
  });

  it("shows Step2Lock at lock step", () => {
    vi.mocked(useSellFlow).mockReturnValue({ ...BASE_FLOW, step: "lock" });
    renderSellFlow();
    // Step2Lock has an "Approve & Lock" button
    expect(screen.getByText(/Approve & Lock/i)).toBeTruthy();
  });

  it("Step2Lock disables the lock below the minimum seller lock", () => {
    vi.mocked(useSellFlow).mockReturnValue({
      ...BASE_FLOW,
      step: "lock",
      minSellerLockAmount: 10_000_000_000_000_000n,
    });
    renderSellFlow();
    expect(screen.getByTestId("min-seller-lock").textContent).toContain("0.01");
    const button = screen.getByTestId(
      "approve-lock-button",
    ) as HTMLButtonElement;
    fireEvent.change(screen.getByTestId("lock-amount-input"), {
      target: { value: "0.009" },
    });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(BASE_FLOW.lockEth).not.toHaveBeenCalled();
    fireEvent.change(screen.getByTestId("lock-amount-input"), {
      target: { value: "0.01" },
    });
    expect(button.disabled).toBe(false);
  });

  it("shows Step3Confirm at confirming step", () => {
    vi.mocked(useSellFlow).mockReturnValue({
      ...BASE_FLOW,
      step: "confirming",
      txHash: "0xdeadbeef",
      lockBlock: 42,
    });
    renderSellFlow();
    expect(screen.getByText(/Waiting for/i)).toBeTruthy();
  });

  it("shows Step4Proof at generating-proof step", () => {
    vi.mocked(useSellFlow).mockReturnValue({
      ...BASE_FLOW,
      step: "generating-proof",
    });
    renderSellFlow();
    expect(screen.getAllByText(/proof/i).length).toBeGreaterThan(0);
  });

  it("shows Step5Submit at submitting-proof step", () => {
    vi.mocked(useSellFlow).mockReturnValue({
      ...BASE_FLOW,
      step: "submitting-proof",
    });
    renderSellFlow();
    expect(screen.getAllByText(/proof/i).length).toBeGreaterThan(0);
  });

  it("shows Step7Auction at creating-auction step", () => {
    vi.mocked(useSellFlow).mockReturnValue({
      ...BASE_FLOW,
      step: "creating-auction",
      amount: 1_000_000_000_000_000_000n,
    });
    renderSellFlow();
    expect(screen.getByText(/Creating auction for/i)).toBeTruthy();
  });

  it("shows Step8Monitor at monitoring step", () => {
    vi.mocked(useSellFlow).mockReturnValue({
      ...BASE_FLOW,
      step: "monitoring",
      amount: 1_000_000_000_000_000_000n,
      auctionEndTime: Math.floor(Date.now() / 1000) + 3600,
    });
    renderSellFlow();
    // Step8Monitor shows the locked amount and no reserve price
    expect(screen.getByText(/Locked amount/i)).toBeTruthy();
    expect(screen.queryByText(/Min price/i)).toBeNull();
  });

  it("shows Reset button at non-connect, non-lock steps", () => {
    vi.mocked(useSellFlow).mockReturnValue({
      ...BASE_FLOW,
      step: "monitoring",
    });
    renderSellFlow();
    expect(screen.getByText(/Reset/i)).toBeTruthy();
  });

  it("renders StepIndicator when account is connected", () => {
    vi.mocked(useSellFlow).mockReturnValue({ ...BASE_FLOW, step: "lock" });
    renderSellFlow();
    // StepIndicator shows step labels
    expect(screen.getByText("Lock")).toBeTruthy();
    expect(screen.getByText("Auction")).toBeTruthy();
  });

  it("does not show StepIndicator when no account", () => {
    vi.mocked(useSellFlow).mockReturnValue({ ...BASE_FLOW, step: "connect" });
    renderSellFlow(null);
    // "Auction" label appears in step indicator — should not be present without account
    expect(screen.queryByText("Auction")).toBeFalsy();
  });

  it("the monitoring step passes windowId and pairBcs, so the settle and release steps render", () => {
    vi.mocked(useSellFlow).mockReturnValue({
      ...BASE_FLOW,
      step: "monitoring",
      amount: 1_000_000_000_000_000_000n,
      windowId: 4242n,
      // The window closed: the trade steps follow.
      auctionEndTime: Math.floor(Date.now() / 1000) - 10,
    });
    renderSellFlow();
    const steps = ["stub-open", "stub-settle", "stub-release"].map((id) =>
      screen.getByTestId(id),
    );
    for (const step of steps) {
      expect(step.getAttribute("data-window")).toBe("4242");
      // LAUNCH_PAIR_BCS is 34 bytes.
      expect(step.getAttribute("data-pair")).toBe(
        String(LAUNCH_PAIR_BCS.length),
      );
    }
    // Open, then settle, then release.
    expect(
      steps[0].compareDocumentPosition(steps[1]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      steps[1].compareDocumentPosition(steps[2]) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
