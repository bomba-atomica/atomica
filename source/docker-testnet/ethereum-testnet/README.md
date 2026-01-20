# Ethereum PoS Docker Testnet

A mainnet-like Ethereum Proof-of-Stake testnet for local development and testing. Designed for cross-chain state proof verification and light client synchronization.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Docker Compose Stack                      │
├─────────────────┬─────────────────┬─────────────────────────┤
│   Geth (EL)     │  Lighthouse BN  │   Lighthouse VC         │
│   :8545 RPC     │  :5052 REST     │   (validator client)    │
│   :8546 WS      │  :5054 metrics  │                         │
│   :8551 Engine  │                 │                         │
└─────────────────┴─────────────────┴─────────────────────────┘
```

- **Execution Layer**: Geth v1.13.14 (PoS mode, archive node)
- **Consensus Layer**: Lighthouse v5.1.0 (beacon node + validator client)
- **Consensus**: Proof-of-Stake from genesis (no PoW transition)
- **Fork Schedule**: All forks enabled at genesis (Altair, Bellatrix, Capella, Deneb)

## Quick Start

### Prerequisites

- Docker & Docker Compose
- Bun (for TypeScript SDK)

### Manual Setup

```bash
cd config

# Generate genesis with 4 validators
./generate-genesis.sh 4

# Start the network
docker compose up -d

# Check logs
docker compose logs -f beacon

# Teardown
docker compose down -v
```

### SDK Usage

```typescript
import { EthereumDockerTestnet } from "./src/index";

// Start a 4-validator testnet
const testnet = await EthereumDockerTestnet.start(4);
await testnet.waitForHealthy();

// Execution Layer APIs
const blockNumber = await testnet.getBlockNumber();
const chainId = await testnet.getChainId();
const balance = await testnet.getBalance("0x...");

// State Proofs (for cross-chain verification)
const proof = await testnet.getProof(address, storageKeys, "latest");
console.log("Account proof:", proof.accountProof);
console.log("Storage proofs:", proof.storageProof);

// Beacon Chain APIs
const header = await testnet.getBeaconHeader("head");
const syncCommittee = await testnet.getSyncCommittee();
const genesis = await testnet.getBeaconGenesis();

// Light client data
const bootstrap = await testnet.getLightClientBootstrap(blockRoot);
const updates = await testnet.getLightClientUpdates(startPeriod, count);

// Cleanup
await testnet.teardown();
```

## Test Accounts

Pre-funded accounts with 1000 ETH each:

| Address | Balance |
|---------|---------|
| `0x8943545177806ED17B9F23F0a21ee5948eCaa776` | 1000 ETH |
| `0x71bE63f3384f5fb98995898A86B02Fb2426c5788` | 1000 ETH |
| `0xFABB0ac9d68B0B445fB7357272Ff202C5651694a` | 1000 ETH |
| `0x1CBd3b2770909D4e10f157cABC84C7264073C9Ec` | 1000 ETH |

## State Proof Verification

For cross-chain bridge verification, use this data flow:

1. **Get Beacon Header**: `getBeaconHeader("finalized")` - signed by sync committee
2. **Extract Execution State Root**: `beaconBlock.body.execution_payload.state_root`
3. **Get Account Proof**: `getProof(address, storageKeys, blockNumber)`
4. **Verify on Target Chain**: MPT proof verification against state root

```typescript
// Complete verification chain
const beaconBlock = await testnet.getBeaconBlock("finalized");
const stateRoot = beaconBlock.message.body.execution_payload.state_root;
const blockNumber = beaconBlock.message.body.execution_payload.block_number;

const proof = await testnet.getProof(
    contractAddress,
    ["0x0", "0x1"],  // storage slots
    `0x${parseInt(blockNumber).toString(16)}`
);

// proof.accountProof + proof.storageProof can be verified against stateRoot
```

## API Reference

### Execution Layer (Geth)

| Method | Description |
|--------|-------------|
| `getBlockNumber()` | Current block height |
| `getChainId()` | Chain ID (32382) |
| `getBlock(number)` | Block by number or tag |
| `getBalance(address)` | Account balance |
| `getProof(address, keys, block)` | Merkle-Patricia proof |
| `sendRawTransaction(tx)` | Submit signed transaction |
| `getTransactionReceipt(hash)` | Transaction receipt |

### Beacon Chain (Lighthouse)

| Method | Description |
|--------|-------------|
| `getBeaconGenesis()` | Genesis time & validators root |
| `getBeaconHeader(blockId)` | Block header with signature |
| `getBeaconBlock(blockId)` | Full block with execution payload |
| `getSyncCommittee(stateId)` | Current sync committee |
| `getFinalityCheckpoints()` | Finalized/justified epochs |
| `getLightClientBootstrap(root)` | Light client bootstrap data |
| `getLightClientUpdates(period)` | Light client updates |

### Lifecycle

| Method | Description |
|--------|-------------|
| `start(validators)` | Start testnet with N validators |
| `teardown()` | Stop and cleanup |
| `waitForHealthy(timeout)` | Wait for network ready |
| `waitForBlocks(count)` | Wait for N blocks |
| `waitForFinality()` | Wait for finalized checkpoint |

## Running Tests

```bash
cd typescript-sdk
bun install
bun test
```

### Test Suites

| Test | Description |
|------|-------------|
| `validator-connectivity.test.ts` | EL/CL connectivity, chain ID, genesis |
| `block-production.test.ts` | Block production, EL/CL state root matching |
| `state-proofs.test.ts` | eth_getProof for account/storage proofs |

## Network Configuration

| Parameter | Value |
|-----------|-------|
| Chain ID | 32382 |
| Seconds per slot | 12 |
| Slots per epoch | 32 |
| Deposit contract | `0x4242424242424242424242424242424242424242` |

## Troubleshooting

### Beacon node not syncing

```bash
docker compose logs beacon
# Check for JWT errors or execution endpoint issues
```

### Geth not producing blocks

PoS requires the beacon node to drive block production. Ensure beacon is connected:

```bash
curl http://localhost:5052/eth/v1/node/syncing
```

### Reset everything

```bash
docker compose down -v
rm -rf testnet/ validator_keys/
./generate-genesis.sh 4
docker compose up -d
```

## Related Documentation

- [Ethereum Coding Guidelines](../../../docs/development/ethereum-coding-guidelines.md)
- [Architecture Overview](../../../docs/technical/architecture-overview.md)
