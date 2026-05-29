/**
 * Unit tests for Faucet component.
 *
 * Verifies that:
 *   1. Mint ETH and mint APT buttons are rendered.
 *   2. Clicking the Ethereum token button calls requestEthTokens mock.
 *   3. Balance update indicator appears after mock resolves.
 *
 * Mocks SDK faucet functions and context hooks to avoid live chain calls.
 *
 * @see docs/specifications/web-architecture.md
 * @see #135 — Web component unit tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { WalletContext } from "../../src/context/WalletContext";

vi.mock("@atomica/aptos-docker-testnet/browser", () => ({
  requestAPT: vi.fn().mockResolvedValue({ hash: "0xapt123" }),
}));

vi.mock("@atomica/sdk/ethereum", () => ({
  requestEthTokens: vi.fn().mockResolvedValue({
    ethTxHash: "0xeth456",
    usdTxHash: "0xusd789",
  }),
}));

const mockRefresh = vi.fn().mockResolvedValue(undefined);

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
      apt: 0,
      aptAccountExists: true,
      aptosContractsDeployed: true,
      loading: false,
      refetch: vi.fn(),
    },
    refresh: mockRefresh,
  }),
}));

vi.mock("../../src/context/ContractStatusContext", () => ({
  useContractStatus: () => ({
    evmAlive: true,
    aptosAlive: true,
    evmStatus: "ready",
    aptosStatus: "ready",
  }),
}));

import { Faucet } from "../../src/components/Faucet";
import { requestAPT } from "@atomica/aptos-docker-testnet/browser";
import { requestEthTokens } from "@atomica/sdk/ethereum";
import { useContractStatus } from "../../src/context/ContractStatusContext";

const ACCOUNT = "0xAbCd1234567890123456789012345678901234Ab";

function renderFaucet(account: string | null = ACCOUNT) {
  return render(
    <WalletContext.Provider value={{ account, connect: vi.fn() }}>
      <Faucet />
    </WalletContext.Provider>,
  );
}

describe("Faucet — unit", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default mock return value after clearAllMocks
    vi.mocked(requestEthTokens).mockResolvedValue({
      ethTxHash: "0xeth456",
      usdTxHash: "0xusd789",
    });
    vi.mocked(requestAPT).mockResolvedValue({ hash: "0xapt123" });
    vi.mocked(mockRefresh).mockResolvedValue(undefined);
  });

  it("renders Request APT and Request ETH Tokens buttons", () => {
    renderFaucet();

    expect(screen.getByRole("button", { name: /Request APT/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Request ETH Tokens/i })).toBeTruthy();
  });

  it("clicking Request ETH Tokens calls requestEthTokens mock", async () => {
    renderFaucet();

    const button = screen.getByTestId("faucet-eth-button");
    fireEvent.click(button);

    await waitFor(() => {
      expect(requestEthTokens).toHaveBeenCalledWith(ACCOUNT);
    });
  });

  it("shows success balance update after requestEthTokens resolves", async () => {
    renderFaucet();

    const button = screen.getByTestId("faucet-eth-button");
    fireEvent.click(button);

    await waitFor(() => {
      const status = screen.getByTestId("faucet-status");
      expect(status.textContent).toContain("FakeETH");
    });
  });

  it("clicking Request APT calls requestAPT mock", async () => {
    renderFaucet();

    const button = screen.getByRole("button", { name: /Request APT/i });
    fireEvent.click(button);

    await waitFor(() => {
      expect(requestAPT).toHaveBeenCalledWith(ACCOUNT);
    });
  });

  it("does not call requestEthTokens when account is null", async () => {
    renderFaucet(null);

    const button = screen.getByTestId("faucet-eth-button");
    fireEvent.click(button);

    await new Promise((r) => setTimeout(r, 50));
    expect(requestEthTokens).not.toHaveBeenCalled();
  });
});
