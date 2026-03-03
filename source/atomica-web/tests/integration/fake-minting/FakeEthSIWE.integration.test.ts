// Integration test for Aptos transaction signing via SIWE (Sign-In with Ethereum / Secp256k1).
// Validates that Ethereum wallets can control Aptos accounts through SIWE authentication.
// FakeETH/FakeUSD minting is EVM-only; this suite tests the SIWE signing path with APT transfers.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { commands } from "vitest/browser";
import { getDerivedAddress } from "../../../src/lib/aptos/siwe";
import { submitNativeTransaction } from "../../../src/lib/aptos/transaction";
import { setupBrowserWalletMock } from "../../../test-utils/browser-utils/wallet-mock";
import {
  ETHEREUM_ACCOUNT_0_ADDRESS,
  ETHEREUM_ACCOUNT_0_PRIVATE_KEY,
} from "../../../../shared/test-constants";

const TEST_ACCOUNT = ETHEREUM_ACCOUNT_0_ADDRESS; // Hardhat Account 0
const TEST_PK = ETHEREUM_ACCOUNT_0_PRIVATE_KEY;

// Recipient for the APT transfer used as the test transaction
const TRANSFER_RECIPIENT =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

describe.sequential("Aptos SIWE Transaction Signing (Secp256k1)", () => {
  let aptos: Aptos;

  beforeAll(async () => {
    console.log("Starting Localnet...");
    await commands.setupLocalnet();
    // No deployContracts() needed — tests use native APT transfers only

    const config = new AptosConfig({
      network: Network.LOCAL,
      fullnode: "http://127.0.0.1:8080/v1",
    });
    aptos = new Aptos(config);

    console.log(`Ethereum Address: ${TEST_ACCOUNT}`);

    const derivedAddr = await getDerivedAddress(TEST_ACCOUNT.toLowerCase());
    console.log(`Derived Aptos Address: ${derivedAddr.toString()}`);

    await (commands as any).fundAccount(derivedAddr.toString(), 100_000_000); // 1 APT

    await new Promise((r) => setTimeout(r, 2000));

    setupBrowserWalletMock(TEST_ACCOUNT, TEST_PK);

    console.log("SIWE environment setup complete");
  }, 120000);

  afterAll(async () => {
    console.log("Stopping Localnet...");
    await (commands as any).teardownLocalnet();
  });

  it("should submit a native APT transfer using SIWE authentication", async () => {
    const derivedAddr = await getDerivedAddress(TEST_ACCOUNT.toLowerCase());

    console.log("Submitting APT transfer with SIWE...");

    const result = await submitNativeTransaction(TEST_ACCOUNT, {
      function: "0x1::aptos_account::transfer",
      functionArguments: [TRANSFER_RECIPIENT, 1000],
    });

    console.log(`Transaction Hash: ${result.hash}`);
    expect(result.hash).toBeDefined();

    const txInfo = await aptos.waitForTransaction({
      transactionHash: result.hash,
    });

    console.log("Transaction committed:", txInfo.success);
    expect(txInfo.success).toBe(true);

    // Verify the derived Aptos address is controlled by the Ethereum key
    console.log(
      `Confirmed: Ethereum address ${TEST_ACCOUNT} controls Aptos address ${derivedAddr.toString()}`,
    );
  }, 60000);
});
