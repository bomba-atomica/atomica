#!/usr/bin/env node
/**
 * CLI tool for Ethereum state proof verification
 *
 * Commands:
 * - verify-account: Verify an account's state at a specific block
 * - verify-storage: Verify a storage slot value
 * - verify-transfer: Verify a transfer transaction
 */

import { fetchProof, fetchBlock, verifyAccountProof, verifyStorageProof, fetchTransaction, fetchTransactionReceipt } from "./index";

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

OPTIONS:
  --rpc <url>       Ethereum RPC endpoint (required)
  --json            Output as JSON instead of formatted table
  --verbose         Show detailed verification steps

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

    if (!txHash || !rpcUrl) {
        console.error("Error: Missing required arguments");
        console.error("Usage: eth-verify verify-transfer <txHash> --rpc <url>");
        process.exit(1);
    }

    try {
        if (args.options.verbose) {
            console.log("Fetching transaction details...");
            console.log("  RPC:", rpcUrl);
            console.log("  TxHash:", txHash);
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

        // 2. Fetch transaction to get value (optional, but good for context)
        const tx = await fetchTransaction(rpcUrl, txHash);
        
        const blockNumber = receipt.blockNumber;
        const sender = receipt.from;
        const receiver = receipt.to;

        if (!receiver) {
            console.error("Error: Contract creation transactions not supported for transfer verification");
            process.exit(1);
        }

        // 3. Fetch Block for state root
        const blockData = await fetchBlock(rpcUrl, blockNumber);

        if (args.options.verbose) {
            console.log("✓ Block header fetched");
            console.log("  State Root:", blockData.stateRoot);
        }

        console.log(`Verifying transfer in block ${blockNumber}...`);

        // 4. Verify Sender State
        if (args.options.verbose) console.log(`\nFetching proof for Sender: ${sender}`);
        const senderProof = await fetchProof(rpcUrl, sender, [], blockNumber);
        const senderResult = await verifyAccountProof(senderProof.accountProof, blockData.stateRoot, sender);

        // 5. Verify Receiver State
        if (args.options.verbose) console.log(`Fetching proof for Receiver: ${receiver}`);
        const receiverProof = await fetchProof(rpcUrl, receiver, [], blockNumber);
        const receiverResult = await verifyAccountProof(receiverProof.accountProof, blockData.stateRoot, receiver);

        // Output Results
        if (args.options.json) {
            console.log(
                JSON.stringify(
                    {
                        valid: senderResult.valid && receiverResult.valid,
                        transaction: {
                            hash: txHash,
                            block: blockNumber.toString(),
                            from: sender,
                            to: receiver,
                            value: tx.value.toString(),
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
                        }
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

            if (senderResult.valid && receiverResult.valid) {
                console.log("\n✓ Transfer verified: Both accounts match the global state root.");
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
