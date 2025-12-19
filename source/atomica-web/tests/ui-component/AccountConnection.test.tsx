// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import App from "../../src/App";
import { MockWallet } from "../browser-utils/MockWallet";

// Random secp256k1 private key for testing
const TEST_PK =
  "0x52a0d787625121df4e45d1d6a36f71dce7466710404f22ae3f21156828551717";
const mockWallet = new MockWallet(TEST_PK);

describe("Account Connection Flow", () => {
  // Restore window.ethereum after tests
  const originalEthereum = window.ethereum;

  afterEach(() => {
    window.ethereum = originalEthereum;
    document.body.innerHTML = ""; // Clean up DOM
  });

  it("displays 'Not Connected' initially", () => {
    // Ensure no wallet is present initially
    delete (window as any).ethereum;

    render(<App />);

    // We look for "Not Connected" in the AccountStatus component
    expect(screen.getByText("Not Connected")).toBeInTheDocument();
    // And the Connect button
    expect(screen.getByText("Connect MetaMask")).toBeInTheDocument();
  });

  it("displays address after connecting wallet", async () => {
    // Inject Mock Wallet
    Object.defineProperty(window, "ethereum", {
      value: mockWallet.getProvider(),
      writable: true,
      configurable: true,
    });

    render(<App />);

    // Initally not connected
    expect(screen.getByText("Not Connected")).toBeInTheDocument();

    // Click Connect
    const connectBtn = screen.getByText("Connect MetaMask");
    fireEvent.click(connectBtn);

    // Wait for address to appear
    // The address display logic: {ethAddress.substring(0, 6)}...{ethAddress.substring(38)}
    // E.g. 0x44eb...8aa
    // Let's just Regex match the start of the address
    const expectedAddressPrefix = mockWallet.address.substring(0, 6);

    await waitFor(() => {
      expect(
        screen.getByText(new RegExp(expectedAddressPrefix)),
      ).toBeInTheDocument();
    });

    // "Not Connected" should now be gone from the status area,
    // though "Not Connected" string might appear elsehwere?
    // In AccountStatus logic: "Not Connected" is replaced by the address.
    // So checking the button is gone is good too.
    expect(screen.queryByText("Connect MetaMask")).not.toBeInTheDocument();
  });
});
