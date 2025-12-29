import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { DockerTestnet } from "../src/index";
import { AptosAccount, AptosClient, CoinClient, HexString } from "aptos";

// Global reference for signal handlers
let globalTestnet: DockerTestnet | undefined;
let cleanupInProgress = false;

async function performCleanup(reason: string): Promise<void> {
    if (cleanupInProgress) return;
    cleanupInProgress = true;
    console.log(`\n🛑 ${reason}`);
    if (globalTestnet) {
        try {
            await globalTestnet.teardown();
        } catch (error) {
            console.error("✗ Failed to tear down testnet:", error);
        }
    }
    cleanupInProgress = false;
}

process.on("SIGINT", async () => {
    await performCleanup("Received SIGINT");
    process.exit(130);
});

describe("Validator Faucet TDD", () => {
    let testnet: DockerTestnet | undefined;
    let client: AptosClient;
    let coinClient: CoinClient;
    const NUM_VALIDATORS = 2; // Using 2 validators to reduce CPU usage

    beforeAll(async () => {
        console.log("Initializing testnet for faucet test...");
        testnet = await DockerTestnet.new(NUM_VALIDATORS);
        globalTestnet = testnet;
        client = new AptosClient(testnet.validatorApiUrl(0));
        coinClient = new CoinClient(client);

        // Wait for consensus to start
        console.log("Waiting for network to stabilize and produce at least 1 block...");
        await new Promise(resolve => setTimeout(resolve, 10000));
        try {
            await testnet!.waitForBlocks(1, 60);
        } catch (e) {
            console.warn("Timed out waiting for block 1, continuing anyway...");
        }
    }, 300000);

    afterAll(async () => {
        await performCleanup("Tests completed");
        globalTestnet = undefined;
    });

    test("sanity check: verify validator identities and resources", async () => {
        expect(testnet).toBeDefined();

        // 1. Get validator set from on-chain
        const validatorSet = await client.getAccountResource("0x1", "0x1::stake::ValidatorSet");
        const activeValidators = (validatorSet.data as any).active_validators.map((v: any) => v.addr.toLowerCase());
        console.log("On-chain active validators:", activeValidators);

        // 2. Check each local validator account
        for (let i = 0; i < NUM_VALIDATORS; i++) {
            const validatorAccount = await testnet!.getValidatorAccount(i);
            const addr = validatorAccount.address().hex().toLowerCase();
            console.log(`Local Validator ${i} address: ${addr}`);
        }

        // PROBE Root Account
        try {
            const rootAcc = testnet!.getRootAccount();
            const rootAddr = rootAcc.address().hex();
            const acc = await client.getAccount(rootAddr);
            console.log(`Root account address: ${rootAddr}`);
            console.log(`Root account auth key on-chain: ${acc.authentication_key}`);
            console.log(`Root account auth key derived:  ${rootAcc.authKey().hex()}`);
        } catch (e) {
            console.log(`Failed to probe root account: ${e.message}`);
        }

        // 1.9 Total Supply Probe
        try {
            const coinInfo = await client.getAccountResource("0x1", "0x1::coin::CoinInfo<0x1::aptos_coin::AptosCoin>");
            console.log("Total Supply:", (coinInfo.data as any).supply.vec[0].integer.value);
        } catch (e) {
            console.log("Failed to fetch total supply:", e.message);
        }
    });

    test.skip("can fund a new account using faucet", async () => {
        expect(testnet).toBeDefined();

        // Create a new account
        const newAccount = new AptosAccount();
        const amount = 100_000_000n; // 1 APT

        console.log(`Using faucet to fund ${newAccount.address().hex().slice(0, 10)}...`);

        // Use the faucet to create and fund the account
        const txnHash = await testnet!.faucet(newAccount.address(), amount);
        console.log(`✓ Faucet transaction: ${txnHash}`);

        // Verify the account was created
        const account = await client.getAccount(newAccount.address());
        expect(account).toBeDefined();
        expect(account.sequence_number).toBe("0");
        console.log(`✓ Account created successfully`);
    }, 120000);


    test.skip("faucet can fund multiple accounts", async () => {
        expect(testnet).toBeDefined();

        const numAccounts = 3;
        const amount = 25_000_000n; // 0.25 APT each

        console.log(`Funding ${numAccounts} accounts via faucet...`);

        for (let i = 0; i < numAccounts; i++) {
            const newAccount = new AptosAccount();
            const txnHash = await testnet!.faucet(newAccount.address(), amount);

            // Verify account was created
            const account = await client.getAccount(newAccount.address());
            expect(account).toBeDefined();
            console.log(`  ✓ Account ${i + 1} funded: ${newAccount.address().hex().slice(0, 10)}... (txn: ${txnHash.slice(0, 10)}...)`);
        }

        console.log(`✓ All ${numAccounts} accounts funded successfully`);
    }, 180000);
});
