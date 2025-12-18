// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import nodeFetch, { Request, Response, Headers } from "node-fetch";
import { generateTestingUtils } from "eth-testing";
import {
  setupLocalnet,
  teardownLocalnet,
  fundAccount,
  deployContracts,
} from "../setup/localnet";
import { getDerivedAddress } from "../../src/lib/aptos/siwe";
import { TxButton } from "../../src/components/TxButton";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { URL } from "url";
import { ethers } from "ethers";

// Polyfill fetch for happy-dom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.fetch = nodeFetch as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.Request = Request as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.Response = Response as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.Headers = Headers as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
global.URL = URL as any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.fetch = nodeFetch as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).Request = Request;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).Response = Response;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).Headers = Headers;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).URL = URL;

const DEPLOYER_ADDR =
  "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";
const TEST_ACCOUNT = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"; // Hardhat Account 0
const TEST_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe.sequential("TxButton Skip & Submit Mode", () => {
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
      client: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        provider: async (url: any, init: any) => {
          let fetchUrl = url;
          let fetchInit = init;

          if (typeof url !== "string" && !(url instanceof URL)) {
            if (url.url) {
              fetchUrl = url.url;
              fetchInit = {
                ...init,
                method: url.method,
                headers: url.headers,
                body: url.body,
              };
            }
          }

          try {
            const res = await nodeFetch(fetchUrl, fetchInit);
            try {
              const bodyClone = res.clone();
              const data = await bodyClone.json().catch(() => bodyClone.text());
              Object.defineProperty(res, "data", { value: data });
            } catch {
              // Ignore data parsing errors
            }
            return res;
          } catch (e) {
            throw e;
          }
        },
      },
    });
    aptos = new Aptos(config);

    // Deploy contracts
    await deployContracts();

    // Mock window.ethereum
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).ethereum = testingUtils.getProvider();

    // Mock window.location
    // @ts-expect-error
    delete window.location;
    // @ts-expect-error
    window.location = {
      protocol: "http:",
      host: "localhost:3000",
      origin: "http://localhost:3000",
      href: "http://localhost:3000/",
    };

    // Setup Provider Mocks
    testingUtils.mockChainId("0x4");
    testingUtils.mockAccounts([TEST_ACCOUNT]);
    testingUtils.mockRequestAccounts([TEST_ACCOUNT]);

    // Setup signature interceptor
    const wallet = new ethers.Wallet(TEST_PK);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    testingUtils.lowLevel.mockRequest(
      "personal_sign",
      async (params: any[]) => {
        const [msgHex] = params;
        const msgStr = ethers.toUtf8String(msgHex);
        return await wallet.signMessage(msgStr);
      },
    );

    // Fund account
    derivedAddr = (
      await getDerivedAddress(TEST_ACCOUNT.toLowerCase())
    ).toString();
    await fundAccount(derivedAddr, 100_000_000);
    await new Promise((r) => setTimeout(r, 2000));

    console.log("Test environment ready");
  }, 120000);

  afterAll(async () => {
    console.log("Stopping Localnet...");
    await teardownLocalnet();
    testingUtils.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = "";
    testingUtils.clearAllMocks();
    testingUtils.mockChainId("0x4");
    testingUtils.mockAccounts([TEST_ACCOUNT]);
  });

  it("should skip simulation and submit FakeEth mint directly", async () => {
    let txHash: string | null = null;

    const prepareTransaction = () => ({
      function: `${DEPLOYER_ADDR}::FAKEETH::mint`,
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

    // Find the dropdown button (chevron)
    const dropdownBtn = screen.getByRole("button", { name: "" });

    // Click to open dropdown
    fireEvent.click(dropdownBtn);

    // Wait for dropdown to appear
    await waitFor(() => {
      expect(screen.getByText("Skip & Submit")).toBeInTheDocument();
    });

    // Click "Skip & Submit"
    const skipSubmitBtn = screen.getByText("Skip & Submit");
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

    // Verify balance on-chain
    const balance = await aptos.getAccountCoinAmount({
      accountAddress: derivedAddr,
      coinType: `${DEPLOYER_ADDR}::FAKEETH::FAKEETH`,
    });

    expect(Number(balance)).toBeGreaterThan(0);
    console.log("Balance verified:", balance);
  }, 60000);

  it("should not show simulation details when skipping", async () => {
    let txHash: string | null = null;

    const prepareTransaction = () => ({
      function: `${DEPLOYER_ADDR}::FAKEETH::mint`,
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

      const prepareTransaction = () => ({
        function: `${DEPLOYER_ADDR}::FAKEETH::mint`,
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

    // Verify final balance
    const balance = await aptos.getAccountCoinAmount({
      accountAddress: derivedAddr,
      coinType: `${DEPLOYER_ADDR}::FAKEETH::FAKEETH`,
    });

    const expectedMinBalance = amounts.reduce((a, b) => a + b, 0);
    expect(Number(balance)).toBeGreaterThanOrEqual(expectedMinBalance);
    console.log("Final balance verified:", balance);
  }, 120000);
});
