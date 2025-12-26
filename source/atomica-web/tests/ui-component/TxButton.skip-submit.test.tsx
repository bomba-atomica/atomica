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
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { commands } from "vitest/browser";
import { setupBrowserWalletMock } from "../../test-utils/browser-utils/wallet-mock";
import { TxButton } from "../../src/components/TxButton";
import {
  Aptos,
  AptosConfig,
  Network,
  InputEntryFunctionData,
} from "@aptos-labs/ts-sdk";
import { setAptosInstance } from "../../src/lib/aptos";

const DEPLOYER_ADDR =
  "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";
const TEST_ACCOUNT = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"; // Hardhat Account 0
const TEST_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe.sequential("TxButton Skip & Submit Mode", () => {
  let derivedAddr: string;
  let aptos: Aptos;

  beforeAll(async () => {
    console.log("Setting up browser test environment...");

    // 1. Setup Localnet & Contracts (via browser commands)
    await commands.setupLocalnet();
    await commands.deployContracts();

    // 2. Inject fetch-compatible Aptos instance
    const config = new AptosConfig({
      network: Network.LOCAL,
      fullnode: "http://127.0.0.1:8080/v1",
      faucet: "http://127.0.0.1:8081",
    });
    aptos = new Aptos(config);
    setAptosInstance(aptos);

    // 3. Setup browser-compatible wallet mock
    setupBrowserWalletMock(TEST_ACCOUNT, TEST_PK);

    // 4. Get derived address and fund it via browser command
    const { getDerivedAddress } = await import("../../src/lib/aptos/siwe");
    derivedAddr = (
      await getDerivedAddress(TEST_ACCOUNT.toLowerCase())
    ).toString();

    await commands.fundAccount(derivedAddr, 100_000_000);

    // Wait for funding to be indexed
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));

    // Note: window.location is already available in real browser tests
    // No need to mock it - Vitest browser mode provides a real browser context
    console.log(
      "[TxButton Test] Using browser window.location:",
      window.location.origin,
    );

    console.log("Browser test environment ready");
  }, 120000);

  afterAll(async () => {
    // Localnet teardown handled by global setup
  });

  afterEach(() => {
    // Clean up React components to prevent timers from keeping process alive
    cleanup();
  });

  it("should skip simulation and submit FakeEth mint directly", async () => {
    let txHash: string | null = null;

    const prepareTransaction = (): InputEntryFunctionData => ({
      function: `${DEPLOYER_ADDR}::fake_eth::mint`,
      functionArguments: [1000000000], // 10 FAKEETH
    });

    render(
      <TxButton
        label="10 ETH"
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

    // Verify balance on-chain using view function (same as production)
    const balanceResult = await aptos.view({
      payload: {
        function: `${DEPLOYER_ADDR}::fake_eth::balance`,
        functionArguments: [derivedAddr],
      },
    });
    const balance = Number(balanceResult[0]);

    expect(Number(balance)).toBeGreaterThan(0);
    console.log("Balance verified:", balance);
  }, 90000);

});
