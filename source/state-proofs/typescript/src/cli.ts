#!/usr/bin/env node
/**
 * CLI tool for Ethereum state proof verification
 *
 * Commands:
 * - verify-account: Verify an account's state at a specific block
 * - verify-storage: Verify a storage slot value
 * - verify-transfer: Verify a transfer transaction
 *
 * Light Client Commands:
 * - light-client-init: Initialize light client from checkpoint
 * - light-client-status: Show current light client state
 */

import {
    fetchProof,
    fetchBlock,
    fetchBlockTransactions,
    fetchBlockReceipts,
    verifyAccountProof,
    verifyStorageProof,
    verifyTransactionProof,
    verifyReceiptProof,
    fetchTransaction,
    fetchTransactionReceipt,
} from "./index";

import { type Block } from "./types";

import {
    initLightClient,
    syncLightClient,
    verifyWithLightClient,
    type LightClientConfig,
} from "./beacon/cli";

interface CliArgs {
    command: string;
    args: string[];
    options: Record<string, string | boolean>;
}

/**
 * Parse command line arguments
 */
function parseArgs(argv: string[]): CliArgs {
    const command = argv[2];
    const args: string[] = [];
    const options: Record<string, string | boolean> = {};

    for (let i = 3; i < argv.length; i++) {
        const arg = argv[i];

        if (arg.startsWith("--")) {
            const key = arg.slice(2);
            const nextArg = argv[i + 1];

            if (nextArg && !nextArg.startsWith("--")) {
                options[key] = nextArg;
                i++; // Skip next arg
            } else {
                options[key] = true;
            }
        } else {
            args.push(arg);
        }
    }

    return { command, args, options };
}

/**
 * Display usage information
 */
function showUsage() {
    console.log(`
Ethereum State Proof Verifier CLI

USAGE:
  eth-verify <command> [arguments] [options]

COMMANDS:
  verify-account <address> <block>
      Verify an account's existence and state at a specific block

  verify-storage <address> <slot> <block>
      Verify a specific storage slot value

  verify-transfer <txHash>
      Verify a transfer transaction affected account states

  light-client-init [--beacon-rpc <url>] [--chain <mainnet|sepolia|holesky|local>]
      Initialize light client from beacon checkpoint

  light-client-sync [--beacon-rpc <url>] [--chain <mainnet|sepolia|holesky|local>]
      Sync light client to latest beacon state

  light-client-status
      Show current light client status

OPTIONS:
  --rpc <url>           Ethereum RPC endpoint (required for verify commands)
  --beacon-rpc <url>    Beacon API endpoint (required for light client commands)
  --chain <name>        Beacon chain: mainnet, sepolia, holesky, local (default: mainnet)
  --state-path <path>   Path to persist light client state
  --checkpoint <root>   Checkpoint block root for bootstrap
  --light-client        Use light client verified headers instead of RPC
  --json                Output as JSON instead of formatted table
  --verbose             Show detailed verification steps

EXAMPLES:
  # Verify account against mainnet
  eth-verify verify-account 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb 12345678 \\
    --rpc https://mainnet.infura.io/v3/YOUR_KEY

  # Verify against local node
  eth-verify verify-account 0x8943545177806ED17B9F23F0a21ee5948eCaa776 latest \\
    --rpc http://localhost:8545

  # Get JSON output
  eth-verify verify-account 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb latest \\
    --rpc https://mainnet.infura.io/v3/YOUR_KEY --json

  # Initialize light client
  eth-verify light-client-init --beacon-rpc https://beaconcha.in/api/v1 \\
    --chain mainnet --state-path ~/.eth-verify/light-client.json

  # Verify with light client (trustless mode)
  eth-verify verify-transfer 0x1234... \\
    --rpc https://mainnet.infura.io/v3/YOUR_KEY \\
    --beacon-rpc https://beaconcha.in/api/v1 \\
    --light-client --state-path ~/.eth-verify/light-client.json
`);
}

/**
 * Format wei balance to ETH
 */
function formatEth(wei: bigint): string {
    const eth = Number(wei) / 1e18;
    return eth.toFixed(6) + " ETH";
}

/**
 * Format address (shorten if needed)
 */
function formatAddress(address: string): string {
    return address;
}

/**
 * Verify account command
 */
async function verifyAccountCommand(args: CliArgs) {
    const [address, block] = args.args;
    const rpcUrl = args.options.rpc as string;

    if (!address || !block || !rpcUrl) {
        console.error("Error: Missing required arguments");
        console.error("Usage: eth-verify verify-account <address> <block> --rpc <url>");
        process.exit(1);
    }

    try {
        if (args.options.verbose) {
            console.log("Fetching proof from RPC...");
            console.log("  RPC:", rpcUrl);
            console.log("  Address:", address);
            console.log("  Block:", block);
        }

        // Fetch proof
        const proof = await fetchProof(rpcUrl, address, [], block);
        const blockData = await fetchBlock(rpcUrl, block);

        if (args.options.verbose) {
            console.log("✓ Proof fetched");
            console.log("  Proof nodes:", proof.accountProof.length);
            console.log("  State root:", blockData.stateRoot);
        }

        // Verify proof
        const result = await verifyAccountProof(proof.accountProof, blockData.stateRoot, address);

        // Output results
        if (args.options.json) {
            console.log(
                JSON.stringify(
                    {
                        valid: result.valid,
                        address,
                        block: blockData.number,
                        stateRoot: blockData.stateRoot,
                        accountState: result.accountState,
                        error: result.error,
                    },
                    null,
                    2,
                ),
            );
        } else {
            if (result.valid) {
                console.log("✓ Proof verified successfully\n");
                console.log(`Account: ${formatAddress(address)}`);
                console.log(`Block:   ${blockData.number}`);
                console.log(`State Root: ${blockData.stateRoot}\n`);

                if (result.accountState) {
                    console.log("Account State:");
                    console.log(`  Nonce:        ${result.accountState.nonce}`);
                    console.log(`  Balance:      ${formatEth(result.accountState.balance)}`);
                    console.log(`  Storage Hash: ${result.accountState.storageHash}`);
                    console.log(`  Code Hash:    ${result.accountState.codeHash}\n`);
                }

                console.log("Proof Details:");
                console.log(`  Proof Nodes:  ${proof.accountProof.length}`);
                console.log(`  Verification: PASSED ✓`);
            } else {
                console.log("✗ Proof verification failed\n");
                console.log(`Error: ${result.error}`);
                process.exit(1);
            }
        }
    } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

/**
 * Verify storage command
 */
async function verifyStorageCommand(args: CliArgs) {
    const [address, slot, block] = args.args;
    const rpcUrl = args.options.rpc as string;

    if (!address || !slot || !block || !rpcUrl) {
        console.error("Error: Missing required arguments");
        console.error("Usage: eth-verify verify-storage <address> <slot> <block> --rpc <url>");
        process.exit(1);
    }

    try {
        // Fetch proof with storage key
        const proof = await fetchProof(rpcUrl, address, [slot], block);
        const blockData = await fetchBlock(rpcUrl, block);

        // Get account state first
        const accountResult = await verifyAccountProof(
            proof.accountProof,
            blockData.stateRoot,
            address,
        );

        if (!accountResult.valid || !accountResult.accountState) {
            console.error("Error: Failed to verify account proof");
            process.exit(1);
        }

        // Verify storage proof
        const storageProofData = proof.storageProof.find((sp) => sp.key === slot);
        if (!storageProofData) {
            console.error("Error: Storage proof not found for slot", slot);
            process.exit(1);
        }

        const storageResult = await verifyStorageProof(
            storageProofData.proof,
            accountResult.accountState.storageHash,
            slot,
        );

        // Output results
        if (args.options.json) {
            console.log(
                JSON.stringify(
                    {
                        valid: storageResult.valid,
                        address,
                        slot,
                        value: storageResult.value,
                        block: blockData.number,
                        error: storageResult.error,
                    },
                    null,
                    2,
                ),
            );
        } else {
            if (storageResult.valid) {
                console.log("✓ Storage proof verified successfully\n");
                console.log(`Address: ${address}`);
                console.log(`Slot:    ${slot}`);
                console.log(`Value:   ${storageResult.value}`);
                console.log(`Block:   ${blockData.number}`);
            } else {
                console.log("✗ Storage proof verification failed\n");
                console.log(`Error: ${storageResult.error}`);
                process.exit(1);
            }
        }
    } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

/**
 * Verify transfer command
 */
async function verifyTransferCommand(args: CliArgs) {
    const [txHash] = args.args;
    const rpcUrl = args.options.rpc as string;
    const useLightClient = !!args.options["light-client"];

    if (!txHash || !rpcUrl) {
        console.error("Error: Missing required arguments");
        console.error("Usage: eth-verify verify-transfer <txHash> --rpc <url>");
        process.exit(1);
    }

    let trustedRoots: { stateRoot: string; transactionsRoot: string; receiptsRoot: string } | null =
        null;
    let lightClientVerified = false;
    let blockData: Block;

    try {
        if (args.options.verbose) {
            console.log("Fetching transaction details...");
            console.log("  RPC:", rpcUrl);
            console.log("  TxHash:", txHash);
            console.log(
                "  Light Client Mode:",
                useLightClient ? "Enabled" : "Disabled (RPC trust required)",
            );
        }

        // 1. Fetch receipt to get block number and status
        const receipt = await fetchTransactionReceipt(rpcUrl, txHash);

        if (args.options.verbose) {
            console.log("✓ Receipt fetched");
            console.log("  Block:", receipt.blockNumber);
            console.log("  Status:", receipt.status);
        }

        if (receipt.status !== "success") {
            console.warn("Warning: Transaction status is not success (reverted or pending)");
        }

        // 2. Fetch transaction to get value
        const tx = await fetchTransaction(rpcUrl, txHash);

        const blockNumber = receipt.blockNumber;
        const sender = receipt.from;
        const receiver = receipt.to;

        if (!receiver) {
            console.error(
                "Error: Contract creation transactions not supported for transfer verification",
            );
            process.exit(1);
        }

        // 3. Fetch Block for state root, transactionsRoot, receiptsRoot
        blockData = await fetchBlock(rpcUrl, blockNumber);

        if (args.options.verbose) {
            console.log("✓ Block header fetched");
            console.log("  Block Hash:      ", blockData.hash);
            console.log("  State Root:      ", blockData.stateRoot);
            console.log("  Transactions Root:", blockData.transactionsRoot);
            console.log("  Receipts Root:   ", blockData.receiptsRoot);
        }

        // 3a. Light Client Verification (if enabled)
        if (useLightClient) {
            if (args.options.verbose) {
                console.log("\n[Light Client] Verifying block header...");
            }

            const beaconApiUrl = args.options["beacon-rpc"] as string;
            const chain = (args.options.chain as string) || "mainnet";
            const statePath = args.options["state-path"] as string;

            if (!beaconApiUrl) {
                console.error("Error: --beacon-rpc required when --light-client is enabled");
                process.exit(1);
            }

            const lcConfig: LightClientConfig = {
                beaconApiUrl,
                chain,
                statePath,
                verbose: !!args.options.verbose,
            };

            const lcResult = await verifyWithLightClient(blockData.hash, lcConfig);

            if (!lcResult.valid) {
                console.error(`\n✗ Light client verification failed: ${lcResult.error}`);
                console.log("\nFalling back to RPC-based verification...");
            } else {
                trustedRoots = lcResult.roots;
                lightClientVerified = true;

                if (args.options.verbose) {
                    console.log("\n[Light Client] ✓ Block header verified by sync committee");
                    if (trustedRoots) {
                        console.log(
                            "  Trusted State Root:      ",
                            trustedRoots.stateRoot.slice(0, 30) + "...",
                        );
                        console.log(
                            "  Trusted TransactionsRoot:",
                            trustedRoots.transactionsRoot.slice(0, 30) + "...",
                        );
                        console.log(
                            "  Trusted ReceiptsRoot:    ",
                            trustedRoots.receiptsRoot.slice(0, 30) + "...",
                        );
                    }
                }
            }
        }

        console.log(`Verifying transfer in block ${blockNumber}...`);

        if (lightClientVerified) {
            console.log("  Mode: Light Client Verified (trustless)");
        } else {
            console.log("  Mode: RPC Trust Required");
        }

        // 4. Fetch all transactions and receipts in the block for MPT reconstruction
        if (args.options.verbose) {
            console.log("\nFetching all transactions and receipts for MPT verification...");
        }
        const allTxs = await fetchBlockTransactions(rpcUrl, blockNumber);
        const allReceipts = await fetchBlockReceipts(rpcUrl, blockNumber);

        if (args.options.verbose) {
            console.log(`  Transactions in block: ${allTxs.length}`);
            console.log(`  Receipts in block: ${allReceipts.length}`);
        }

        // 5. Verify Transaction Inclusion Proof
        if (args.options.verbose) {
            console.log("\nVerifying transaction inclusion in transactions trie...");
        }
        const targetTx = allTxs.find((t) => t.hash.toLowerCase() === txHash.toLowerCase());
        if (!targetTx) {
            console.error("Error: Transaction not found in block");
            process.exit(1);
        }

        // Use light client transactions root if verified
        const txBlockData = trustedRoots
            ? { ...blockData, transactionsRoot: trustedRoots.transactionsRoot }
            : blockData;
        const txVerified = await verifyTransactionProof(targetTx, txBlockData, allTxs);

        if (args.options.verbose) {
            console.log(
                `  Transaction ${txHash.slice(0, 10)}... verification: ${txVerified ? "PASSED ✓" : "FAILED ✗"}`,
            );
        }

        // 6. Verify Receipt Inclusion Proof
        if (args.options.verbose) {
            console.log("Verifying receipt inclusion in receipts trie...");
        }
        const targetReceipt = allReceipts.find(
            (r) => r.transactionHash.toLowerCase() === txHash.toLowerCase(),
        );
        if (!targetReceipt) {
            console.error("Error: Receipt not found in block");
            process.exit(1);
        }

        // Use light client receipts root if verified
        const rcptBlockData = trustedRoots
            ? { ...blockData, receiptsRoot: trustedRoots.receiptsRoot }
            : blockData;
        const receiptVerified = await verifyReceiptProof(targetReceipt, rcptBlockData, allReceipts);

        if (args.options.verbose) {
            console.log(`  Receipt verification: ${receiptVerified ? "PASSED ✓" : "FAILED ✗"}`);
        }

        // 7. Verify Sender State
        if (args.options.verbose) console.log(`\nVerifying sender state: ${sender}`);
        const senderProof = await fetchProof(rpcUrl, sender, [], blockNumber);

        // Use light client state root if verified
        const senderBlockData = trustedRoots
            ? { ...blockData, stateRoot: trustedRoots.stateRoot }
            : blockData;
        const senderResult = await verifyAccountProof(
            senderProof.accountProof,
            senderBlockData.stateRoot,
            sender,
        );

        // 8. Verify Receiver State
        if (args.options.verbose) console.log(`Verifying receiver state: ${receiver}`);
        const receiverProof = await fetchProof(rpcUrl, receiver, [], blockNumber);
        const receiverResult = await verifyAccountProof(
            receiverProof.accountProof,
            senderBlockData.stateRoot,
            receiver,
        );

        // Output Results
        if (args.options.json) {
            console.log(
                JSON.stringify(
                    {
                        valid:
                            senderResult.valid &&
                            receiverResult.valid &&
                            txVerified &&
                            receiptVerified,
                        lightClientVerified,
                        transaction: {
                            hash: txHash,
                            block: blockNumber.toString(),
                            from: sender,
                            to: receiver,
                            value: tx.value.toString(),
                            verified: txVerified,
                        },
                        receipt: {
                            verified: receiptVerified,
                            status: receipt.status,
                        },
                        sender: {
                            address: sender,
                            valid: senderResult.valid,
                            balance: senderResult.accountState?.balance.toString(),
                            nonce: senderResult.accountState?.nonce,
                        },
                        receiver: {
                            address: receiver,
                            valid: receiverResult.valid,
                            balance: receiverResult.accountState?.balance.toString(),
                            nonce: receiverResult.accountState?.nonce,
                        },
                        trustedStateRoots: trustedRoots ?? undefined,
                    },
                    null,
                    2,
                ),
            );
        } else {
            console.log("\n============================================");
            console.log("TRANSFER VERIFICATION REPORT");
            console.log("============================================");
            console.log(`Transaction: ${txHash}`);
            console.log(`Block:       ${blockNumber}`);
            console.log(`Value:       ${formatEth(tx.value)}`);

            if (lightClientVerified) {
                console.log("--------------------------------------------");
                console.log("VERIFICATION MODE: Light Client (Trustless) ✓");
                console.log("  Block header verified by beacon chain sync committee");
                console.log("  State roots cryptographically authenticated");
            } else {
                console.log("--------------------------------------------");
                console.log("VERIFICATION MODE: RPC-Based (Requires Trusted RPC)");
            }
            console.log("--------------------------------------------");

            console.log("PROOF VERIFICATION SUMMARY:");
            console.log(`  Transaction: ${txVerified ? "✓ VERIFIED" : "✗ FAILED"}`);
            console.log(`  Receipt:     ${receiptVerified ? "✓ VERIFIED" : "✗ FAILED"}`);

            console.log("--------------------------------------------");
            console.log(`SENDER:   ${sender}`);
            if (senderResult.valid && senderResult.accountState) {
                console.log(`  State:  VERIFIED ✓`);
                console.log(`  Nonce:  ${senderResult.accountState.nonce}`);
                console.log(`  Bal:    ${formatEth(senderResult.accountState.balance)}`);
            } else {
                console.log(`  State:  FAILED ✗`);
                console.log(`  Error:  ${senderResult.error}`);
            }

            console.log("--------------------------------------------");

            console.log(`RECEIVER: ${receiver}`);
            if (receiverResult.valid && receiverResult.accountState) {
                console.log(`  State:  VERIFIED ✓`);
                console.log(`  Nonce:  ${receiverResult.accountState.nonce}`);
                console.log(`  Bal:    ${formatEth(receiverResult.accountState.balance)}`);
            } else {
                console.log(`  State:  FAILED ✗`);
                console.log(`  Error:  ${receiverResult.error}`);
            }
            console.log("============================================");

            const allVerified =
                senderResult.valid && receiverResult.valid && txVerified && receiptVerified;
            if (allVerified) {
                console.log("\n✓ Transfer verified: All proofs cryptographically valid.");
            } else {
                console.error("\n✗ Verification failed.");
                process.exit(1);
            }
        }
    } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

/**
 * Build light client config from CLI args
 */
function getLightClientConfig(args: CliArgs): LightClientConfig {
    const beaconApiUrl = args.options["beacon-rpc"] as string;
    const chain = (args.options.chain as string) || "mainnet";
    const statePath = args.options["state-path"] as string;
    const checkpointRoot = args.options.checkpoint as string;

    if (!beaconApiUrl) {
        console.error("Error: --beacon-rpc required for light client commands");
        process.exit(1);
    }

    return {
        beaconApiUrl,
        chain,
        statePath,
        checkpointRoot,
        verbose: !!args.options.verbose,
    };
}

/**
 * Light client init command
 */
async function lightClientInitCommand(args: CliArgs) {
    const config = getLightClientConfig(args);

    try {
        console.log(`Initializing light client for ${config.chain}...`);
        console.log(`Beacon API: ${config.beaconApiUrl}`);

        const state = await initLightClient(config);

        if (state) {
            console.log("\n✓ Light client initialized successfully");
            console.log(`  Current slot: ${state.header.beacon.slot}`);
            console.log(`  Current period: ${state.period}`);
            console.log(`  Finalized: ${state.finalizedHeader ? "Yes" : "No"}`);

            if (config.statePath) {
                console.log(`\nState saved to: ${config.statePath}`);
            }
        } else {
            console.error("Failed to initialize light client");
            process.exit(1);
        }
    } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

/**
 * Light client sync command
 */
async function lightClientSyncCommand(args: CliArgs) {
    const config = getLightClientConfig(args);

    if (!config.statePath) {
        console.error("Error: --state-path required for sync (state must be initialized first)");
        process.exit(1);
    }

    try {
        console.log(`Syncing light client for ${config.chain}...`);
        console.log(`Beacon API: ${config.beaconApiUrl}`);

        const state = await initLightClient(config);

        if (!state) {
            console.error("Light client not initialized. Run 'light-client-init' first.");
            process.exit(1);
        }

        const syncedState = await syncLightClient(state, config);

        console.log("\n✓ Light client synced successfully");
        console.log(`  Current slot: ${syncedState.header.beacon.slot}`);
        console.log(`  Current period: ${syncedState.period}`);
        console.log(`  Finalized: ${syncedState.finalizedHeader ? "Yes" : "No"}`);
    } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

/**
 * Light client status command
 */
async function lightClientStatusCommand(args: CliArgs) {
    const chain = (args.options.chain as string) || "mainnet";

    try {
        const { loadState } = await import("./beacon/state");
        const { getTrustedStateRoots } = await import("./beacon/sync");
        const store = await loadState();

        if (!store || !store.state.header) {
            console.log("Light client state not found.");
            console.log("Run 'light-client-init' to initialize.");
            process.exit(0);
        }

        const state = store.state;

        console.log("Light Client Status");
        console.log("===================");
        console.log(`Chain:        ${chain}`);
        console.log(`Current Slot: ${state.header.beacon.slot}`);
        console.log(`Period:       ${state.period}`);
        console.log(`Finalized:    ${state.finalizedHeader ? "Yes" : "No"}`);

        if (state.finalizedHeader) {
            console.log(`Finalized Slot: ${state.finalizedHeader.beacon.slot}`);
        }

        const roots = getTrustedStateRoots(state);
        if (roots) {
            console.log("\nTrusted State Roots:");
            console.log(`  State Root:      ${roots.stateRoot.slice(0, 20)}...`);
            console.log(`  Transactions:    ${roots.transactionsRoot.slice(0, 20)}...`);
            console.log(`  Receipts:        ${roots.receiptsRoot.slice(0, 20)}...`);
        }
    } catch (error) {
        console.error("Error:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

/**
 * Main CLI entry point
 */
async function main() {
    const args = parseArgs(process.argv);

    if (!args.command || args.command === "help" || args.command === "--help") {
        showUsage();
        process.exit(0);
    }

    switch (args.command) {
        case "verify-account":
            await verifyAccountCommand(args);
            break;
        case "verify-storage":
            await verifyStorageCommand(args);
            break;
        case "verify-transfer":
            await verifyTransferCommand(args);
            break;
        case "light-client-init":
            await lightClientInitCommand(args);
            break;
        case "light-client-sync":
            await lightClientSyncCommand(args);
            break;
        case "light-client-status":
            await lightClientStatusCommand(args);
            break;
        default:
            console.error(`Unknown command: ${args.command}`);
            showUsage();
            process.exit(1);
    }
}

// Run CLI if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch((error) => {
        console.error("Fatal error:", error);
        process.exit(1);
    });
}
