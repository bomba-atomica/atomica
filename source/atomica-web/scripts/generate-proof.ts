#!/usr/bin/env bun
/**
 * CLI Tool: Generate Ethereum State Proof
 *
 * Usage:
 *   bun run scripts/generate-proof.ts \
 *     --rpc http://localhost:8545 \
 *     --lockbox 0x123... \
 *     --user 0xabc... \
 *     --token 0xdef... \
 *     [--block 12345] \
 *     [--output proof.json]
 */

import { ethers } from "ethers";
import { writeFile } from "fs/promises";
import {
  generateLockedBalanceProof,
  validateProof,
  formatProof,
  isProofFinalized,
  serializeProofForAptos,
} from "../src/lib/ethereum/proofs/index.js";

interface CliArgs {
  rpc: string;
  lockbox: string;
  user: string;
  token: string;
  block?: number;
  output?: string;
  finality?: number;
}

async function main() {
  console.log("═".repeat(60));
  console.log("  Ethereum State Proof Generator");
  console.log("═".repeat(60));

  // Parse arguments
  const args = parseArgs(process.argv.slice(2));

  if (!args.rpc || !args.lockbox || !args.user || !args.token) {
    printUsage();
    process.exit(1);
  }

  try {
    // Connect to Ethereum
    console.log("\n🔌 Connecting to Ethereum...");
    console.log(`   RPC: ${args.rpc}`);

    const provider = new ethers.JsonRpcProvider(args.rpc);

    // Check connection
    const blockNumber = await provider.getBlockNumber();
    console.log(`   ✅ Connected (block: ${blockNumber})`);

    // Verify addresses
    console.log("\n📋 Parameters:");
    console.log(`   LockBox: ${args.lockbox}`);
    console.log(`   User: ${args.user}`);
    console.log(`   Token: ${args.token}`);
    console.log(`   Block: ${args.block || "latest"}`);

    // Create LockBox contract instance to check locked balance
    const lockBox = new ethers.Contract(
      args.lockbox,
      [
        "function getLockedBalance(address user, address token) view returns (uint256)",
      ],
      provider,
    );

    const lockedBalance = await lockBox.getLockedBalance(args.user, args.token);
    console.log(`   Locked: ${ethers.formatEther(lockedBalance)} tokens`);

    // Generate proof
    console.log("\n⚙️  Generating state proof...");

    const proof = await generateLockedBalanceProof(
      provider,
      args.lockbox,
      args.user,
      args.token,
      args.block,
    );

    console.log("   ✅ Proof generated");

    // Validate proof
    console.log("\n🔍 Validating proof...");
    validateProof(proof);
    console.log("   ✅ Proof is valid");

    // Check finality
    if (args.finality !== undefined) {
      console.log(`\n🔒 Checking finality (${args.finality} confirmations)...`);
      const isFinalized = await isProofFinalized(
        provider,
        proof,
        args.finality,
      );

      if (isFinalized) {
        console.log("   ✅ Proof is finalized");
      } else {
        console.log("   ⚠️  Proof is not yet finalized");
        const currentBlock = await provider.getBlockNumber();
        const confirmations = currentBlock - proof.blockNumber;
        const remaining = args.finality - confirmations;
        console.log(`   Need ${remaining} more confirmations`);
      }
    }

    // Display proof
    console.log("\n" + "═".repeat(60));
    console.log(formatProof(proof));
    console.log("═".repeat(60));

    // Save to file if requested
    if (args.output) {
      console.log(`\n💾 Saving proof to ${args.output}...`);

      const output = {
        proof,
        serialized: serializeProofForAptos(proof),
        metadata: {
          generated_at: new Date().toISOString(),
          generator: "atomica-proof-cli",
          version: "1.0.0",
        },
      };

      await writeFile(args.output, JSON.stringify(output, null, 2));
      console.log("   ✅ Proof saved");
    }

    console.log("\n✨ Done!\n");
  } catch (error) {
    console.error("\n❌ Error:", error);
    process.exit(1);
  }
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    rpc: "",
    lockbox: "",
    user: "",
    token: "",
  };

  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];

    switch (key) {
      case "--rpc":
        args.rpc = value;
        break;
      case "--lockbox":
        args.lockbox = value;
        break;
      case "--user":
        args.user = value;
        break;
      case "--token":
        args.token = value;
        break;
      case "--block":
        args.block = parseInt(value);
        break;
      case "--output":
        args.output = value;
        break;
      case "--finality":
        args.finality = parseInt(value);
        break;
      default:
        console.error(`Unknown argument: ${key}`);
        process.exit(1);
    }
  }

  return args;
}

function printUsage() {
  console.log(`
Usage:
  bun run scripts/generate-proof.ts [options]

Required Options:
  --rpc <url>         Ethereum RPC URL (e.g., http://localhost:8545)
  --lockbox <addr>    LockBox contract address
  --user <addr>       User address who locked tokens
  --token <addr>      Token address (FakeETH or FakeUSD)

Optional:
  --block <number>    Block number to generate proof at (default: latest)
  --output <file>     Save proof to JSON file
  --finality <n>      Check proof finality (min confirmations, default: 64)

Examples:
  # Generate proof for latest block
  bun run scripts/generate-proof.ts \\
    --rpc http://localhost:8545 \\
    --lockbox 0x5FbDB2315678afecb367f032d93F642f64180aa3 \\
    --user 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \\
    --token 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512

  # Generate and save proof
  bun run scripts/generate-proof.ts \\
    --rpc http://localhost:8545 \\
    --lockbox 0x5FbDB2315678afecb367f032d93F642f64180aa3 \\
    --user 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \\
    --token 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512 \\
    --output proof.json \\
    --finality 0
  `);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
