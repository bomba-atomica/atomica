import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import {
  AccountStatus,
  useTokenBalances,
  NetworkConfigProvider,
  WalletContext,
  ContractStatusProvider,
  BalancesProvider,
} from "../src/index";
import { commands } from "vitest/browser";
import { MockWallet } from "@atomica/aptos-docker-testnet/browser-utils/MockWallet";
import { setAptosInstance, Aptos, AptosConfig, Network } from "@atomica/aptos-docker-testnet/browser";

describe.sequential("AccountStatus Integration", () => {
  const TEST_PK = APTOS_DEPLOYER_PRIVATE_KEY;
  const mockWallet = new MockWallet(TEST_PK);

  // Wrap AccountStatus with all required providers, injecting a fixed account
  // via WalletContext.Provider so BalancesProvider polls the right address.
  function WrappedAccountStatus() {
    return (
      <NetworkConfigProvider>
        <WalletContext.Provider
          value={{ account: mockWallet.address, connect: async () => {} }}
        >
          <ContractStatusProvider>
            <BalancesProvider>
              <AccountStatus />
            </BalancesProvider>
          </ContractStatusProvider>
        </WalletContext.Provider>
      </NetworkConfigProvider>
    );
  }

  beforeAll(async () => {
    console.log("Starting Localnet...");
    await commands.setupLocalnet();
    await commands.deployContracts();

    // Configure Aptos SDK to use Localnet
    const config = new AptosConfig({
      network: Network.LOCAL,
      fullnode: "http://127.0.0.1:8080/v1",
    });
    setAptosInstance(new Aptos(config));
  }, 120000);

  afterEach(() => {
    cleanup();
  });

  describe.sequential("Without funded account", () => {
    it("should show 'account not found' warning when account doesn't exist", async () => {
      render(<WrappedAccountStatus />);

      await waitFor(
        () => {
          screen.getByText(/Account not yet on chain/);
        },
        { timeout: 10000 },
      );

      console.log("✓ Test passed: Component shows 'account not found' warning");
    }, 15000);
  });

  describe.sequential("With funded account", () => {
    it("should show warning initially, then display balance after funding", async () => {
      render(<WrappedAccountStatus />);

      // Step 1: Initially, account should show "not found" warning
      await waitFor(
        () => {
          screen.getByText(/Account not yet on chain/);
        },
        { timeout: 10000 },
      );

      console.log("✓ Initial state: Account not found warning displayed");

      // Step 2: Fund the account via faucet
      const { getDerivedAddress } = await import("@atomica/aptos-docker-testnet/browser");
      const derivedAddr = await getDerivedAddress(
        mockWallet.address.toLowerCase(),
      );
      const fundedAddress = derivedAddr.toString();

      console.log(`Funding account: ${fundedAddress}`);
      const FUND_AMOUNT = 1_000_000_000; // 10 APT
      await commands.fundAccount(fundedAddress, FUND_AMOUNT);

      console.log("✓ Account funded via faucet");

      // Step 3: Wait for the hook to poll and update the balance
      await waitFor(
        () => {
          screen.getByText("APT");
          screen.getByText("10.0000");
        },
        { timeout: 30000, interval: 500 },
      );

      console.log("✓ Balance displayed after funding");

      // Step 4: Verify the warning is gone
      expect(screen.queryByText(/Atomica account not found/)).toBeNull();

      console.log("✓ Test passed: Warning removed after funding");
    }, 90000);
  });
});
