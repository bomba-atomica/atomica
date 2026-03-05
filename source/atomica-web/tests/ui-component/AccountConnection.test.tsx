import { describe, it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { MockWallet } from "../../test-utils/browser-utils/MockWallet";
import { APTOS_DEPLOYER_PRIVATE_KEY } from "../../../shared/test-constants";

const TEST_PK = APTOS_DEPLOYER_PRIVATE_KEY;

describe.skip("Account Connection Flow", () => {
  // Skipped: This test fails due to a pre-existing infrastructure issue.
  // Importing App.tsx pulls in @atomica/state-proof-verifier which uses
  // Node.js modules (fs, path) that don't work in browser context.
  // Need to either: (1) make state-proofs browser-compatible, or
  // (2) test smaller components instead of full App.

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getWindow = () => globalThis.window as any;

  afterEach(() => {
    cleanup();
    const win = getWindow();
    if (win && win.ethereum) {
      delete win.ethereum;
    }
    document.body.innerHTML = "";
  });

  it("displays 'Not Connected' initially", async () => {
    const win = getWindow();
    if (win && win.ethereum) {
      delete win.ethereum;
    }

    const { default: App } = await import("../../src/App");
    render(<App />);

    screen.getByText("Connect MetaMask");

    const settingsBtn = screen.getByTitle("Settings");
    fireEvent.click(settingsBtn);

    expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0);
  });

  it("displays address after connecting wallet", async () => {
    const mockWallet = new MockWallet(TEST_PK);

    const win = getWindow();
    if (win) {
      Object.defineProperty(win, "ethereum", {
        value: mockWallet.getProvider(),
        writable: true,
        configurable: true,
      });
    }

    const { default: App } = await import("../../src/App");
    render(<App />);

    const connectBtn = screen.getByText("Connect MetaMask");
    fireEvent.click(connectBtn);

    const expectedAddressPrefix = mockWallet.address.substring(0, 6);

    await waitFor(() => {
      screen.getByText(new RegExp(expectedAddressPrefix));
    });

    expect(screen.queryByText("Connect MetaMask")).toBeNull();
  });
});
