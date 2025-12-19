import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { AccountStatus } from "../../src/components/AccountStatus";
import { commands } from "vitest/browser";
import { MockWallet } from "../browser-utils/MockWallet";
import { useTokenBalances } from "../../src/hooks/useTokenBalances";

import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { setAptosInstance } from "../../src/lib/aptos";

describe.sequential("AccountStatus Integration", () => {
  const TEST_PK =
    "0x52a0d787625121df4e45d1d6a36f71dce7466710404f22ae3f21156828551717";
  const mockWallet = new MockWallet(TEST_PK);

  beforeAll(async () => {
    console.log("Starting Localnet...");
    // Use browser command shortcuts
    await commands.setupLocalnet();
    await commands.deployContracts();

    // Configure Aptos SDK to use Localnet
    const config = new AptosConfig({
      network: Network.LOCAL,
      fullnode: "http://127.0.0.1:8080/v1",
      faucet: "http://127.0.0.1:8081",
    });
    setAptosInstance(new Aptos(config));
  }, 120000);

  // Clean up after each test to prevent component interference
  afterEach(() => {
    cleanup();
  });

  // Note: No afterAll teardown - globalSetup handles lifecycle

  describe.sequential("Without funded account", () => {
    it("should show 'account not found' warning when account doesn't exist", async () => {
      // Wrapper component that uses the hook
      function TestWrapper() {
        const balances = useTokenBalances(mockWallet.address);
        return (
          <AccountStatus ethAddress={mockWallet.address} balances={balances} />
        );
      }

      render(<TestWrapper />);

      // Wait for the component to finish loading and show the "account not found" warning
      await waitFor(
        () => {
          screen.getByText(/Account not found on chain/);
        },
        { timeout: 10000 },
      );

      console.log("✓ Test passed: Component shows 'account not found' warning");
    }, 15000);
  });

  describe.sequential("With funded account", () => {
    it("should show warning initially, then display balance after funding", async () => {
      // Wrapper component that uses the hook
      function TestWrapper() {
        const balances = useTokenBalances(mockWallet.address);
        return (
          <AccountStatus ethAddress={mockWallet.address} balances={balances} />
        );
      }

      render(<TestWrapper />);

      // Step 1: Initially, account should show "not found" warning
      await waitFor(
        () => {
          screen.getByText(/Account not found on chain/);
        },
        { timeout: 10000 },
      );

      console.log("✓ Initial state: Account not found warning displayed");

      // Step 2: Fund the account via faucet
      const { getDerivedAddress } = await import("../../src/lib/aptos");
      const derivedAddr = await getDerivedAddress(mockWallet.address.toLowerCase());
      const fundedAddress = derivedAddr.toString();

      console.log(`Funding account: ${fundedAddress}`);
      const FUND_AMOUNT = 1_000_000_000; // 10 APT
      await commands.fundAccount(fundedAddress, FUND_AMOUNT);

      console.log("✓ Account funded via faucet");

      // Step 3: Wait for the hook to poll and update the balance
      // The hook polls every 5 seconds, so we need to wait for it to detect the change
      // APT is divided by 100_000_000 and fixed to 4 decimals.
      // 1000000000 / 100000000 = 10.0000
      await waitFor(
        () => {
          screen.getByText("APT:");
          screen.getByText("10.0000");
        },
        { timeout: 15000, interval: 500 },
      );

      console.log("✓ Balance displayed after funding");

      // Step 4: Verify the warning is gone
      expect(screen.queryByText(/Account not found on chain/)).toBeNull();

      console.log("✓ Test passed: Warning removed after funding");
    }, 60000);
  });
});
