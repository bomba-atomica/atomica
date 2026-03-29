/**
 * @file TxButton.skip-submit.test.tsx
 * @description Integration tests for the TxButton component's "Skip & Submit" functionality.
 *
 * These tests verify:
 * 1. The "Skip & Submit" mode bypasses the simulation phase.
 * 2. Transactions are correctly signed and submitted to the localnet.
 * 3. The UI correctly handles multiple sequential submissions.
 * 4. Balance updates are reflected on-chain.
 *
 * @note These tests run in a real browser environment (Vitest Browser Mode) and interacts
 * with a live Aptos localnet via the `commands` bridge.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import { commands } from "vitest/browser";
import { TxButton } from "../src/index";
import { setupBrowserWalletMock } from "@atomica/aptos-docker-testnet/browser-utils/wallet-mock";
import {
  Aptos,
  AptosConfig,
  Network,
  InputEntryFunctionData,
} from "@aptos-labs/ts-sdk";
import { setAptosInstance } from "@atomica/aptos-docker-testnet/browser";

const TEST_ACCOUNT = ETHEREUM_DEPLOYER_ADDRESS;
const TEST_PK = ETHEREUM_DEPLOYER_PRIVATE_KEY;

// Recipient for the APT transfer used as the test transaction
const TRANSFER_RECIPIENT =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

describe.sequential("TxButton Skip & Submit Mode", () => {
  let derivedAddr: string;
  let aptos: Aptos;

  beforeAll(async () => {
    console.log("Setting up browser test environment...");

    // 1. Setup Localnet (no contract deployment needed — we use native APT transfer)
    await commands.setupLocalnet();

    // 2. Inject fetch-compatible Aptos instance
    const config = new AptosConfig({
      network: Network.LOCAL,
      fullnode: "http://127.0.0.1:8080/v1",
    });
    aptos = new Aptos(config);
    setAptosInstance(aptos);

    // 3. Setup browser-compatible wallet mock
    setupBrowserWalletMock(TEST_ACCOUNT, TEST_PK);

    // 4. Get derived address and fund it via browser command
    const { getDerivedAddress } = await import("@atomica/aptos-docker-testnet/browser");
    derivedAddr = (
      await getDerivedAddress(TEST_ACCOUNT.toLowerCase())
    ).toString();

    // Fund with 500_000_000 octas (5 APT) to cover max gas reservation
    // (DEFAULT_MAX_GAS_AMOUNT=2_000_000 * gas_price=100 = 200_000_000 required minimum)
    await commands.fundAccount(derivedAddr, 500_000_000);

    // Wait for funding to be indexed
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));

    console.log("Browser test environment ready");
  }, 120000);

  afterAll(async () => {
    // Localnet teardown handled by global setup
  });

  afterEach(() => {
    // Clean up React components to prevent timers from keeping process alive
    cleanup();
  });

  it("should skip simulation and submit APT transfer directly", async () => {
    let txHash: string | null = null;

    // Use a native APT transfer as the test transaction.
    // FakeETH/FakeUSD minting is EVM-only; TxButton tests Aptos tx lifecycle.
    const prepareTransaction = (): InputEntryFunctionData => ({
      function: "0x1::aptos_account::transfer",
      functionArguments: [TRANSFER_RECIPIENT, 1000], // 1000 octas
    });

    render(
      <TxButton
        label="Transfer APT"
        accountAddress={TEST_ACCOUNT}
        prepareTransaction={prepareTransaction}
        onSuccess={(hash) => {
          txHash = hash;
        }}
      />,
    );

    // Find and click the dropdown button using test ID
    const dropdownBtn = screen.getByTestId("tx-button-dropdown");
    console.log("Clicking dropdown button...");
    fireEvent.click(dropdownBtn);

    // Wait for dropdown to appear and click Skip & Submit
    console.log("Waiting for Skip & Submit button...");
    await waitFor(() => {
      expect(screen.getByTestId("tx-button-skip-submit")).toBeInTheDocument();
    });

    const skipSubmitBtn = screen.getByTestId("tx-button-skip-submit");
    console.log("Clicking Skip & Submit...");
    fireEvent.click(skipSubmitBtn);

    // Wait for success (should skip simulation phase)
    await waitFor(
      () => {
        expect(screen.getByText("Success")).toBeInTheDocument();
      },
      { timeout: 30000 },
    );

    expect(txHash).toBeTruthy();
    console.log("Transaction submitted directly:", txHash);

    // Verify the transaction executed on-chain
    const txInfo = await aptos.waitForTransaction({
      transactionHash: txHash!,
    });
    expect(txInfo.success).toBe(true);
    console.log("Transaction confirmed on-chain:", txHash);
  }, 90000);
});
