/**
 * UI component tests for SellFlow step rendering.
 *
 * Verifies that the correct step panel is displayed for each flow state.
 * Uses vi.mock to control useSellFlow output and avoid blockchain calls.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
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

// Mock useSellFlow so we can control the displayed step.
vi.mock("../../src/hooks/useSellFlow");

import { useSellFlow } from "../../src/hooks/useSellFlow";
import { SellFlow } from "../../src/components/SellFlow/SellFlow";
import { BalancesProvider } from "../../src/context/BalancesContext";

const ACCOUNT = "0x1234567890123456789012345678901234567890";

const BASE_FLOW = {
  loading: false,
  blockConfirmed: false,
  lockEth: vi.fn(),
  generateProof: vi.fn(),
  submitProof: vi.fn(),
  mintFakeEth: vi.fn(),
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
    expect(screen.getByText(/Connect/i)).toBeTruthy();
  });

  it("shows Step2Lock at lock step", () => {
    vi.mocked(useSellFlow).mockReturnValue({ ...BASE_FLOW, step: "lock" });
    renderSellFlow();
    // Step2Lock has an "Approve & Lock" button
    expect(screen.getByText(/Approve & Lock/i)).toBeTruthy();
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
    expect(screen.getByText(/proof/i)).toBeTruthy();
  });

  it("shows Step5Submit at submitting-proof step", () => {
    vi.mocked(useSellFlow).mockReturnValue({
      ...BASE_FLOW,
      step: "submitting-proof",
    });
    renderSellFlow();
    expect(screen.getByText(/proof/i)).toBeTruthy();
  });

  it("shows Step6Mint at minting step", () => {
    vi.mocked(useSellFlow).mockReturnValue({
      ...BASE_FLOW,
      step: "minting",
      amount: 1_000_000_000_000_000_000n,
    });
    renderSellFlow();
    expect(screen.getByText(/mint/i)).toBeTruthy();
  });

  it("shows Step7Auction at creating-auction step", () => {
    vi.mocked(useSellFlow).mockReturnValue({
      ...BASE_FLOW,
      step: "creating-auction",
      amount: 1_000_000_000_000_000_000n,
      minPrice: 2_000_000_000n,
    });
    renderSellFlow();
    expect(screen.getByText(/auction/i)).toBeTruthy();
  });

  it("shows Step8Monitor at monitoring step", () => {
    vi.mocked(useSellFlow).mockReturnValue({
      ...BASE_FLOW,
      step: "monitoring",
      amount: 1_000_000_000_000_000_000n,
      minPrice: 2_000_000_000n,
      auctionEndTime: Math.floor(Date.now() / 1000) + 3600,
    });
    renderSellFlow();
    // Step8Monitor shows locked amount and min price
    expect(screen.getByText(/Locked amount/i)).toBeTruthy();
    expect(screen.getByText(/Min price/i)).toBeTruthy();
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
    expect(screen.getByText("Mint")).toBeTruthy();
  });

  it("does not show StepIndicator when no account", () => {
    vi.mocked(useSellFlow).mockReturnValue({ ...BASE_FLOW, step: "connect" });
    renderSellFlow(null);
    // "Lock" label appears in step indicator — should not be present without account
    expect(screen.queryByText("Mint")).toBeFalsy();
  });
});
