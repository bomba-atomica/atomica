import { describe, it, expect } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import App, { AppShell } from "../src/App";
import { devProxy } from "../src/dev-proxy";
import {
  AppStateProvider,
  BalancesProvider,
  ContractStatusProvider,
  WalletContext,
} from "@atomica/atomica-web-components";

describe("App Component Test", () => {
  it("should render App component", () => {
    render(<App />);
    // App should render the header
    expect(screen.getByText("Atomica Auction")).toBeDefined();
  });

  it("the rendered app contains the sell flow, the bidder, the open step, the settle action and the release action when a wallet is connected", async () => {
    render(
      <AppStateProvider>
        <WalletContext.Provider
          value={{
            account: "0x1234567890123456789012345678901234567890",
            connect: async () => {},
          }}
        >
          <ContractStatusProvider>
            <BalancesProvider>
              <AppShell />
            </BalancesProvider>
          </ContractStatusProvider>
        </WalletContext.Provider>
      </AppStateProvider>,
    );
    // The sell flow (its header) and the bidder.
    expect(screen.getByRole("heading", { name: "Sell" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Buy" })).toBeDefined();
    expect(screen.getByTestId("step-indicator-bid")).toBeDefined();
    // Open, settle and release, in that order, for one window.
    await waitFor(() => {
      expect(screen.getByTestId("trade-panel")).toBeDefined();
    });
    const panel = within(screen.getByTestId("trade-panel"));
    const open = panel.getByTestId("start-polling-button");
    const settle = panel.getByTestId("settle-button");
    const release = panel.getByTestId("release-button");
    expect(
      open.compareDocumentPosition(settle) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      settle.compareDocumentPosition(release) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("the vite dev proxy table has the /aptos-api and /eth-api keys", () => {
    const table = devProxy("http://10.0.0.2:8080/v1");
    expect(Object.keys(table)).toEqual([
      "/aptos-api-1",
      "/aptos-api",
      "/eth-api",
    ]);
    expect(table["/aptos-api"].rewrite("/aptos-api/v1/blocks")).toBe(
      "/v1/blocks",
    );
    expect(table["/eth-api"].rewrite("/eth-api")).toBe("/");
    expect(table["/aptos-api-1"].target).toBe("http://10.0.0.2:8080");
    // Without extra endpoints only the two API paths remain.
    expect(Object.keys(devProxy(undefined))).toEqual([
      "/aptos-api",
      "/eth-api",
    ]);
  });
});
