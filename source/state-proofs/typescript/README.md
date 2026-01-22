# Ethereum State Proof Verifier

A self-sufficient TypeScript library and CLI tool for fetching and cryptographically verifying Ethereum state proofs using Merkle-Patricia Trie (MPT) verification.

## 🚀 Quick Start: Live Demo (Sepolia)

Run a complete end-to-end verification demo on Sepolia testnet:

```bash
# 1. Install dependencies
bun install

# 2. Run the demo with your Sepolia RPC URL
SEPOLIA_RPC_URL="https://ethereum-sepolia-rpc.publicnode.com" bun run demo:sepolia
```

This demo initializes a trustless light client, syncs to the head of Sepolia, and cryptographically verifies an account state.

## Overview

This tool implements **EIP-1186** (`eth_getProof`) proof verification, allowing you to:
- Fetch account and storage proofs from any Ethereum RPC endpoint
- Cryptographically verify proofs against block state roots
- Validate that account state (balance, nonce, storage) is part of the global Ethereum state trie
- Use as a library or standalone CLI tool

**Key Features:**
- ✅ Works with any Ethereum node (mainnet, testnets, Infura, Alchemy, local nodes)
- ✅ Self-sufficient - no external dependencies beyond standard Ethereum libraries
- ✅ Cryptographic MPT verification using `@ethereumjs/trie`
- ✅ Both CLI and programmatic API
- ✅ Full TypeScript support with type definitions

## Installation

```bash
npm install @atomica/state-proof-verifier
```

Or install globally for CLI usage:

```bash
npm install -g @atomica/state-proof-verifier
```

## Quick Start

### CLI Usage

```bash
# Verify account against Ethereum mainnet
eth-verify verify-account 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb 12345678 \
  --rpc https://mainnet.infura.io/v3/YOUR_KEY

# Verify against local node
eth-verify verify-account 0x8943545177806ED17B9F23F0a21ee5948eCaa776 latest \
  --rpc http://localhost:8545

# Verify storage slot
eth-verify verify-storage 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb 0x0 12345678 \
  --rpc https://mainnet.infura.io/v3/YOUR_KEY --json

# Verify transfer transaction
eth-verify verify-transfer 0xabcdef... \
  --rpc https://mainnet.infura.io/v3/YOUR_KEY
```

### Library Usage

```typescript
import { fetchProof, verifyAccountProof } from '@atomica/state-proof-verifier';

// Fetch proof from any Ethereum RPC
const rpcUrl = 'https://mainnet.infura.io/v3/YOUR_KEY';
const address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb';
const blockNumber = 12345678;

const proof = await fetchProof(rpcUrl, address, [], blockNumber);

// Verify proof cryptographically
const result = await verifyAccountProof(
    proof.accountProof,
    proof.stateRoot,
    address
);

if (result.valid) {
    console.log('Proof verified!');
    console.log('Account state:', result.accountState);
    // { nonce: 5, balance: 1000000000000000000n, storageHash: '0x...', codeHash: '0x...' }
} else {
    console.log('Proof verification failed:', result.error);
}
```

## How It Works

### Merkle-Patricia Trie Verification

Ethereum stores all account state in a Merkle-Patricia Trie (MPT). Each block header contains a `stateRoot` which is the root hash of this trie.

**EIP-1186** (`eth_getProof`) returns:
1. **Account Proof**: Array of RLP-encoded trie nodes from root to account leaf
2. **State Root**: The root hash from the block header
3. **Account Data**: Balance, nonce, storageHash, codeHash

**Verification Process**:
1. Hash the account address with Keccak-256 to get the trie key
2. Decode each proof node (RLP-encoded)
3. Traverse the trie path, verifying hashes at each level
4. Verify the final hash equals the state root
5. Decode the leaf node to extract account state

```
Block Header
    └── stateRoot: 0xabc123...
            │
            ├─ Proof Node 1 (branch) ──┐
            │                           │
            ├─ Proof Node 2 (branch) ──┼─> Hash chain verification
            │                           │
            └─ Proof Node 3 (leaf)   ──┘
                    │
                    └─ Account: { nonce, balance, storageHash, codeHash }
```

## CLI Commands

### `verify-account`

Verify an account's existence and state at a specific block.

```bash
eth-verify verify-account <address> <block> --rpc <url> [options]
```

**Arguments:**
- `<address>` - Ethereum address (0x-prefixed hex)
- `<block>` - Block number (decimal) or tag (`latest`, `finalized`, `safe`)

**Options:**
- `--rpc <url>` - Ethereum RPC endpoint (required)
- `--json` - Output as JSON instead of formatted table
- `--verbose` - Show detailed verification steps

**Example:**
```bash
eth-verify verify-account 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb 12345678 \
  --rpc https://mainnet.infura.io/v3/YOUR_KEY
```

**Output:**
```
✓ Proof verified successfully

Account: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb
Block:   12345678
State Root: 0xabc123...

Account State:
  Nonce:        5
  Balance:      1.5 ETH
  Storage Hash: 0xdef456...
  Code Hash:    0x789abc...

Proof Details:
  Proof Nodes:  4
  Verification: PASSED ✓
```

### `verify-storage`

Verify a specific storage slot value.

```bash
eth-verify verify-storage <address> <slot> <block> --rpc <url> [options]
```

### `verify-transfer`

Verify a transfer transaction affected account states correctly.

```bash
eth-verify verify-transfer <txHash> --rpc <url> [options]
```

## Live Demo (Sepolia)

Run a complete end-to-end verification demo on Sepolia testnet. This script:
1. Syncs the light client to the latest finalized header.
2. Sends a self-transfer transaction (if private key provided).
3. Verifies account state, transaction inclusion, and receipt inclusion against the light client root.

### Setup

1. Copy example environment file:
   ```bash
   cp .env.example .env
   ```
2. Edit `.env` and add your `SEPOLIA_RPC_URL` (e.g. from Infura/Alchemy).
3. (Optional) Add a `PRIVATE_KEY` with some Sepolia ETH to verify a live transaction.

### Run

```bash
bun run demo:sepolia
```

## Library API

See [API.md](./docs/API.md) for detailed API documentation.

### Core Functions

#### `fetchProof(rpcUrl, address, storageKeys, block)`

Fetch account and storage proofs from an Ethereum RPC endpoint.

```typescript
const proof = await fetchProof(
    'https://mainnet.infura.io/v3/YOUR_KEY',
    '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    [], // storage keys
    12345678 // block number
);
```

#### `verifyAccountProof(accountProof, stateRoot, address)`

Cryptographically verify an account proof against a state root.

```typescript
const result = await verifyAccountProof(
    proof.accountProof,
    proof.stateRoot,
    address
);

if (result.valid) {
    console.log('Account state:', result.accountState);
}
```

#### `verifyStorageProof(storageProof, storageRoot, key)`

Verify a storage proof against a storage root.

## Use Cases

### Cross-Chain Bridges

Verify account state on Ethereum to relay to another blockchain:

```typescript
// 1. Fetch proof from Ethereum
const proof = await fetchProof(ethereumRpc, bridgeContract, [], 'finalized');

// 2. Verify proof
const result = await verifyAccountProof(proof.accountProof, proof.stateRoot, bridgeContract);

// 3. Extract verified state for cross-chain relay
if (result.valid) {
    const lockedBalance = result.accountState.balance;
    // Relay to target chain with cryptographic proof
}
```

### Light Clients

Verify account state without downloading full blockchain:

```typescript
// Verify against finalized block
const proof = await fetchProof(rpcUrl, address, [], 'finalized');
const result = await verifyAccountProof(proof.accountProof, proof.stateRoot, address);

// Trust the account state without trusting the RPC provider
```

### Auditing & Forensics

Verify historical account states:

```typescript
// Verify account state at specific block
const historicalProof = await fetchProof(rpcUrl, address, [], 15000000);
const result = await verifyAccountProof(
    historicalProof.accountProof,
    historicalProof.stateRoot,
    address
);
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│              CLI (cli.ts)                       │
│  Commands: verify-account, verify-storage       │
└────────────────┬────────────────────────────────┘
                 │
┌────────────────┴────────────────────────────────┐
│         Public API (index.ts)                   │
│  fetchProof, verifyAccountProof, etc.           │
└────────────────┬────────────────────────────────┘
                 │
        ┌────────┴────────┐
        │                 │
┌───────▼────────┐ ┌─────▼──────────┐
│  fetcher.ts    │ │  verifier.ts   │
│  RPC calls     │ │  High-level    │
│  (viem/ethers) │ │  verification  │
└────────────────┘ └────────┬───────┘
                            │
                    ┌───────▼────────┐
                    │    mpt.ts      │
                    │  Core MPT      │
                    │  verification  │
                    └────────────────┘
```

## Development

### Setup

```bash
git clone https://github.com/atomica/atomica
cd atomica/source/state-proofs/typescript
bun install
```

### Run Tests

```bash
# Unit tests
bun test

# Integration tests (requires Docker)
bun test test/integration.test.ts

# Watch mode
bun test --watch
```

### Build

```bash
bun run build
```

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md).

## License

MIT

## References

- [EIP-1186: eth_getProof](https://eips.ethereum.org/EIPS/eip-1186)
- [Ethereum Yellow Paper - Patricia Tree](https://ethereum.github.io/yellowpaper/paper.pdf)
- [Merkle Patricia Trie Specification](https://ethereum.org/en/developers/docs/data-structures-and-encoding/patricia-merkle-trie/)
- [@ethereumjs/trie Documentation](https://github.com/ethereumjs/ethereumjs-monorepo/tree/master/packages/trie)

## Support

- GitHub Issues: https://github.com/atomica/atomica/issues
- Documentation: https://docs.atomica.org
