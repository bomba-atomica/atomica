// Low-level integration test for FakeEth using Ed25519 signing
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Aptos, AptosConfig, Network, Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import { setupLocalnet, teardownLocalnet, fundAccount, deployContracts } from "../setup/localnet";

const DEPLOYER_ADDR = "0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa";

describe.sequential("FakeEth Integration Test (Ed25519)", () => {
    let aptos: Aptos;
    let testAccount: Account;

    beforeAll(async () => {
        console.log("Starting Localnet...");
        await setupLocalnet();

        // Initialize Aptos client
        const config = new AptosConfig({
            network: Network.LOCAL,
            fullnode: "http://127.0.0.1:8080/v1",
        });
        aptos = new Aptos(config);

        // Deploy contracts
        console.log("Deploying contracts...");
        await deployContracts();

        // Generate Ed25519 test account
        testAccount = Account.generate();
        console.log(`Test Account Address: ${testAccount.accountAddress.toString()}`);

        // Fund the test account with APT for gas
        await fundAccount(testAccount.accountAddress.toString(), 100_000_000); // 1 APT

        // Wait for funding to be indexed
        await new Promise(r => setTimeout(r, 2000));

        // Register the account for FAKEETH
        console.log("Registering account for FAKEETH...");
        const registerTx = await aptos.transaction.build.simple({
            sender: testAccount.accountAddress,
            data: {
                function: "0x1::managed_coin::register",
                typeArguments: [`${DEPLOYER_ADDR}::FAKEETH::FAKEETH`],
                functionArguments: [],
            },
        });

        const registerCommitted = await aptos.signAndSubmitTransaction({
            signer: testAccount,
            transaction: registerTx,
        });

        await aptos.waitForTransaction({ transactionHash: registerCommitted.hash });
        console.log("Account registered for FAKEETH");
    }, 120000);

    afterAll(async () => {
        console.log("Stopping Localnet...");
        await teardownLocalnet();
    });

    it("should sign and submit FakeEth mint transaction with Ed25519", async () => {
        const mintAmount = 1000000000; // 10 FAKEETH (8 decimals)

        // Build the mint transaction
        const transaction = await aptos.transaction.build.simple({
            sender: testAccount.accountAddress,
            data: {
                function: `${DEPLOYER_ADDR}::FAKEETH::mint`,
                functionArguments: [mintAmount],
            },
        });

        console.log("Signing transaction with Ed25519...");
        const committedTx = await aptos.signAndSubmitTransaction({
            signer: testAccount,
            transaction,
        });

        console.log(`Transaction Hash: ${committedTx.hash}`);
        expect(committedTx.hash).toBeDefined();

        // Wait for transaction to be committed
        const txInfo = await aptos.waitForTransaction({
            transactionHash: committedTx.hash
        });

        console.log("Transaction committed:", txInfo.success);
        expect(txInfo.success).toBe(true);

        // Verify balance
        const balance = await aptos.getAccountCoinAmount({
            accountAddress: testAccount.accountAddress,
            coinType: `${DEPLOYER_ADDR}::FAKEETH::FAKEETH`,
        });

        console.log(`FAKEETH Balance: ${balance}`);
        expect(balance).toBe(mintAmount);
    }, 60000);

    it("should accumulate balance on multiple mints", async () => {
        const firstMint = 500000000; // 5 FAKEETH
        const secondMint = 300000000; // 3 FAKEETH

        // First mint
        const tx1 = await aptos.transaction.build.simple({
            sender: testAccount.accountAddress,
            data: {
                function: `${DEPLOYER_ADDR}::FAKEETH::mint`,
                functionArguments: [firstMint],
            },
        });

        const committed1 = await aptos.signAndSubmitTransaction({
            signer: testAccount,
            transaction: tx1,
        });

        await aptos.waitForTransaction({ transactionHash: committed1.hash });

        // Second mint
        const tx2 = await aptos.transaction.build.simple({
            sender: testAccount.accountAddress,
            data: {
                function: `${DEPLOYER_ADDR}::FAKEETH::mint`,
                functionArguments: [secondMint],
            },
        });

        const committed2 = await aptos.signAndSubmitTransaction({
            signer: testAccount,
            transaction: tx2,
        });

        await aptos.waitForTransaction({ transactionHash: committed2.hash });

        // Verify accumulated balance
        const balance = await aptos.getAccountCoinAmount({
            accountAddress: testAccount.accountAddress,
            coinType: `${DEPLOYER_ADDR}::FAKEETH::FAKEETH`,
        });

        const expectedBalance = 1000000000 + firstMint + secondMint; // Previous test + new mints
        console.log(`Accumulated Balance: ${balance}, Expected: ${expectedBalance}`);
        expect(balance).toBe(expectedBalance);
    }, 60000);
});
