/**
 * Unit tests for NetworkConfigProvider — issue #136.
 *
 * Verifies that:
 *   - Children receive correct host from AppState (derived from aptosRpc)
 *   - Children receive correct host from stored fallback when aptosRpc is invalid
 *   - Updating network config re-renders children with new host value
 *   - setHost dispatches NETWORK_CONFIG_UPDATED and updates context
 *
 * Uses vi.mock to stub @atomica/sdk/aptos (setAptosInstance),
 * @atomica/sdk/network-host, @aptos-labs/ts-sdk so no network calls are made.
 *
 * @see source/atomica-web-components/src/network/network-config-context.tsx
 * @see docs/specifications/web-architecture.md
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, act } from "@testing-library/react";
import React, { useContext } from "react";
import { NetworkConfigProvider } from "../../../src/network/network-config-context";
import { NetworkConfigContext } from "../../../src/network/network-config-state";
import { AppStateProvider } from "../../../src/state/app-state";

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@atomica/sdk/aptos", () => ({
  setAptosInstance: vi.fn(),
  aptos: {},
  getDerivedAddress: vi.fn(),
  areCoreContractsDeployed: vi.fn().mockResolvedValue(false),
}));

vi.mock("@atomica/sdk/network-host", () => ({
  buildAptosFullnodeUrl: (host: string) => `http://${host}:8080/v1`,
  getStoredHost: () => "stored-host",
  setStoredHost: vi.fn(),
}));

vi.mock("@aptos-labs/ts-sdk", () => ({
  Aptos: class MockAptos {},
  AptosConfig: class MockAptosConfig {
    constructor(_opts: unknown) {}
  },
  Network: { LOCAL: "local" },
}));

// ─── Test harness ─────────────────────────────────────────────────────────────

function NetworkConfigReadout() {
  const { host, setHost } = useContext(NetworkConfigContext);
  return (
    <div>
      <span data-testid="host">{host}</span>
      <button
        data-testid="set-host-btn"
        onClick={() => setHost("custom-host")}
      />
    </div>
  );
}

function renderWithProviders() {
  return render(
    <AppStateProvider>
      <NetworkConfigProvider>
        <NetworkConfigReadout />
      </NetworkConfigProvider>
    </AppStateProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("NetworkConfigProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("children receive correct host derived from default aptosRpc", () => {
    renderWithProviders();
    // Default aptosRpc is "http://localhost:8080/v1" → hostname is "localhost"
    expect(screen.getByTestId("host").textContent).toBe("localhost");
  });

  it("children receive stored host fallback when aptosRpc URL is invalid", async () => {
    // Patch localStorage to store a config with an invalid aptosRpc
    localStorage.setItem(
      "atomica:app-config",
      JSON.stringify({
        version: 1,
        host: "localhost",
        ethereumRpc: "http://localhost:8545",
        aptosRpc: "not-a-valid-url",
        pollingInterval: 5000,
      }),
    );

    renderWithProviders();
    // When aptosRpc is invalid URL, fallback to getStoredHost() = "stored-host"
    expect(screen.getByTestId("host").textContent).toBe("stored-host");
  });

  it("updating setHost re-renders children with new host value", async () => {
    renderWithProviders();

    expect(screen.getByTestId("host").textContent).toBe("localhost");

    await act(async () => {
      screen.getByTestId("set-host-btn").click();
    });

    // After calling setHost("custom-host"), the provider dispatches
    // NETWORK_CONFIG_UPDATED → aptosRpc = "http://custom-host:8080/v1"
    // → host is derived as "custom-host"
    expect(screen.getByTestId("host").textContent).toBe("custom-host");
  });

  it("NetworkConfigProvider provides host and setHost via context", () => {
    renderWithProviders();
    // Confirm the context value renders
    expect(screen.getByTestId("host")).toBeTruthy();
    expect(screen.getByTestId("set-host-btn")).toBeTruthy();
  });
});
