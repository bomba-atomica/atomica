import { DockerTestnet } from "../src/index";
import { AptosAccount, AptosClient } from "aptos";

async function main() {
    console.log("Starting testnet...");
    const testnet = await DockerTestnet.new(2);

    try {
        const client = new AptosClient(testnet.validatorApiUrl(0));
        const faucetAccount = testnet.getFaucetAccount();

        console.log(`Faucet account: ${faucetAccount.address().hex()}`);

        // Check faucet balance
        try {
            const faucetBalance = await client.getAccountResource(
                faucetAccount.address(),
                "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>"
            );
            console.log("Faucet CoinStore:", faucetBalance);
        } catch (e: any) {
            console.log("Faucet CoinStore error:", e.message);
        }

        // Try to create a new account
        const newAccount = new AptosAccount();
        console.log(`\nCreating new account: ${newAccount.address().hex()}`);

        const payload = {
            type: "entry_function_payload",
            function: "0x1::aptos_account::transfer",
            type_arguments: [],
            arguments: [newAccount.address().hex(), "100000000"],
        };

        console.log("Generating transaction...");
        const txn = await client.generateTransaction(faucetAccount.address(), payload);
        console.log("Transaction generated:", txn);

        console.log("Signing transaction...");
        const signedTxn = await client.signTransaction(faucetAccount, txn);
        console.log("Transaction signed");

        console.log("Submitting transaction...");
        const pending = await client.submitTransaction(signedTxn);
        console.log("Transaction submitted:", pending.hash);

        console.log("Waiting for transaction...");
        const txnResult = await client.waitForTransactionWithResult(pending.hash);
        console.log("✓ Transaction completed!");
        console.log("Transaction result:", JSON.stringify(txnResult, null, 2));

        // Check if account exists
        try {
            const account = await client.getAccount(newAccount.address());
            console.log("\n✓ Account created!");
            console.log("Account sequence number:", account.sequence_number);
        } catch (e: any) {
            console.log("\n✗ Account not created:", e.message);
        }

        // Check new account balance
        try {
            const balance = await client.getAccountResource(
                newAccount.address(),
                "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>"
            );
            console.log("\n✓ New account CoinStore created!");
            console.log("Balance data:", JSON.stringify(balance.data, null, 2));
        } catch (e: any) {
            console.log("\n✗ Failed to get new account CoinStore:", e.message);
        }

    } finally {
        await testnet.teardown();
    }
}

main().catch(console.error);
