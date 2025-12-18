// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom";
import { AccountStatus } from "../../src/components/AccountStatus";
import { setupLocalnet, teardownLocalnet } from "../setup/localnet";
import { MockWallet } from "../utils/MockWallet";
import nodeFetch from "node-fetch";
import { useTokenBalances } from "../../src/hooks/useTokenBalances";

// Polyfill fetch for happy-dom environment to allow localhost connections
global.fetch = nodeFetch as any;
window.fetch = nodeFetch as any;

// Verification: Is fetch patched?
console.log(
  "Fetch implementation:",
  global.fetch.name || global.fetch.toString(),
);

describe.sequential("AccountStatus Integration", () => {
  const TEST_PK =
    "0x52a0d787625121df4e45d1d6a36f71dce7466710404f22ae3f21156828551717";
  const mockWallet = new MockWallet(TEST_PK);

  beforeAll(async () => {
    console.log("Starting Localnet...");
    await setupLocalnet();
  }, 120000); // Allow time for localnet startup

  afterAll(async () => {
    console.log("Stopping Localnet...");
    await teardownLocalnet();
  });

  afterEach(() => {
    // Clean up DOM
    document.body.innerHTML = "";
  });

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
          expect(
            screen.getByText(/Account not found on chain/),
          ).toBeInTheDocument();
        },
        { timeout: 10000 },
      );

      console.log("✓ Test passed: Component shows 'account not found' warning");
    }, 15000);
  });

  // TODO
  // describe.sequential("With funded account", () => {
  //     it("should display balance when account exists after funding", async () => {
  //         // Step 1: Fund the account
  //         const derivedAddr = await getDerivedAddress(mockWallet.address);
  //         const fundedAddress = derivedAddr.toString();
  //         console.log(`Funding account for test: ${fundedAddress}`);

  //         const FUND_AMOUNT = 10_00_00_0000; // 10 APT
  //         const fundResponse = await fundAccount(fundedAddress, FUND_AMOUNT);
  //         const fundTxnHash = JSON.parse(fundResponse)[0];
  //         console.log(`Funding txn hash: ${fundTxnHash}`);

  //         // Wait for transaction to be committed
  //         let txnCommitted = false;
  //         for (let i = 0; i < 20; i++) {
  //             const txnRes = await nodeFetch(`http://127.0.0.1:8080/v1/transactions/by_hash/${fundTxnHash}`);
  //             if (txnRes.ok) {
  //                 const txnData = await txnRes.json() as any;
  //                 if (txnData.success) {
  //                     console.log("✓ Funding txn committed successfully");
  //                     txnCommitted = true;
  //                     break;
  //                 }
  //             }
  //             await new Promise(r => setTimeout(r, 500));
  //         }

  //         expect(txnCommitted).toBe(true);

  //         // Verify account is queryable before rendering component
  //         const { aptos } = await import("../../src/lib/aptos");
  //         let accountBalance = 0;
  //         for (let i = 0; i < 10; i++) {
  //             try {
  //                 accountBalance = await aptos.getAccountAPTAmount({ accountAddress: derivedAddr });
  //                 console.log(`✓ Account verified. Balance: ${accountBalance} octas`);
  //                 break;
  //             } catch {
  //                 if (i === 9) {
  //                     console.error("Account not queryable after 10 attempts");
  //                     throw e;
  //                 }
  //                 await new Promise(r => setTimeout(r, 1000));
  //             }
  //         }

  //         expect(accountBalance).toBeGreaterThan(0);
  //         console.log("✓ Account funding setup complete");

  //         // Step 2: Now render the component
  //         // Wrapper component that uses the hook
  //         function TestWrapper() {
  //             const balances = useTokenBalances(mockWallet.address);
  //             return <AccountStatus ethAddress={mockWallet.address} balances={balances} />;
  //         }

  //         render(<TestWrapper />);

  //         // Account already exists and is funded from beforeAll
  //         // The hook polls every 5 seconds, so we wait for the balance to appear
  //         // APT is divided by 100_000_000 and fixed to 4 decimals.
  //         // 1000000000 / 100000000 = 10.0000

  //         await waitFor(() => {
  //             expect(screen.getByText("APT:")).toBeInTheDocument();
  //             expect(screen.getByText("10.0000")).toBeInTheDocument();
  //         }, { timeout: 15000, interval: 500 });

  //         // Verify no warning is shown
  //         expect(screen.queryByText(/Account not found on chain/)).not.toBeInTheDocument();

  //         console.log("✓ Test passed: Component shows balance for funded account");
  //     }, 60000); // Longer timeout since we fund the account in this test
  // });
});
