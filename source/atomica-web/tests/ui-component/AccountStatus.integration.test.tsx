// @vitest-environment happy-dom
import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { AccountStatus } from "../../src/components/AccountStatus";
import { getDerivedAddress } from "../../src/lib/aptos";
import { setupLocalnet, teardownLocalnet, fundAccount } from "../setup/localnet";
import { MockWallet } from "../utils/MockWallet";
import { ethers } from "ethers";
import nodeFetch from "node-fetch";

// Polyfill fetch for happy-dom environment to allow localhost connections
global.fetch = nodeFetch as any;
window.fetch = nodeFetch as any;

// Verification: Is fetch patched?
console.log("Fetch implementation:", global.fetch.name || global.fetch.toString());

describe.sequential("AccountStatus Integration", () => {

    const TEST_PK = "0x52a0d787625121df4e45d1d6a36f71dce7466710404f22ae3f21156828551717";
    const mockWallet = new MockWallet(TEST_PK);

    describe.sequential("AccountStatus Integration", () => {

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

        it("should update balance when account is funded", async () => {
            // 1. Render Component with the test ETH address
            // AccountStatus expects 'ethAddress' prop.
            // TODO: I wonder if you need to re-render this after funding the account or if this is reactive.
            render(<AccountStatus ethAddress={mockWallet.address} />);

            // Debug: Verify connectivity from within test context
            try {
                const ledger = await import("../../src/lib/aptos").then(m => m.aptos.getLedgerInfo());
                console.log("Test context connectivity check passed. Chain ID:", ledger.chain_id);
            } catch (e) {
                console.error("Test context connectivity check FAILED:", e);
            }

            // 2. Initial State: Should show 0 for APT
            // The component defaults to "0" and then fetches.
            // It might be "0" initially.
            expect(screen.getByText("APT:")).toBeInTheDocument();
            const aptContainer = screen.getByTitle("Gas (APT)");
            expect(aptContainer).toHaveTextContent("0");

            // 3. Fund the Account
            const derivedAddr = await getDerivedAddress(mockWallet.address);
            const derivedAddrStr = derivedAddr.toString();
            console.log(`Funding derived address: ${derivedAddrStr}`);

            // Fund with 10 APT (10 * 10^8 octas)
            const FUND_AMOUNT = 10_0000_0000;
            const fundResponse = await fundAccount(derivedAddrStr, FUND_AMOUNT);
            console.log(`Fund response: ${fundResponse}`);
            const fundTxnHash = JSON.parse(fundResponse)[0];

            // Wait for transaction to be committed
            console.log(`Waiting for funding txn: ${fundTxnHash}...`);
            let txnCommitted = false;
            for (let i = 0; i < 20; i++) {
                const txnRes = await nodeFetch(`http://127.0.0.1:8080/v1/transactions/by_hash/${fundTxnHash}`);
                if (txnRes.ok) {
                    const txnData = await txnRes.json() as any;
                    if (txnData.success) {
                        console.log("Funding txn committed successfully.", JSON.stringify(txnData, null, 2));
                        txnCommitted = true;
                        break;
                    }
                }
                await new Promise(r => setTimeout(r, 500));
            }
            if (!txnCommitted) console.warn("Funding txn NOT confirmed within timeout.");

            console.log("Funding complete. Waiting for UI update...");

            // 4. Verify Update
            // AccountStatus polls every 3000ms.
            // We wait for the text to change to "10.0000"

            // APT is divided by 100_000_000 and fixed to 4 decimals.
            // 1000000000 / 100000000 = 10.0000

            await waitFor(() => {
                expect(screen.getByText("10.0000")).toBeInTheDocument();
            }, { timeout: 15000, interval: 1000 }); // Give it a few poll cycles
        }, 30000);
    });
});
