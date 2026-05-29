/**
 * Unit tests for BalancesProvider — issue #136.
 *
 * Verifies that:
 *   - Children receive the correct context value via useBalances()
 *   - Re-renders happen when balance mock updates
 *
 * Uses vi.mock to stub useEthereumBalances and useAptosBalances so
 * no network calls are made.
 *
 * @see source/atomica-web-components/src/context/BalancesContext.tsx
 * @see docs/specifications/web-architecture.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import React from "react";
import { BalancesProvider, useBalances } from "../../../src/context/BalancesContext";
import { WalletContext } from "../../../src/context/WalletContext";
import type { EthereumBalancesSnapshot } from "../../../src/hooks/useEthereumBalances";
import type { AptosBalancesSnapshot } from "../../../src/hooks/useAptosBalances";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUseEthereumBalances = vi.fn();
const mockUseAptosBalances = vi.fn();

vi.mock("../../../src/hooks/useEthereumBalances", () => ({
  useEthereumBalances: (...args: unknown[]) => mockUseEthereumBalances(...args),
}));

vi.mock("../../../src/hooks/useAptosBalances", () => ({
  useAptosBalances: (...args: unknown[]) => mockUseAptosBalances(...args),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const defaultEthBalances: EthereumBalancesSnapshot = {
  ethAccountExists: true,
  ethBalance: 1_000_000_000_000_000_000n,
  ethFakeETH: 500_000_000_000_000_000n,
  ethFakeUSD: 1_000_000n,
  ethContractsDeployed: true,
  loading: false,
  refetch: vi.fn().mockResolvedValue(undefined),
};

const defaultAptosBalances: AptosBalancesSnapshot = {
  apt: 100_000_000,
  aptAccountExists: true,
  aptosContractsDeployed: true,
  loading: false,
  refetch: vi.fn().mockResolvedValue(undefined),
};

// ─── Test harness ─────────────────────────────────────────────────────────────

function BalancesReadout() {
  const { ethBalances, aptosBalances } = useBalances();
  return (
    <div>
      <span data-testid="eth-loading">{String(ethBalances.loading)}</span>
      <span data-testid="eth-fake-eth">{String(ethBalances.ethFakeETH)}</span>
      <span data-testid="eth-fake-usd">{String(ethBalances.ethFakeUSD)}</span>
      <span data-testid="eth-contracts-deployed">
        {String(ethBalances.ethContractsDeployed)}
      </span>
      <span data-testid="aptos-apt">{String(aptosBalances.apt)}</span>
      <span data-testid="aptos-loading">{String(aptosBalances.loading)}</span>
    </div>
  );
}

function renderWithProviders(account: string | null = "0xdeadbeef") {
  return render(
    <WalletContext.Provider value={{ account, connect: vi.fn() }}>
      <BalancesProvider>
        <BalancesReadout />
      </BalancesProvider>
    </WalletContext.Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("BalancesProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseEthereumBalances.mockReturnValue(defaultEthBalances);
    mockUseAptosBalances.mockReturnValue(defaultAptosBalances);
  });

  afterEach(() => {
    cleanup();
  });

  it("children receive correct ethBalances context value via useBalances()", () => {
    renderWithProviders();
    expect(screen.getByTestId("eth-loading").textContent).toBe("false");
    expect(screen.getByTestId("eth-fake-eth").textContent).toBe(
      "500000000000000000",
    );
    expect(screen.getByTestId("eth-fake-usd").textContent).toBe("1000000");
    expect(screen.getByTestId("eth-contracts-deployed").textContent).toBe("true");
  });

  it("children receive correct aptosBalances context value via useBalances()", () => {
    renderWithProviders();
    expect(screen.getByTestId("aptos-apt").textContent).toBe("100000000");
    expect(screen.getByTestId("aptos-loading").textContent).toBe("false");
  });

  it("re-renders children when balance mock updates", async () => {
    const updatedEthBalances: EthereumBalancesSnapshot = {
      ...defaultEthBalances,
      ethFakeETH: 999_000_000_000_000_000n,
      ethFakeUSD: 2_000_000n,
    };

    // Start with default, then update
    mockUseEthereumBalances.mockReturnValue(defaultEthBalances);
    const { rerender } = renderWithProviders();
    expect(screen.getByTestId("eth-fake-eth").textContent).toBe(
      "500000000000000000",
    );

    // Re-render with updated balances
    mockUseEthereumBalances.mockReturnValue(updatedEthBalances);
    await act(async () => {
      rerender(
        <WalletContext.Provider value={{ account: "0xdeadbeef", connect: vi.fn() }}>
          <BalancesProvider>
            <BalancesReadout />
          </BalancesProvider>
        </WalletContext.Provider>,
      );
    });

    expect(screen.getByTestId("eth-fake-eth").textContent).toBe(
      "999000000000000000",
    );
    expect(screen.getByTestId("eth-fake-usd").textContent).toBe("2000000");
  });

  it("provides loading: true defaults when no balances are available", () => {
    const loadingEth: EthereumBalancesSnapshot = {
      ethAccountExists: false,
      ethBalance: 0n,
      ethFakeETH: 0n,
      ethFakeUSD: 0n,
      ethContractsDeployed: false,
      loading: true,
      refetch: vi.fn().mockResolvedValue(undefined),
    };
    const loadingAptos: AptosBalancesSnapshot = {
      apt: 0,
      aptAccountExists: false,
      aptosContractsDeployed: false,
      loading: true,
      refetch: vi.fn().mockResolvedValue(undefined),
    };
    mockUseEthereumBalances.mockReturnValue(loadingEth);
    mockUseAptosBalances.mockReturnValue(loadingAptos);

    renderWithProviders();
    expect(screen.getByTestId("eth-loading").textContent).toBe("true");
    expect(screen.getByTestId("aptos-loading").textContent).toBe("true");
  });
});
