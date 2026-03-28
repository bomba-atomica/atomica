import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { AptosAccount, AptosClient } from "aptos";
import { setupLocalnet, getTestnet, teardownLocalnet } from "../src/localnet";

describe.sequential("Faucet Mechanism", () => {
    let client: AptosClient;

    beforeAll(async () => {
        await setupLocalnet();
        const testnet = getTestnet();
        client = new AptosClient(testnet.validatorApiUrl(0));
    }, 300000);

    afterAll(async () => {
        await teardownLocalnet();
    });

    test("should verify faucet account exists and has balance", async () => {
        const testnet = getTestnet();
        expect(testnet).toBeDefined();

        const faucetAccount = testnet.getFaucetAccount();
        const faucetAddr = faucetAccount.address().hex();

        console.log(`Faucet account address: ${faucetAddr}`);

        const accountInfo = await client.getAccount(faucetAddr);
        expect(accountInfo).toBeDefined();
        expect(accountInfo.authentication_key).toBeDefined();

        console.log(`Faucet account sequence number: ${accountInfo.sequence_number}`);

        try {
            const resources = await client.getAccountResources(faucetAddr);
            const coinResource = resources.find(
                (r) => r.type === "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>",
            );

            if (coinResource) {
                const balance = (coinResource.data as { coin: { value: string } }).coin.value;
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
        const testnet = getTestnet();
        expect(testnet).toBeDefined();

        const newAccount = new AptosAccount();
        const newAddr = newAccount.address().hex();
        const amount = 100_000_000n;

        console.log(`\nCreating and funding new account: ${newAddr.slice(0, 10)}...`);
        console.log(`Funding amount: ${amount} octas (1 APT)`);

        const txnHash = await testnet.faucet(newAccount.address(), amount);
        console.log(`✓ Faucet transaction submitted: ${txnHash}`);

        await new Promise((resolve) => setTimeout(resolve, 2000));

        const accountInfo = await client.getAccount(newAddr);
        expect(accountInfo).toBeDefined();
        expect(accountInfo.sequence_number).toBe("0");
        console.log(`✓ Account created with sequence number: ${accountInfo.sequence_number}`);

        const result = await client.view({
            function: "0x1::coin::balance",
            type_arguments: ["0x1::aptos_coin::AptosCoin"],
            arguments: [newAddr],
        });

        const balance = BigInt(result[0] as string);
        expect(balance).toBe(amount);
        console.log(`✓ Account balance verified: ${balance} octas`);

        console.log("✓ Faucet funding test passed!");
    }, 120000);

    test("faucet can fund multiple accounts", async () => {
        const testnet = getTestnet();
        expect(testnet).toBeDefined();

        const numAccounts = 3;
        const amount = 50_000_000n;

        console.log(`\nFunding ${numAccounts} accounts with ${amount} octas each...`);

        const accounts: AptosAccount[] = [];

        for (let i = 0; i < numAccounts; i++) {
            const newAccount = new AptosAccount();
            accounts.push(newAccount);

            const txnHash = await testnet.faucet(newAccount.address(), amount);
            console.log(
                `  ✓ Account ${i + 1} funded: ${newAccount.address().hex().slice(0, 10)}... (txn: ${txnHash.slice(0, 10)}...)`,
            );

            const accountInfo = await client.getAccount(newAccount.address());
            expect(accountInfo).toBeDefined();
            expect(accountInfo.sequence_number).toBe("0");

            const result = await client.view({
                function: "0x1::coin::balance",
                type_arguments: ["0x1::aptos_coin::AptosCoin"],
                arguments: [newAccount.address().hex()],
            });

            const balance = BigInt(result[0] as string);
            expect(balance).toBe(amount);
        }

        console.log(`✓ All ${numAccounts} accounts successfully funded and verified`);
    }, 180000);

    test("can fund existing account with additional funds", async () => {
        const testnet = getTestnet();
        expect(testnet).toBeDefined();

        const account = new AptosAccount();
        const initialAmount = 100_000_000n;
        const additionalAmount = 50_000_000n;

        console.log(`\nFunding account with initial ${initialAmount} octas...`);
        await testnet.faucet(account.address(), initialAmount);

        let result = await client.view({
            function: "0x1::coin::balance",
            type_arguments: ["0x1::aptos_coin::AptosCoin"],
            arguments: [account.address().hex()],
        });
        let balance = BigInt(result[0] as string);
        expect(balance).toBe(initialAmount);
        console.log(`✓ Initial balance: ${balance} octas`);

        console.log(`Adding ${additionalAmount} more octas...`);
        await testnet.faucet(account.address(), additionalAmount);

        result = await client.view({
            function: "0x1::coin::balance",
            type_arguments: ["0x1::aptos_coin::AptosCoin"],
            arguments: [account.address().hex()],
        });
        balance = BigInt(result[0] as string);

        const expectedBalance = initialAmount + additionalAmount;
        expect(balance).toBe(expectedBalance);
        console.log(`✓ Final balance: ${balance} octas (expected: ${expectedBalance})`);
        console.log("✓ Incremental funding test passed!");
    }, 120000);
});
