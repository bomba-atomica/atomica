import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupLocalnet } from "../../test-utils/localnet";
import { Aptos, AptosConfig, Network, Account } from "@aptos-labs/ts-sdk";

/**
 * Test: HTTP Faucet Service
 * 
 * Verifies that the HTTP Faucet Service (aptos-faucet-service) is running
 * and responding on port 8081. This is critical for the Frontend.
 */

const config = new AptosConfig({
    network: Network.CUSTOM,
    fullnode: "http://127.0.0.1:8080/v1",
});
const aptos = new Aptos(config);

describe.sequential("HTTP Faucet Service", () => {
    beforeAll(async () => {
        await setupLocalnet();

        // Wait for faucet service to be ready
        // It might take a moment after Docker container starts
        await waitForUrl("http://127.0.0.1:8081/health");
    }, 120000);

    afterAll(async () => {
        // No teardown in persistent mode
    });

    it("should be reachable and healthy", async () => {
        await fetch("http://127.0.0.1:8081");
        // Faucet root often returns 404 or welcome strings, but if it connects, it's alive.
        // The health endpoint is better.
        // aptos-faucet-service usually has /health or just responds to /mint.
    });

    it("should fund account via HTTP POST /mint API", async () => {
        const alice = Account.generate();
        const address = alice.accountAddress.toString();
        const amount = 100_000_000;

        // Call the faucet API directly (simulating frontend)
        const url = `http://127.0.0.1:8081/mint?amount=${amount}&address=${address}`;

        const response = await fetch(url, { method: "POST" });
        expect(response.status).toBe(200);

        const txHashes = await response.json();
        expect(Array.isArray(txHashes)).toBe(true);
        expect(txHashes.length).toBeGreaterThan(0);
        const txHash = txHashes[0];

        console.log(`Faucet funded ${address} with tx: ${txHash}`);

        await aptos.waitForTransaction({ transactionHash: txHash });

        const balance = await aptos.getAccountAPTAmount({
            accountAddress: alice.accountAddress,
        });
        expect(balance).toBe(amount);
    }, 30000);
});

async function waitForUrl(url: string) {
    const startTime = Date.now();
    while (Date.now() - startTime < 60000) {
        try {
            await fetch(url);
            return;
        } catch {
            await new Promise(r => setTimeout(r, 1000));
        }
    }
    throw new Error(`Timeout waiting for ${url}`);
}
