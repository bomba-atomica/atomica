// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupLocalnet, teardownLocalnet, runAptosCmd, fundAccount } from '../setup/localnet';
import { Aptos, AptosConfig, Network, Account, AccountAddress, Ed25519PrivateKey } from '@aptos-labs/ts-sdk';
import { resolve } from 'path';

const config = new AptosConfig({
    network: Network.CUSTOM,
    fullnode: "http://127.0.0.1:8080/v1", // Keep /v1 as per SDK docs usually, but will debug raw
    faucet: "http://127.0.0.1:8081"
});
const aptos = new Aptos(config);

describe('Atomica Basic Integration Tests', () => {
    beforeAll(async () => {
        await setupLocalnet();
    }, 120000);

    afterAll(async () => {
        await teardownLocalnet();
    });

    it('should have a running localnet', async () => {
        const info = await aptos.getLedgerInfo();
        expect(info.chain_id).toBe(4);
    });

    it('should fund an Ed25519 account via faucet', async () => {
        console.log("Starting faucet test...");
        const alice = Account.generate();
        console.log(`Generated account: ${alice.accountAddress.toString()}`);

        const faucetResponse = await fundAccount(alice.accountAddress.toString());
        console.log("Funding request completed. Response:", faucetResponse);
        // Faucet returns array of txn hashes e.g. ["0x..."]
        const txnHashes = JSON.parse(faucetResponse);
        const txnHash = txnHashes[0];
        console.log(`Waiting for faucet txn: ${txnHash}`);

        const txnRes = await aptos.waitForTransaction({ transactionHash: txnHash });
        // console.log("Faucet txn confirmed! Status:", (txnRes as any).success);

        // Wait for it to be indexed/available on node
        let balance = 0;
        for (let i = 0; i < 20; i++) {
            // console.log(`Checking balance attempt ${i + 1}...`);
            await new Promise(r => setTimeout(r, 1000));
            try {
                balance = await aptos.getAccountAPTAmount({ accountAddress: alice.accountAddress });
                if (balance >= 100_000_000) break;
            } catch (e: any) {
                // Ignore errors while waiting for indexer/node
            }
        }
        expect(balance).toBe(100_000_000);
    }, 60000); // 60s timeout

    it('should perform a simple transfer', async () => {
        const alice = Account.generate();
        const bob = Account.generate();

        await fundAccount(alice.accountAddress.toString(), 1_000_000_000);
        // Bob needs to be created, funding him with 0 might not work if faucet requires min amount, 
        // but let's try funding with small amount or just rely on transfer creating him if purely FA/Coin.
        // Actually, aptos_account::transfer creates account if not exists.
        // But for safety let's fund him a bit or just assume Alice transfer creates him.
        // The original test tried to fund with 0. Faucet might reject 0.
        // Let's just fund Alice.
        // await fundAccount(bob.accountAddress.toString(), 0); 


        const txn = await aptos.transaction.build.simple({
            sender: alice.accountAddress,
            data: {
                function: "0x1::aptos_account::transfer",
                functionArguments: [bob.accountAddress, 100],
            },
        });

        const pendingTxn = await aptos.signAndSubmitTransaction({
            signer: alice,
            transaction: txn,
        });

        const response = await aptos.waitForTransaction({ transactionHash: pendingTxn.hash });
        expect(response.success).toBe(true);
    });

    it('should deploy a noop contract', async () => {
        // Deployer
        const deployer = Account.generate();
        await fundAccount(deployer.accountAddress.toString(), 1_000_000_000);

        // Compile & Publish Noop
        // We use runAptosCmd
        const NOOP_DIR = resolve(__dirname, '../fixtures/noop');

        // Init
        await runAptosCmd([
            "init",
            "--network", "local",
            "--profile", "default",
            "--private-key", deployer.privateKey.toString(),
            "--assume-yes"
        ], NOOP_DIR);

        // Publish
        await runAptosCmd([
            "move", "publish",
            "--named-addresses", "noop=default",
            "--profile", "default",
            "--assume-yes"
        ], NOOP_DIR);

        // Check if module exists
        // module address is deployer address
        const modules = await aptos.getAccountModules({ accountAddress: deployer.accountAddress });
        const noopModule = modules.find(m => m.abi?.name === "noop");
        expect(noopModule).toBeDefined();
        expect(noopModule?.abi?.exposed_functions.some(f => f.name === "do_nothing")).toBe(true);
    }, 60000); // 60s timeout
});
