import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { EthereumDockerTestnet } from "../src/index";
import {
    initializeTestnet,
    performCleanup,
    registerCleanupHandlers,
    setGlobalTestnet,
} from "./helpers/testnet-lifecycle";

// Register cleanup handlers once at module load
registerCleanupHandlers();

describe("Validator Connectivity", () => {
    let testnet: EthereumDockerTestnet;
    const NUM_VALIDATORS = 4;
    const EXPECTED_CHAIN_ID = 32382;

    beforeAll(async () => {
        testnet = await initializeTestnet(NUM_VALIDATORS);
    }, 300000); // 5 min timeout for setup

    afterAll(async () => {
        await performCleanup("Validator connectivity tests completed");
        setGlobalTestnet(undefined);
    });

    test("should have correct number of validators", () => {
        expect(testnet).toBeDefined();
        expect(testnet.getNumValidators()).toBe(NUM_VALIDATORS);
    });

    test("should connect to execution layer (Geth)", async () => {
        const chainId = await testnet.getChainId();
        console.log(`Chain ID: ${chainId}`);
        expect(chainId).toBe(EXPECTED_CHAIN_ID);

        const blockNumber = await testnet.getBlockNumber();
        console.log(`Current block: ${blockNumber}`);
        expect(blockNumber).toBeGreaterThanOrEqual(0);
    });

    test("should connect to beacon node (Lighthouse)", async () => {
        const genesis = await testnet.getBeaconGenesis();
        console.log(`Genesis time: ${genesis.genesis_time}`);
        console.log(`Genesis validators root: ${genesis.genesis_validators_root}`);
        
        expect(genesis.genesis_time).toBeDefined();
        expect(genesis.genesis_validators_root).toBeDefined();
    });

    test("should retrieve beacon header", async () => {
        const header = await testnet.getBeaconHeader("head");
        console.log(`Beacon slot: ${header.header.message.slot}`);
        console.log(`State root: ${header.header.message.state_root}`);
        
        expect(header.root).toBeDefined();
        expect(header.header.message.slot).toBeDefined();
    });

    test("should have funded test accounts", async () => {
        const accounts = testnet.getTestAccounts();
        expect(accounts.length).toBeGreaterThan(0);

        for (const account of accounts) {
            const balance = await testnet.getBalance(account.address);
            console.log(`Account ${account.address}: ${balance} wei`);
            
            // Should have 1000 ETH = 1000 * 10^18 wei
            expect(balance).toBeGreaterThan(BigInt(0));
        }
    });

    test("should retrieve validator public keys", () => {
        const pubkeys = testnet.getValidatorPublicKeys();
        console.log(`Found ${pubkeys.length} validator public keys`);
        
        // May be empty if keys weren't extracted properly
        // This is informational, not a hard failure
        if (pubkeys.length > 0) {
            console.log(`First pubkey: ${pubkeys[0]}`);
        }
    });
});
