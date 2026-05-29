/**
 * Unit tests for ContractStatusProvider — issue #136.
 *
 * Verifies that:
 *   - Children receive evmStatus="ready" and aptosStatus="ready" when
 *     check functions report contracts deployed
 *   - Children receive evmStatus="missing" and aptosStatus="missing" when
 *     check functions report contracts not deployed
 *   - evmAlive and aptosAlive flags are propagated correctly
 *
 * Uses vi.mock to stub @atomica/sdk/contract-check so no network calls are made.
 *
 * @see source/atomica-web-components/src/context/ContractStatusContext.tsx
 * @see docs/specifications/web-architecture.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import React from "react";
import {
  ContractStatusProvider,
  useContractStatus,
} from "../../../src/context/ContractStatusContext";
import { NetworkConfigContext } from "../../../src/network/network-config-state";

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockCheckEthereumAlive = vi.fn();
const mockCheckAptosAlive = vi.fn();
const mockCheckEVMContracts = vi.fn();
const mockCheckAptosContracts = vi.fn();

vi.mock("@atomica/sdk/contract-check", () => ({
  checkEthereumAlive: () => mockCheckEthereumAlive(),
  checkAptosAlive: () => mockCheckAptosAlive(),
  checkEVMContracts: () => mockCheckEVMContracts(),
  checkAptosContracts: () => mockCheckAptosContracts(),
}));

// ─── Test harness ─────────────────────────────────────────────────────────────

function ContractStatusReadout() {
  const { evmAlive, aptosAlive, evmStatus, aptosStatus } = useContractStatus();
  return (
    <div>
      <span data-testid="evmAlive">{String(evmAlive)}</span>
      <span data-testid="aptosAlive">{String(aptosAlive)}</span>
      <span data-testid="evmStatus">{evmStatus}</span>
      <span data-testid="aptosStatus">{aptosStatus}</span>
    </div>
  );
}

function renderWithProviders() {
  return render(
    <NetworkConfigContext.Provider
      value={{ host: "localhost", setHost: vi.fn() }}
    >
      <ContractStatusProvider>
        <ContractStatusReadout />
      </ContractStatusProvider>
    </NetworkConfigContext.Provider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ContractStatusProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows loading status before check functions resolve", () => {
    // Make the checks never resolve during this test
    mockCheckEthereumAlive.mockReturnValue(new Promise(() => {}));
    mockCheckAptosAlive.mockReturnValue(new Promise(() => {}));

    renderWithProviders();
    expect(screen.getByTestId("evmStatus").textContent).toBe("loading");
    expect(screen.getByTestId("aptosStatus").textContent).toBe("loading");
  });

  it("children receive evmStatus=ready and aptosStatus=ready when mock returns deployed", async () => {
    mockCheckEthereumAlive.mockResolvedValue(true);
    mockCheckAptosAlive.mockResolvedValue(true);
    mockCheckEVMContracts.mockResolvedValue(true);
    mockCheckAptosContracts.mockResolvedValue(true);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId("evmStatus").textContent).toBe("ready");
    });

    expect(screen.getByTestId("aptosStatus").textContent).toBe("ready");
    expect(screen.getByTestId("evmAlive").textContent).toBe("true");
    expect(screen.getByTestId("aptosAlive").textContent).toBe("true");
  });

  it("children receive evmStatus=missing and aptosStatus=missing when mock returns not deployed", async () => {
    mockCheckEthereumAlive.mockResolvedValue(true);
    mockCheckAptosAlive.mockResolvedValue(true);
    mockCheckEVMContracts.mockResolvedValue(false);
    mockCheckAptosContracts.mockResolvedValue(false);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId("evmStatus").textContent).toBe("missing");
    });

    expect(screen.getByTestId("aptosStatus").textContent).toBe("missing");
    expect(screen.getByTestId("evmAlive").textContent).toBe("true");
    expect(screen.getByTestId("aptosAlive").textContent).toBe("true");
  });

  it("shows missing when chains are not alive", async () => {
    mockCheckEthereumAlive.mockResolvedValue(false);
    mockCheckAptosAlive.mockResolvedValue(false);

    renderWithProviders();

    await waitFor(() => {
      expect(screen.getByTestId("evmStatus").textContent).toBe("missing");
    });

    expect(screen.getByTestId("aptosStatus").textContent).toBe("missing");
    expect(screen.getByTestId("evmAlive").textContent).toBe("false");
    expect(screen.getByTestId("aptosAlive").textContent).toBe("false");
  });
});
