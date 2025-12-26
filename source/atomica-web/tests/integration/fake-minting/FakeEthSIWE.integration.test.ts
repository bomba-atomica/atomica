import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { commands } from "vitest/browser";
import { getDerivedAddress } from "../../../src/lib/aptos/siwe";
import { submitNativeTransaction } from "../../../src/lib/aptos/transaction";
import { ethers } from "ethers";
import { setupBrowserWalletMock } from "../../../test-utils/browser-utils/wallet-mock";

const DEPLOYER_ADDR =
  "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";
const TEST_ACCOUNT = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"; // Hardhat Account 0
const TEST_PK =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe.sequential("FakeEth SIWE Integration Test (Secp256k1)", () => {
  let aptos: Aptos;

  beforeAll(async () => {
    console.log("Starting Localnet...");
    await (commands as any).setupLocalnet();

    // Initialize Aptos client
    const config = new AptosConfig({
      network: Network.LOCAL,
      fullnode: "http://127.0.0.1:8080/v1",
    });
    aptos = new Aptos(config);

    // Deploy contracts
    console.log("Deploying contracts...");
    await (commands as any).deployContracts();

    console.log(`Ethereum Address: ${TEST_ACCOUNT}`);

    // Derive Aptos address from Ethereum address
    const derivedAddr = await getDerivedAddress(TEST_ACCOUNT.toLowerCase());
    console.log(`Derived Aptos Address: ${derivedAddr.toString()}`);

    // Fund the derived account with APT for gas
    await (commands as any).fundAccount(derivedAddr.toString(), 100_000_000); // 1 APT

    // Wait for funding to be indexed
    await new Promise((r) => setTimeout(r, 2000));

    // Setup browser wallet mock
    setupBrowserWalletMock(TEST_ACCOUNT, TEST_PK);

    console.log("SIWE environment setup complete");
  }, 120000);

  afterAll(async () => {
    console.log("Stopping Localnet...");
    await (commands as any).teardownLocalnet();
  });

  it("should mint FakeEth using SIWE authentication", async () => {
    const mintAmount = 1000000000; // 10 FAKEETH (8 decimals)
    const derivedAddr = await getDerivedAddress(TEST_ACCOUNT.toLowerCase());

    console.log("Submitting FakeEth mint transaction with SIWE...");

    // Submit transaction using SIWE flow
    const result = await submitNativeTransaction(TEST_ACCOUNT, {
      function: `${DEPLOYER_ADDR}::fake_eth::mint`,
      functionArguments: [mintAmount],
    });

    console.log(`Transaction Hash: ${result.hash}`);
    expect(result.hash).toBeDefined();

    // Wait for transaction to be committed
    const txInfo = await aptos.waitForTransaction({
      transactionHash: result.hash,
    });

    console.log("Transaction committed:", txInfo.success);
    expect(txInfo.success).toBe(true);

    // Verify balance via View Function (Fungible Asset)
    const viewRes = await aptos.view({
      payload: {
        function: `${DEPLOYER_ADDR}::fake_eth::balance`,
        functionArguments: [derivedAddr.toString()],
      },
    });

    const balance = Number(viewRes[0]);
    console.log(`FAKEETH Balance: ${balance}`);
    expect(balance).toBe(mintAmount);
  }, 60000);

});
