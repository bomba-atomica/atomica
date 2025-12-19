import { describe, it, expect, beforeAll, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import { commands } from "vitest/browser";
import { setupBrowserWalletMock } from "../browser-utils/wallet-mock";
import { getDerivedAddress } from "../../src/lib/aptos/siwe";
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

describe.sequential("TxButton Simulate then Submit Mode", () => {
  let derivedAddr: string;
  let aptos: Aptos;

  beforeAll(async () => {
    console.log("Starting Localnet...");
    // Use browser command shortcuts
    await commands.setupLocalnet();
    await commands.deployContracts();

    // Inject fetch-compatible Aptos instance
    const config = new AptosConfig({
      network: Network.LOCAL,
      fullnode: "http://127.0.0.1:8080/v1",
      faucet: "http://127.0.0.1:8081",
    });
    aptos = new Aptos(config);
    setAptosInstance(aptos);

    // Setup browser wallet mock (replaces eth-testing)
    setupBrowserWalletMock(TEST_ACCOUNT, TEST_PK);

    // Fund account
    derivedAddr = (
      await getDerivedAddress(TEST_ACCOUNT.toLowerCase())
    ).toString();
    await commands.fundAccount(derivedAddr, 100_000_000);

    // Wait for funding
    await new Promise((r) => setTimeout(r, 2000));

    console.log("Test environment ready");
  }, 120000);

  // Note: No afterAll teardown - globalSetup handles lifecycle

  afterEach(() => {
    cleanup();
    // Re-setup mock if cleanup destroys window.ethereum (setupBrowserWalletMock handles window global)
    setupBrowserWalletMock(TEST_ACCOUNT, TEST_PK);
  });

  it("should simulate FakeEth mint transaction", async () => {
    const prepareTransaction = (): InputEntryFunctionData => ({
      function: `${DEPLOYER_ADDR}::fake_eth::mint`,
      functionArguments: [1000000000], // 10 FAKEETH
    });

    render(
      <TxButton
        label="10 ETH"
        accountAddress={TEST_ACCOUNT}
        prepareTransaction={prepareTransaction}
        onSuccess={() => {
          /* no-op */
        }}
      />,
    );

    // Initially shows "Simulate 10 ETH"
    const simulateBtn = screen.getByText("Simulate 10 ETH");
    expect(simulateBtn).toBeInTheDocument();

    // Click simulate
    fireEvent.click(simulateBtn);

    // Wait for simulation to complete
    await waitFor(
      () => {
        expect(screen.getByText("Submit 10 ETH")).toBeInTheDocument();
      },
      { timeout: 30000 },
    );

    // Verify gas estimation is shown
    expect(screen.getByText(/Gas:/)).toBeInTheDocument();

    console.log("Simulation completed successfully");
  }, 60000);

  it("should submit FakeEth mint after simulation", async () => {
    let txHash: string | null = null;

    const prepareTransaction = (): InputEntryFunctionData => ({
      function: `${DEPLOYER_ADDR}::fake_eth::mint`,
      functionArguments: [500000000], // 5 FAKEETH
    });

    render(
      <TxButton
        label="5 ETH"
        accountAddress={TEST_ACCOUNT}
        prepareTransaction={prepareTransaction}
        onSuccess={(hash) => {
          txHash = hash;
        }}
      />,
    );

    // Click simulate
    const simulateBtn = screen.getByText("Simulate 5 ETH");
    fireEvent.click(simulateBtn);

    // Wait for simulation
    await waitFor(
      () => {
        expect(screen.getByText("Submit 5 ETH")).toBeInTheDocument();
      },
      { timeout: 30000 },
    );

    // Click submit
    const submitBtn = screen.getByText("Submit 5 ETH");
    fireEvent.click(submitBtn);

    // Wait for success
    await waitFor(
      () => {
        expect(screen.getByText("Success!")).toBeInTheDocument();
      },
      { timeout: 30000 },
    );

    expect(txHash).toBeTruthy();
    console.log("Transaction submitted:", txHash);

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
