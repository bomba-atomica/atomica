
import { createWalletClient, createPublicClient, http, formatEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import { initLightClient, syncLightClient, type LightClientConfig } from "../src/beacon/cli";
import { fetchProof, fetchBlockTransactions, fetchBlockReceipts } from "../src/fetcher";
import { verifyAccountProof } from "../src/verifier";
import { verifyTransactionProof } from "../src/transaction";
import { verifyReceiptProof } from "../src/receipt";

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
        statePath: "./light-client-state.json"
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

    // 3. Verify Account State
    console.log("\n🔍 Verifying Account State...");
    try {
        const proof = await fetchProof(rpcUrl, targetAddress, [], targetBlockNumber);
        
        // Ensure we use the trusted root for the SPECIFIC block we are verifying
        // The Light Client state tracks the *latest* trusted header.
        // If we just synced, state.header is likely the head.
        // If targetBlockNumber != state.header.execution.blockNumber, we have a mismatch.
        // However, for this demo, if we sent a tx, we synced up to it.
        // If we didn't, we used state.header.blockNumber.
        // So they should match.
        
        if (state.header.execution.blockNumber !== targetBlockNumber) {
            console.warn(`⚠️  Warning: Light client head (${state.header.execution.blockNumber}) != Target block (${targetBlockNumber})`);
            // We can't cryptographically verify an old block with just the latest light client header
            // unless we had historical roots.
            // But if we synced PAST it, maybe we have it in history? 
            // Our minimal light client state implementation only stores current head.
            // So we must rely on the fact that we synced TO this block.
        }

        const trustedRoot = state.header.execution.stateRoot;
        
        const result = await verifyAccountProof(proof.accountProof, trustedRoot, targetAddress);
        
        if (result.valid && result.accountState) {
            console.log("   ✅ Account Proof Verified!");
            console.log(`   Nonce: ${result.accountState.nonce}`);
            console.log(`   Balance: ${formatEther(result.accountState.balance)} ETH`);
            console.log(`   Storage Hash: ${result.accountState.storageHash}`);
        } else {
            console.error("   ❌ Account Verification Failed:", result.error);
        }

    } catch (e) {
        console.error("   ❌ Verification Error:", e);
    }

    // 4. Verify Transaction (if available)
    if (targetTxHash) {
        console.log("\n🔍 Verifying Transaction Inclusion...");
        try {
            const txs = await fetchBlockTransactions(rpcUrl, targetBlockNumber);
            const targetTx = txs.find(tx => tx.hash === targetTxHash);
            
            if (!targetTx) throw new Error("Tx not found in block");
            
            const trustedTxRoot = state.header.execution.transactionsRoot;
            
            const isValid = await verifyTransactionProof(targetTx, { transactionsRoot: trustedTxRoot } as any, txs);
            
            if (isValid) {
                console.log("   ✅ Transaction Inclusion Verified!");
                console.log(`   Tx Hash: ${targetTxHash}`);
                console.log(`   In Block: ${targetBlockNumber}`);
            } else {
                console.error("   ❌ Tx Verification Failed: Root mismatch");
            }
            
        } catch (e) {
             console.error("   ❌ Tx Verification Error:", e);
        }

        console.log("\n🔍 Verifying Receipt Inclusion...");
        try {
            const receipts = await fetchBlockReceipts(rpcUrl, targetBlockNumber);
            const targetReceipt = receipts.find(r => r.transactionHash === targetTxHash);

            if (!targetReceipt) throw new Error("Receipt not found");

            const trustedReceiptsRoot = state.header.execution.receiptsRoot;

            const isValid = await verifyReceiptProof(targetReceipt, { receiptsRoot: trustedReceiptsRoot } as any, receipts);

            if (isValid) {
                console.log("   ✅ Receipt Inclusion Verified!");
                console.log(`   Status: ${targetReceipt.status === '0x1' ? 'Success' : 'Failure'}`);
                console.log(`   Gas Used: ${BigInt(targetReceipt.gasUsed)}`);
            } else {
                console.error("   ❌ Receipt Verification Failed: Root mismatch");
            }

        } catch (e) {
            console.error("   ❌ Receipt Verification Error:", e);
        }
    }
}

main();
