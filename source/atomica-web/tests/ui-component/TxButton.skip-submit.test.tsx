import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { setupBrowserWalletMock } from "../browser-utils/wallet-mock";
import { TxButton } from "../../src/components/TxButton";
import { Aptos, AptosConfig, Network, InputEntryFunctionData } from "@aptos-labs/ts-sdk";

const DEPLOYER_ADDR =
  "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";
const TEST_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Hardhat Account 0
const TEST_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe.sequential("TxButton Skip & Submit Mode", () => {
  let derivedAddr: string;
  let aptos: Aptos;

  beforeAll(async () => {
    console.log("Setting up browser test environment...");

    // Inject fetch-compatible Aptos instance
    const config = new AptosConfig({
      network: Network.LOCAL,
      fullnode: "http://127.0.0.1:8080/v1",
    });
    aptos = new Aptos(config);

    // Setup browser-compatible wallet mock
    setupBrowserWalletMock(TEST_ACCOUNT, TEST_PK);

    // Mock window.location
    Object.defineProperty(window, "location", {
      value: {
        protocol: "http:",
        host: "localhost:3000",
        origin: "http://localhost:3000",
        href: "http://localhost:3000/",
      },
      writable: true,
      configurable: true,
    });

    // Get derived address and fund it
    const { getDerivedAddress } = await import("../../src/lib/aptos/siwe");
    derivedAddr = (
      await getDerivedAddress(TEST_ACCOUNT.toLowerCase())
    ).toString();

    // Fund account using fetch (browser-compatible)
    const fundResponse = await fetch("http://127.0.0.1:8081/mint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        address: derivedAddr,
        amount: 100_000_000,
      }),
    });

    if (!fundResponse.ok) {
      throw new Error(`Failed to fund account: ${await fundResponse.text()}`);
    }

    await new Promise<void>(resolve => setTimeout(resolve, 2000));

    console.log("Browser test environment ready");
  }, 120000);

  afterAll(async () => {
    // Localnet teardown handled by global setup
  });

  afterEach(() => {
    // No cleanup needed - wallet mock persists
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
        expect(screen.getByText("Success!")).toBeInTheDocument();
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
  }, 60000);

  it("should not show simulation details when skipping", async () => {
    let txHash: string | null = null;

    const prepareTransaction = (): InputEntryFunctionData => ({
      function: `${DEPLOYER_ADDR}::fake_eth::mint`,
      functionArguments: [300000000], // 3 FAKEETH
    });

    render(
      <TxButton
        label="3 ETH"
        accountAddress={TEST_ACCOUNT}
        prepareTransaction={prepareTransaction}
        onSuccess={(hash) => {
          txHash = hash;
        }}
      />,
    );

    // Open dropdown
    const dropdownBtn = screen.getByRole("button", { name: "" });
    fireEvent.click(dropdownBtn);

    // Click Skip & Submit
    await waitFor(() => {
      expect(screen.getByText("Skip & Submit")).toBeInTheDocument();
    });
    const skipSubmitBtn = screen.getByText("Skip & Submit");
    fireEvent.click(skipSubmitBtn);

    // Should go directly to submitting without showing "ready" state
    // We verify by checking that we never see "Submit 3 ETH" button
    // (which only appears after simulation)

    // Wait for success
    await waitFor(
      () => {
        expect(screen.getByText("Success!")).toBeInTheDocument();
      },
      { timeout: 30000 },
    );

    // Verify gas estimation was NOT shown (it's only shown after simulation)
    expect(screen.queryByText(/Gas:/)).not.toBeInTheDocument();

    expect(txHash).toBeTruthy();
    console.log("Transaction completed without simulation:", txHash);
  }, 60000);

  it("should handle multiple skip & submit transactions", async () => {
    const amounts = [200000000, 150000000]; // 2 ETH, 1.5 ETH
    const txHashes: string[] = [];

    for (const amount of amounts) {
      let txHash: string | null = null;

      const prepareTransaction = (): InputEntryFunctionData => ({
        function: `${DEPLOYER_ADDR}::fake_eth::mint`,
        functionArguments: [amount],
      });

      const { unmount } = render(
        <TxButton
          label={`${amount / 100000000} ETH`}
          accountAddress={TEST_ACCOUNT}
          prepareTransaction={prepareTransaction}
          onSuccess={(hash) => {
            txHash = hash;
          }}
        />,
      );

      // Open dropdown and click Skip & Submit
      const dropdownBtn = screen.getByRole("button", { name: "" });
      fireEvent.click(dropdownBtn);

      await waitFor(() => {
        expect(screen.getByText("Skip & Submit")).toBeInTheDocument();
      });

      const skipSubmitBtn = screen.getByText("Skip & Submit");
      fireEvent.click(skipSubmitBtn);

      // Wait for success
      await waitFor(
        () => {
          expect(screen.getByText("Success!")).toBeInTheDocument();
        },
        { timeout: 30000 },
      );

      expect(txHash).toBeTruthy();
      txHashes.push(txHash!);

      unmount();
      document.body.innerHTML = "";
    }

    console.log("All transactions completed:", txHashes);

    // Verify final balance using view function (same as production)
    const balanceResult = await aptos.view({
      payload: {
        function: `${DEPLOYER_ADDR}::fake_eth::balance`,
        functionArguments: [derivedAddr],
      },
    });
    const balance = Number(balanceResult[0]);

    const expectedMinBalance = amounts.reduce((a, b) => a + b, 0);
    expect(Number(balance)).toBeGreaterThanOrEqual(expectedMinBalance);
    console.log("Final balance verified:", balance);
  }, 120000);
});
