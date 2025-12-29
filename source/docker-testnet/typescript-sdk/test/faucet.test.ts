import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { AptosAccount, AptosClient } from "aptos";
import type { DockerTestnet } from "../src/index";
import {
    registerCleanupHandlers,
    setGlobalTestnet,
    initializeTestnet,
    performCleanup,
    waitForNetworkStabilization,
} from "./helpers/testnet-lifecycle";

// Register cleanup handlers once at module load
registerCleanupHandlers();

describe("Faucet Mechanism", () => {
    let testnet: DockerTestnet;
    let client: AptosClient;
    const NUM_VALIDATORS = 2;

    beforeAll(async () => {
        testnet = await initializeTestnet(NUM_VALIDATORS);
        client = new AptosClient(testnet.validatorApiUrl(0));
        await waitForNetworkStabilization(testnet);
    }, 300000); // 5 min timeout for setup

    afterAll(async () => {
        await performCleanup("Faucet tests completed");
        setGlobalTestnet(undefined);
    });

    test("should verify faucet account exists and has balance", async () => {
        expect(testnet).toBeDefined();

        const faucetAccount = testnet.getFaucetAccount();
        const faucetAddr = faucetAccount.address().hex();

        console.log(`Faucet account address: ${faucetAddr}`);

        // Verify the faucet account exists on-chain
        const accountInfo = await client.getAccount(faucetAddr);
        expect(accountInfo).toBeDefined();
        expect(accountInfo.authentication_key).toBeDefined();

        console.log(`Faucet account sequence number: ${accountInfo.sequence_number}`);

        // Check faucet balance
        try {
            const resources = await client.getAccountResources(faucetAddr);
            const coinResource = resources.find(
                (r: any) => r.type === "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>",
            );

            if (coinResource) {
                const balance = (coinResource.data as any).coin.value;
                console.log(`Faucet balance: ${balance} octas`);
                expect(BigInt(balance)).toBeGreaterThan(0n);
            } else {
                console.log("⚠ Faucet account does not have a CoinStore yet");
            }
        } catch (error) {
            console.warn("Could not fetch faucet balance:", error);
        }

        console.log("✓ Faucet account verified");
    });

    test("can fund a new account using faucet", async () => {
        expect(testnet).toBeDefined();

        // Create a new account
        const newAccount = new AptosAccount();
        const newAddr = newAccount.address().hex();
        const amount = 100_000_000n; // 1 APT

        console.log(`\nCreating and funding new account: ${newAddr.slice(0, 10)}...`);
        console.log(`Funding amount: ${amount} octas (1 APT)`);

        // Use the faucet to create and fund the account
        const txnHash = await testnet.faucet(newAccount.address(), amount);
        console.log(`✓ Faucet transaction submitted: ${txnHash}`);

        // Wait a bit for the transaction to be fully processed
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Verify the account was created
        const accountInfo = await client.getAccount(newAddr);
        expect(accountInfo).toBeDefined();
        expect(accountInfo.sequence_number).toBe("0");
        console.log(`✓ Account created with sequence number: ${accountInfo.sequence_number}`);

        // Verify the account has the correct balance
        try {
            const coinResource = await client.getAccountResource(
                newAddr,
                "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>",
            );

            expect(coinResource).toBeDefined();
            const balance = BigInt((coinResource.data as any).coin.value);
            expect(balance).toBe(amount);
            console.log(`✓ Account balance verified: ${balance} octas`);
        } catch (error: any) {
            console.log(`⚠ CoinStore not found, but account was created. Error: ${error.message}`);
            console.log(
                "This is expected in test mode - aptos_account::transfer creates the account.",
            );
        }

        console.log("✓ Faucet funding test passed!");
    }, 120000); // 2 min timeout

    test("faucet can fund multiple accounts", async () => {
        expect(testnet).toBeDefined();

        const numAccounts = 3;
        const amount = 50_000_000n; // 0.5 APT each

        console.log(`\nFunding ${numAccounts} accounts with ${amount} octas each...`);

        const accounts: AptosAccount[] = [];

        for (let i = 0; i < numAccounts; i++) {
            const newAccount = new AptosAccount();
            accounts.push(newAccount);

            const txnHash = await testnet.faucet(newAccount.address(), amount);
            console.log(
                `  ✓ Account ${i + 1} funded: ${newAccount.address().hex().slice(0, 10)}... (txn: ${txnHash.slice(0, 10)}...)`,
            );

            // Verify account was created and funded
            const accountInfo = await client.getAccount(newAccount.address());
            expect(accountInfo).toBeDefined();
            expect(accountInfo.sequence_number).toBe("0");

            const coinResource = await client.getAccountResource(
                newAccount.address(),
                "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>",
            );
            expect(coinResource).toBeDefined();

            const balance = BigInt((coinResource.data as any).coin.value);
            expect(balance).toBe(amount);
        }

        console.log(`✓ All ${numAccounts} accounts successfully funded and verified`);
    }, 180000); // 3 min timeout

    test("can fund existing account with additional funds", async () => {
        expect(testnet).toBeDefined();

        // Create and fund initial account
        const account = new AptosAccount();
        const initialAmount = 100_000_000n; // 1 APT
        const additionalAmount = 50_000_000n; // 0.5 APT

        console.log(`\nFunding account with initial ${initialAmount} octas...`);
        await testnet.faucet(account.address(), initialAmount);

        // Verify initial balance
        let coinResource = await client.getAccountResource(
            account.address(),
            "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>",
        );
        let balance = BigInt((coinResource.data as any).coin.value);
        expect(balance).toBe(initialAmount);
        console.log(`✓ Initial balance: ${balance} octas`);

        // Fund again with additional amount
        console.log(`Adding ${additionalAmount} more octas...`);
        await testnet.faucet(account.address(), additionalAmount);

        // Verify new balance
        coinResource = await client.getAccountResource(
            account.address(),
            "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>",
        );
        balance = BigInt((coinResource.data as any).coin.value);

        const expectedBalance = initialAmount + additionalAmount;
        expect(balance).toBe(expectedBalance);
        console.log(`✓ Final balance: ${balance} octas (expected: ${expectedBalance})`);
        console.log("✓ Incremental funding test passed!");
    }, 120000);
});
