/**
 * Unit tests for SanityTest component.
 *
 * Verifies that:
 *   1. The signature test UI renders correctly.
 *   2. Clicking the Run Check button triggers testSimpleAPTTransfer mock.
 *   3. A pass result is shown on success.
 *   4. A fail result is shown on error.
 *
 * Mocks @atomica/aptos-docker-testnet/browser and context providers.
 *
 * @see docs/specifications/web-architecture.md
 * @see #135 — Web component unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { WalletContext } from "../../src/context/WalletContext";

// vi.mock factories are hoisted — use vi.fn() inline, not outer variables.
vi.mock("@atomica/aptos-docker-testnet/browser", () => ({
  testSimpleAPTTransfer: vi.fn().mockResolvedValue({
    success: true,
    hash: "0xabc123def",
  }),
}));

vi.mock("../../src/context/BalancesContext", () => ({
  useBalances: () => ({
    ethBalances: {
      ethAccountExists: true,
      ethBalance: 0n,
      ethFakeETH: 0n,
      ethFakeUSD: 0n,
      ethContractsDeployed: true,
      loading: false,
      refetch: vi.fn(),
    },
    aptosBalances: {
      apt: 1000000,
      aptAccountExists: true,
      aptosContractsDeployed: true,
      loading: false,
      refetch: vi.fn(),
    },
    refresh: vi.fn(),
  }),
}));

import { SanityTest } from "../../src/components/SanityTest";
import { testSimpleAPTTransfer } from "@atomica/aptos-docker-testnet/browser";

const ACCOUNT = "0xAbCd1234567890123456789012345678901234Ab";

function renderSanityTest(account: string | null = ACCOUNT) {
  return render(
    <WalletContext.Provider value={{ account, connect: vi.fn() }}>
      <SanityTest />
    </WalletContext.Provider>,
  );
}

describe("SanityTest — unit", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(testSimpleAPTTransfer).mockResolvedValue({
      success: true,
      hash: "0xabc123def",
    });
  });

  it("renders the SIWE compatibility check description", () => {
    renderSanityTest();
    expect(screen.getByText(/Check Wallet SIWE Compatibility/i)).toBeTruthy();
  });

  it("renders the Run Check button", () => {
    renderSanityTest();
    const button = screen.getByRole("button", { name: /Run Check/i });
    expect(button).toBeTruthy();
  });

  it("renders the target address input field", () => {
    renderSanityTest();
    const input = screen.getByPlaceholderText("0x...");
    expect(input).toBeTruthy();
  });

  it("calls testSimpleAPTTransfer when Run Check is clicked with a funded account", async () => {
    renderSanityTest();

    const button = screen.getByRole("button", { name: /Run Check/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(testSimpleAPTTransfer).toHaveBeenCalledWith(
        ACCOUNT,
        expect.stringMatching(/^0x[0-9a-f]{64}$/i),
      );
    });
  });

  it("shows Verification Passed result on successful transfer", async () => {
    renderSanityTest();

    const button = screen.getByRole("button", { name: /Run Check/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Verification Passed/i)).toBeTruthy();
    });
  });

  it("shows Verification Failed result on error", async () => {
    vi.mocked(testSimpleAPTTransfer).mockResolvedValueOnce({
      success: false,
      error: "Signature mismatch",
    });

    renderSanityTest();

    const button = screen.getByRole("button", { name: /Run Check/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText(/Verification Failed/i)).toBeTruthy();
    });
  });

  it("shows connect wallet hint when no account is provided", () => {
    renderSanityTest(null);
    expect(screen.getByText(/Connect your wallet/i)).toBeTruthy();
  });
});
