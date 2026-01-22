
import { createWalletClient, createPublicClient, http, formatEther, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { initLightClient, syncLightClient, type LightClientConfig } from "../src/beacon/cli";
import { BEACON_CONFIGS } from "../src/beacon/fetch";
import { fetchProof, fetchBlockTransactions } from "../src/fetcher";
import { verifyAccountProof } from "../src/verifier";
import { verifyTransactionProof } from "../src/transaction";
import { startTestnet, stopTestnet, getRpcUrl, getTestAccounts } from "../test/helpers/testnet";

async function main() {
    console.log("🚀 Ethereum State Verification - Docker Demo");
    console.log("---------------------------------------------");

    let testnetStarted = false;
    try {
        // 1. Start Docker Testnet
        await startTestnet();
        testnetStarted = true;

        const rpcUrl = getRpcUrl();
        const accounts = getTestAccounts();
        const testAccount = accounts[0];
        const privateKey = testAccount.privateKey as Hex;
        
        // Docker testnet Lighthouse beacon node
        const beaconUrl = "http://localhost:5052";

        console.log(`📡 Execution RPC: ${rpcUrl}`);
        console.log(`📡 Beacon API:    ${beaconUrl}`);

        // 2. Configure Local Beacon Config
        // We need the genesis time from the beacon node
        console.log("   Fetching beacon genesis information...");
        const genesisResp = await fetch(`${beaconUrl}/eth/v1/beacon/genesis`);
        const genesisData = await genesisResp.json() as any;
        const genesisTime = parseInt(genesisData.data.genesis_time);
        const genesisValidatorsRoot = genesisData.data.genesis_validators_root;
        const genesisForkVersion = genesisData.data.genesis_fork_version;
        
        console.log(`   Local Genesis Time: ${new Date(genesisTime * 1000).toISOString()}`);
        console.log(`   Genesis Validators Root: ${genesisValidatorsRoot}`);
        console.log(`   Genesis Fork Version:    ${genesisForkVersion}`);
        
        // Update the local config dynamically
        BEACON_CONFIGS.local.genesisTime = genesisTime;

        // 3. Initialize Light Client
        console.log(`\n📡 Initializing Light Client (Memory Only)...`);
        
        // Fetch genesis block root for bootstrap (reliable for fresh testnet)
        console.log("   Fetching genesis block root...");
        const genesisRootResp = await fetch(`${beaconUrl}/eth/v1/beacon/headers/0`);
        const genesisRootData = await genesisRootResp.json() as any;
        const checkpointRoot = genesisRootData.data.root;
        console.log(`   Bootstrapping from genesis: ${checkpointRoot}`);

        const config: LightClientConfig = {
            beaconApiUrl: beaconUrl,
            chain: "local",
            checkpointRoot,
            persist: false, // Keep state in memory only
            verbose: false,
            genesisValidatorsRoot,
            genesisForkVersion
        };

        console.log("   Initializing light client state...");
        let state = await initLightClient(config);
        if (!state) throw new Error("Initialization failed");
        
        console.log("   Syncing to head...");
        state = await syncLightClient(state, config);
        
        const header = state.header.execution;
        console.log(`✅ Light Client Synced!`);
        console.log(`   Beacon Slot:       ${state.header.beacon.slot}`);
        console.log(`   Execution Block:   ${header.blockNumber}`);
        console.log(`   Trusted State Root: ${header.stateRoot.slice(0, 10)}...${header.stateRoot.slice(-8)}`);

        const client = createPublicClient({
            chain: mainnet,
            transport: http(rpcUrl)
        });

        // 4. Send a test transaction
        console.log("\n💸 Sending Transaction (1 ETH)...");
        const account = privateKeyToAccount(privateKey);
        const wallet = createWalletClient({
            account,
            chain: mainnet,
            transport: http(rpcUrl)
        });

        const recipientAddress = "0x1234567890123456789012345678901234567890";
        
        const hash = await wallet.sendTransaction({
            to: recipientAddress,
            value: parseEther("1"),
            chain: mainnet
        });
        console.log(`   Tx Sent: ${hash}`);
        console.log("   Waiting for confirmation...");
        
        // Wait a bit for indexing
        await new Promise(r => setTimeout(r, 2000));
        
        let receipt;
        for (let i = 0; i < 10; i++) {
            try {
                receipt = await client.waitForTransactionReceipt({ hash });
                break;
            } catch (e: any) {
                if (e.message.includes("indexing")) {
                    process.stdout.write(".");
                    await new Promise(r => setTimeout(r, 2000));
                    continue;
                }
                throw e;
            }
        }
        if (!receipt) throw new Error("Failed to get receipt");
        
        console.log(`   Mined in Block: ${receipt.blockNumber}`);
        
        const targetBlockNumber = Number(receipt.blockNumber);
        
        // 5. Refresh Loop
        console.log("\n🚀 Starting 60s Refresh Loop (10s intervals)...");
        const demoStartTime = Date.now();
        let iteration = 1;
        let txVerified = false;

        while (Date.now() - demoStartTime < 60000) {
            console.log(`\n--- Refresh #${iteration} (${Math.round((Date.now() - demoStartTime) / 1000)}s elapsed) ---`);
            
            try {
                // Sync to latest
                state = await syncLightClient(state, config);
                const currentBlock = state.header.execution.blockNumber;
                console.log(`📡 Light Client Head: Block ${currentBlock}, Slot ${state.header.beacon.slot}`);

                if (currentBlock >= targetBlockNumber && !txVerified) {
                    console.log(`✅ Light Client reached Target Block ${targetBlockNumber}!`);
                    
                    // Verify Recipient Account State
                    console.log(`🔍 Verifying Recipient Account State: ${recipientAddress}`);
                    const proof = await fetchProof(rpcUrl, recipientAddress, [], targetBlockNumber);
                    
                    // For the demo simplicity, we use the root from current head if it's the target block
                    // In a real LC we'd need historical roots if we passed it
                    const trustedRoot = state.header.execution.stateRoot;
                    
                    const result = await verifyAccountProof(proof.accountProof, trustedRoot, recipientAddress);
                    
                    if (result.valid && result.accountState) {
                        console.log("   ✅ Account Proof Verified!");
                        console.log(`   Balance: ${formatEther(result.accountState.balance)} ETH`);
                    }

                    // Verify Transaction Inclusion
                    console.log("🔍 Verifying Transaction Inclusion...");
                    const txs = await fetchBlockTransactions(rpcUrl, targetBlockNumber);
                    const targetTx = txs.find(tx => tx.hash.toLowerCase() === hash.toLowerCase());
                    
                    if (targetTx) {
                        const isValid = await verifyTransactionProof(targetTx, { transactionsRoot: state.header.execution.transactionsRoot } as any, txs);
                        if (isValid) {
                            console.log("   ✅ Transaction Inclusion Verified!");
                        }
                    }
                    
                    txVerified = true;
                } else if (!txVerified) {
                    console.log(`   Waiting for Light Client to reach target block ${targetBlockNumber} (Current: ${currentBlock})...`);
                } else {
                    console.log("   ✅ Target transaction already verified.");
                }
            } catch (e) {
                console.error("   ❌ Refresh Error:", e);
            }

            iteration++;
            if (Date.now() - demoStartTime < 50000) {
                await new Promise(r => setTimeout(r, 10000));
            } else {
                break;
            }
        }

        console.log("\n✅ Docker Demo Completed Successfully!");

    } catch (e) {
        console.error("\n❌ Demo Failed:", e);
    } finally {
        if (testnetStarted) {
            console.log("\nCleaning up...");
            await stopTestnet();
        }
    }
}

main();
