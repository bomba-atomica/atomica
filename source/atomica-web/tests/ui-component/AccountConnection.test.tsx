import { describe, it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import App from "../../src/App";
import { MockWallet } from "../../test-utils/browser-utils/MockWallet";
import { APTOS_DEPLOYER_PRIVATE_KEY } from "../../../shared/test-constants";

// Random secp256k1 private key for testing
const TEST_PK = APTOS_DEPLOYER_PRIVATE_KEY;
const mockWallet = new MockWallet(TEST_PK);

describe("Account Connection Flow", () => {
  // Restore window.ethereum after tests
  const originalEthereum = window.ethereum;

  afterEach(() => {
    cleanup(); // Clean up React components first
    window.ethereum = originalEthereum;
    document.body.innerHTML = ""; // Clean up DOM
  });

  it("displays 'Not Connected' initially", () => {
    // Ensure no wallet is present initially
    delete (window as any).ethereum;

    render(<App />);

    // The Connect button is always visible in the header
    screen.getByText("Connect MetaMask");

    // "Not Connected" is shown inside AccountStatus, which lives in the Settings view.
    // Navigate there to verify.
    // Navigate to Settings via the gear icon button (⚙ in the header)
    const settingsBtn = screen.getByTitle("Settings");
    fireEvent.click(settingsBtn);

    // Both Ethereum and Atomica cards show "Not connected" when no wallet is present
    expect(screen.getAllByText("Not connected").length).toBeGreaterThan(0);
  });

  it("displays address after connecting wallet", async () => {
    // Inject Mock Wallet
    Object.defineProperty(window, "ethereum", {
      value: mockWallet.getProvider(),
      writable: true,
      configurable: true,
    });

    render(<App />);

    // Header Connect button is visible on any view
    const connectBtn = screen.getByText("Connect MetaMask");
    fireEvent.click(connectBtn);

    // Wait for the compact address to appear in the header.
    // Format: {address.substring(0, 6)}...{address.substring(38)}  e.g. "0x44eb...8aa"
    const expectedAddressPrefix = mockWallet.address.substring(0, 6);

    await waitFor(() => {
      screen.getByText(new RegExp(expectedAddressPrefix));
    });

    // Connect button should be gone once connected
    expect(screen.queryByText("Connect MetaMask")).toBeNull();
  });
});
