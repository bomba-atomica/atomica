// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLocalnet, teardownLocalnet, fundAccount } from '../../setup/localnet';
import { Aptos, AptosConfig, Network, Account } from '@aptos-labs/ts-sdk';

/**
 * Test: Ed25519 Account Funding via Faucet
 *
 * Purpose:
 * This test verifies that the Aptos local testnet faucet can successfully fund
 * a newly generated Ed25519 account. This is a fundamental operation required
 * for all testing, as accounts need initial funding to pay for gas fees.
 *
 * What the test does:
 * 1. Generates a new Ed25519 account (randomly generated private/public key pair)
 * 2. Verifies the account doesn't exist on-chain yet (balance check should fail)
 * 3. Requests funding from the faucet endpoint (http://127.0.0.1:8081/mint)
 * 4. Waits for the faucet transaction to be confirmed on-chain
 * 5. Polls the account balance until it reflects the funded amount
 * 6. Verifies the account has exactly 100,000,000 octas (1 APT)
 *
 * How the Aptos local testnet faucet works:
 * - The faucet is a REST API endpoint running on port 8081
 * - Request format: POST to /mint?amount=<octas>&address=<0x...>
 * - The faucet creates and submits a transaction to mint tokens to the address
 * - Response: JSON array of transaction hashes, e.g., ["0xabc123..."]
 * - The transaction must be confirmed before the account balance updates
 * - Default funding amount: 100,000,000 octas (100M octas = 1 APT)
 *
 * Common issues and expectations:
 * - The account doesn't need to exist on-chain before funding (faucet creates it)
 * - Newly generated accounts return a balance of 0 instead of throwing errors
 * - There may be a delay between transaction confirmation and balance indexing
 * - The local testnet uses chain_id = 4
 * - Faucet transactions follow the same lifecycle as user transactions
 */

const config = new AptosConfig({
    network: Network.CUSTOM,
    fullnode: "http://127.0.0.1:8080/v1",
    faucet: "http://127.0.0.1:8081"
});
const aptos = new Aptos(config);

describe.sequential('Ed25519 Faucet Funding', () => {
    beforeAll(async () => {
        await setupLocalnet();
    }, 120000);

    afterAll(async () => {
        await teardownLocalnet();
    });

    it('should fund an Ed25519 account via faucet', async () => {
        console.log("Starting faucet test...");
        const alice = Account.generate();
        console.log(`Generated account: ${alice.accountAddress.toString()}`);

        // Verify account balance is 0 before funding
        // Note: Aptos returns 0 for non-existent accounts instead of throwing errors
        const initialBalance = await aptos.getAccountAPTAmount({ accountAddress: alice.accountAddress });
        console.log(`Initial balance: ${initialBalance} (should be 0)`);
        expect(initialBalance).toBe(0);

        const faucetResponse = await fundAccount(alice.accountAddress.toString());
        console.log("Funding request completed. Response:", faucetResponse);

        // Faucet returns array of txn hashes e.g. ["0x..."]
        const txnHashes = JSON.parse(faucetResponse);
        const txnHash = txnHashes[0];
        console.log(`Waiting for faucet txn: ${txnHash}`);

        const txnRes = await aptos.waitForTransaction({ transactionHash: txnHash });
        console.log("Faucet txn confirmed! Success:", (txnRes as any).success);

        // Wait for it to be indexed/available on node
        let balance = 0;
        for (let i = 0; i < 20; i++) {
            console.log(`Checking balance attempt ${i + 1}...`);
            await new Promise(r => setTimeout(r, 1000));
            try {
                balance = await aptos.getAccountAPTAmount({ accountAddress: alice.accountAddress });
                console.log(`Current balance: ${balance}`);
                if (balance >= 100_000_000) break;
            } catch (e: any) {
                console.log(`Balance check error (attempt ${i + 1}):`, e.message);
                // Ignore errors while waiting for indexer/node
            }
        }

        console.log(`Final balance: ${balance}, expected: 100000000`);
        expect(balance).toBe(100_000_000);
    }, 60000); // 60s timeout
});
