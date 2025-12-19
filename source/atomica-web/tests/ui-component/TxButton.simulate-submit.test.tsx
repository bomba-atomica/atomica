// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import "@testing-library/jest-dom";
import nodeFetch, { Request, Response, Headers } from "node-fetch";
import { generateTestingUtils } from "eth-testing";
import {
  setupLocalnet,
  teardownLocalnet,
  fundAccount,
  deployContracts,
} from "../node-utils/localnet";
import { getDerivedAddress } from "../../src/lib/aptos/siwe";
import { TxButton } from "../../src/components/TxButton";
import {
  Aptos,
  AptosConfig,
  Network,
  InputEntryFunctionData,
} from "@aptos-labs/ts-sdk";
import { URL } from "url";
import { ethers } from "ethers";
import { setTimeout } from "timers/promises";

// Polyfill fetch for happy-dom

global.fetch = nodeFetch as any;

global.Request = Request as any;

global.Response = Response as any;

global.Headers = Headers as any;

global.URL = URL as any;

window.fetch = nodeFetch as any;

(window as any).Request = Request;

(window as any).Response = Response;

(window as any).Headers = Headers;

(window as any).URL = URL;

const DEPLOYER_ADDR =
  "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";
const TEST_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Hardhat Account 0
const TEST_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe.sequential("TxButton Simulate then Submit Mode", () => {
  const testingUtils = generateTestingUtils({ providerType: "MetaMask" });
  let derivedAddr: string;
  let aptos: Aptos;

  beforeAll(async () => {
    console.log("Starting Localnet...");
    await setupLocalnet();

    // Inject fetch-compatible Aptos instance
    const config = new AptosConfig({
      network: Network.LOCAL,
      fullnode: "http://127.0.0.1:8080/v1",
    });
    aptos = new Aptos(config);

    // Deploy contracts
    await deployContracts();

    // Mock window.ethereum

    (window as any).ethereum = testingUtils.getProvider();

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

    // Setup Provider Mocks
    testingUtils.mockChainId("0x4");
    testingUtils.mockAccounts([TEST_ACCOUNT]);
    testingUtils.mockRequestAccounts([TEST_ACCOUNT]);

    // Setup signature interceptor
    const wallet = new ethers.Wallet(TEST_PK);

    testingUtils.lowLevel.mockRequest(
      "personal_sign",
      async (params: any[]) => {
        console.log("[Mock personal_sign] params:", params);
        const [msgHex, address] = params;
        if (!msgHex) {
          console.error("[Mock personal_sign] msgHex is null or undefined!");
          throw new Error("Message is null");
        }
        const msgStr = ethers.toUtf8String(msgHex);
        console.log(
          "[Mock personal_sign] Signing message:",
          msgStr.substring(0, 100),
        );
        const sig = await wallet.signMessage(msgStr);
        console.log("[Mock personal_sign] Signature:", sig);
        return sig;
      },
    );

    // Fund account
    derivedAddr = (
      await getDerivedAddress(TEST_ACCOUNT.toLowerCase())
    ).toString();
    await fundAccount(derivedAddr, 100_000_000);
    await setTimeout(2000);

    console.log("Test environment ready");
  }, 120000);

  afterAll(async () => {
    console.log("Stopping Localnet...");
    await teardownLocalnet();
    testingUtils.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    testingUtils.clearAllMocks();
    testingUtils.mockChainId("0x4");
    testingUtils.mockAccounts([TEST_ACCOUNT]);

    // Re-establish personal_sign mock after clearAllMocks
    const wallet = new ethers.Wallet(TEST_PK);
    testingUtils.lowLevel.mockRequest(
      "personal_sign",
      async (params: any[]) => {
        console.log("[Mock personal_sign] params:", params);
        const [msgHex, address] = params;
        if (!msgHex) {
          console.error("[Mock personal_sign] msgHex is null or undefined!");
          throw new Error("Message is null");
        }
        const msgStr = ethers.toUtf8String(msgHex);
        console.log(
          "[Mock personal_sign] Signing message:",
          msgStr.substring(0, 100),
        );
        const sig = await wallet.signMessage(msgStr);
        console.log("[Mock personal_sign] Signature:", sig);
        return sig;
      },
    );
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
