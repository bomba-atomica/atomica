
import { createWalletClient, createPublicClient, http, formatEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { initLightClient, syncLightClient, type LightClientConfig } from "../src/beacon/cli";
import { fetchProof, fetchBlockTransactions } from "../src/fetcher";
import { verifyAccountProof } from "../src/verifier";
import { verifyTransactionProof } from "../src/transaction";

async function main() {
    console.log("🚀 Ethereum State Verification - Sepolia Demo");
    console.log("---------------------------------------------");

    const rpcUrl = process.env.SEPOLIA_RPC_URL || "https://gateway.tenderly.co/public/sepolia";
    const beaconUrl = process.env.BEACON_API_URL || "https://lodestar-sepolia.chainsafe.io";
    const privateKey = process.env.PRIVATE_KEY;

    console.log(`📡 Using Execution RPC: ${rpcUrl}`);
    console.log(`📡 Using Beacon API:    ${beaconUrl}`);

    // 1. Initialize Light Client
    console.log(`\n📡 Connecting to Beacon Node: ${beaconUrl}`);
    
    // Fetch latest finalized checkpoint root for bootstrap
    let checkpointRoot = process.env.CHECKPOINT_ROOT;
    if (!checkpointRoot) {
        try {
            const resp = await fetch(`${beaconUrl}/eth/v1/beacon/blocks/finalized/root`);
            const data = await resp.json() as any;
            checkpointRoot = data.data.root;
            console.log(`   Fetched latest finalized block root: ${checkpointRoot}`);
        } catch (e) {
            console.warn("   Failed to fetch finalized checkpoint root, using default.");
        }
    }

    const config: LightClientConfig = {
        beaconApiUrl: beaconUrl,
        chain: "sepolia",
        checkpointRoot,
        verbose: false, // We'll handle logging
        persist: false // Keep state in memory only
    };

    let state;
    try {
        console.log("   Initializing light client (this may take a moment to fetch bootstrap)...");
        state = await initLightClient(config);
        if (!state) throw new Error("Initialization failed");
        
        console.log("   Syncing to head...");
        state = await syncLightClient(state, config);
    } catch (e) {
        console.error("❌ Light Client Sync Failed:", e);
        console.error("   Ensure your BEACON_API_URL supports light client endpoints.");
        process.exit(1);
    }

    const header = state.header.execution;
    const beaconSlot = state.header.beacon.slot;
    console.log(`✅ Light Client Synced!`);
    console.log(`   Beacon Slot:       ${beaconSlot}`);
    console.log(`   Execution Block:   ${header.blockNumber}`);
    console.log(`   Trusted State Root: ${header.stateRoot.slice(0, 10)}...${header.stateRoot.slice(-8)}`);

    const client = createPublicClient({
        chain: sepolia,
        transport: http(rpcUrl)
    });

    let targetTxHash: Hex | undefined;
    let targetAddress: Hex;
    let targetBlockNumber: number = header.blockNumber;

    // 2. Perform or Select Transaction
    if (privateKey) {
        console.log("\n💸 Sending Transaction...");
        const account = privateKeyToAccount(privateKey as Hex);
        const wallet = createWalletClient({
            account,
            chain: sepolia,
            transport: http(rpcUrl)
        });

        targetAddress = account.address;
        
        try {
            const hash = await wallet.sendTransaction({
                to: account.address, // Self-transfer
                value: 0n, // 0 ETH to save gas/funds
                chain: sepolia
            });
            console.log(`   Tx Sent: ${hash}`);
            console.log("   Waiting for confirmation...");
            
            const receipt = await client.waitForTransactionReceipt({ hash });
            console.log(`   Mined in Block: ${receipt.blockNumber}`);
            
            targetTxHash = hash;
            targetBlockNumber = Number(receipt.blockNumber);
            
            console.log("   Waiting for Light Client to catch up to execution block...");
            
            // Poll until light client execution header >= mined block
            let attempts = 0;
            while (state.header.execution.blockNumber < targetBlockNumber) {
                if (attempts++ > 30) { // Timeout after ~6 mins
                    throw new Error("Light client sync timed out waiting for block");
                }
                process.stdout.write(".");
                await new Promise(r => setTimeout(r, 12000)); // Wait a slot (12s)
                state = await syncLightClient(state, config);
            }
            console.log("\n   Light Client caught up!");
            
        } catch (e) {
            console.error("❌ Transaction failed:", e);
            process.exit(1);
        }
    } else {
        console.log("\nℹ️  No PRIVATE_KEY provided. Verifying existing state.");
        // Use fee recipient as target address
        targetAddress = header.feeRecipient as Hex;
        console.log(`   Verifying Account: ${targetAddress} (Fee Recipient)`);
        console.log(`   At Block: ${targetBlockNumber}`);
    }

    // 3. Refresh Loop
    console.log("\n🚀 Starting 60s Refresh Loop (10s intervals)...");
    const demoStartTime = Date.now();
    let iteration = 1;

    while (Date.now() - demoStartTime < 60000) {
        console.log(`\n--- Refresh #${iteration} (${Math.round((Date.now() - demoStartTime) / 1000)}s elapsed) ---`);
        
        try {
            // Sync to latest
            state = await syncLightClient(state, config);
            const currentBlock = state.header.execution.blockNumber;
            console.log(`📡 Light Client Head: Block ${currentBlock}, Slot ${state.header.beacon.slot}`);

            // 4. Verify Account State
            console.log("🔍 Verifying Account State...");
            
            // If we sent a tx, we might want to verify state at that block
            // Otherwise verify at current head
            const verifyBlock = targetTxHash ? targetBlockNumber : currentBlock;
            
            if (currentBlock < verifyBlock) {
                console.log(`   Waiting for Light Client to reach target block ${verifyBlock}...`);
            } else {
                const proof = await fetchProof(rpcUrl, targetAddress, [], verifyBlock);

                // For the demo, we use the root we have if it matches, or we warn
                const rootToUse = (verifyBlock === currentBlock) 
                    ? state.header.execution.stateRoot
                    : state.header.execution.stateRoot; // Fallback for demo simplicity
                
                if (verifyBlock !== currentBlock) {
                    console.warn(`   ⚠️ Verifying block ${verifyBlock} using LC root from ${currentBlock}`);
                }

                const result = await verifyAccountProof(proof.accountProof, rootToUse, targetAddress);
                
                if (result.valid && result.accountState) {
                    console.log("   ✅ Account Proof Verified!");
                    console.log(`   Balance: ${formatEther(result.accountState.balance)} ETH`);
                } else {
                    console.error("   ❌ Account Verification Failed:", result.error);
                }

                // 5. Verify Transaction (if available)
                if (targetTxHash && iteration === 1) {
                    // Only verify inclusion once to keep output clean, or every time?
                    // Let's verify it every time if it's ready
                    console.log("🔍 Verifying Transaction Inclusion...");
                    const txs = await fetchBlockTransactions(rpcUrl, verifyBlock);
                    const targetTx = txs.find(tx => tx.hash === targetTxHash);
                    
                    if (targetTx) {
                        const isValid = await verifyTransactionProof(targetTx, { transactionsRoot: state.header.execution.transactionsRoot } as any, txs);
                        if (isValid) console.log("   ✅ Transaction Inclusion Verified!");
                    }
                }
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

    console.log("\n✅ Sepolia Demo Completed!");
}

main();
