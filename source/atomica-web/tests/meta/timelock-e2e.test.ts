import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DockerTestnet } from "../../test-utils/docker-testnet";
import { TimelockClient } from "../../src/lib/timelock_client";
import { Aptos, AptosConfig, Network } from "@aptos-labs/ts-sdk";
import { Ed25519Account } from "@aptos-labs/ts-sdk";

/**
 * E2E Test: Timelock Encryption/Decryption Round Trip
 * 
 * Verifies the full flow:
 * 1. Start local testnet (4 validators)
 * 2. Get MPK from chain
 * 3. Register a timelock (future deadline)
 * 4. Encrypt a message
 * 5. Wait for deadline
 * 6. Fetch decryption key (after validators reveal)
 * 7. Decrypt message
 * 
 * TODO: Currently SKIPPED because validators in the Docker image 
 * do not seem to automatically submit timelock shares.
 * Needs investigation into validator node configuration or feature flags.
 */
describe.skip.sequential("E2E: Timelock Round Trip", () => {
    let testnet: DockerTestnet;
    let aptos: Aptos;
    let client: TimelockClient;
    let sender: Ed25519Account;

    beforeAll(async () => {
        // Start 4 validators
        testnet = await DockerTestnet.new(4);
        
        // Setup Aptos client pointing to validator 0
        const config = new AptosConfig({
            network: Network.CUSTOM,
            fullnode: "http://127.0.0.1:8080/v1",
        });
        aptos = new Aptos(config);
        client = new TimelockClient(aptos);

        // Bootstrap validators with funds (in case they need it for txns)
        await testnet.bootstrapValidators();

        // Fund an account
        sender = Ed25519Account.generate();
        await testnet.faucet(sender.accountAddress.toString(), 100_000_000n);
    }, 300000);

    afterAll(async () => {
        await testnet.teardown();
    }, 60000);

    it("should complete encryption and decryption cycle", async () => {
        // 1. Get MPK
        let mpk;
        for(let i=0; i<30; i++) {
            try {
                mpk = await client.getMpk();
                const info = await aptos.getLedgerInfo();
                console.log(`Current Epoch: ${info.epoch}`);
                break;
            } catch(_e) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        expect(mpk).toBeDefined();
        console.log("MPK fetched");

        // 2. Register Timelock (10s future)
        const now = Date.now();
        const deadlineUs = BigInt(now * 1000) + 10_000_000n; // +10s
        
        const txn = await aptos.transaction.build.simple({
            sender: sender.accountAddress,
            data: {
                function: "0x1::ibe_config::register_timelock",
                functionArguments: [deadlineUs.toString()]
            }
        });
        
        const committedTxn = await aptos.signAndSubmitTransaction({
            signer: sender,
            transaction: txn
        });
        
        const txnResponse = await aptos.waitForTransaction({ transactionHash: committedTxn.hash });
        const event = (txnResponse as any).events.find((e: any) => e.type === "0x1::ibe_config::TimelockRegistrationEvent");
        
        expect(event).toBeDefined();
        const timelockId = BigInt(event!.data.timelock_id);
        console.log(`Registered timelock ${timelockId} with deadline ${deadlineUs}`);

        // 3. Encrypt
        const message = new TextEncoder().encode("Secret Bid: 1000 BTC");
        const ciphertext = await client.encrypt(timelockId, deadlineUs, message);
        console.log("Message encrypted");

        // 4. Wait for Reveal
        console.log("Waiting for decryption...");
        // This will throw if validators don't reveal
        const _dk = await client.waitForDecryption(timelockId, 1000, 30000); 
        console.log("Decryption key revealed");

        // 5. Decrypt
        const plaintext = await client.decrypt(timelockId, ciphertext);
        const decoded = new TextDecoder().decode(plaintext);
        
        expect(decoded).toBe("Secret Bid: 1000 BTC");
    }, 120000);
});
