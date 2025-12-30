# Ethereum Multi-Validator Docker Testnet

This directory contains the infrastructure for running a local Ethereum PoS testnet with multiple validators, designed for testing cross-chain state proofs and light client synchronization.

## Features
- **Multi-Validator PoS**: Runs a real consensus layer (Lighthouse) and execution layer (Geth).
- **Automated Genesis**: Scripts to generate genesis state and validator keys.
- **TypeScript SDK**: Ergonomic API to manage the testnet and fetch proof-related data (Beacon headers, Sync Committees, validator keys).

## Key Components
- `config/docker-compose.yaml`: The orchestration for Geth and Lighthouse.
- `config/generate-genesis.sh`: Uses Lighthouse `lcli` to bootstrap the testnet.
- `typescript-sdk/`: A TS library for programmatic interaction.

## Quick Start (Manual)

1. Generate the genesis:
   ```bash
   cd config
   ./generate-genesis.sh 4
   ```

2. Start the network:
   ```bash
   docker compose up -d
   ```

3. Check logs:
   ```bash
   docker compose logs -f beacon
   ```

## Usage via SDK

```typescript
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";

// Start a 4-validator testnet
const testnet = await EthereumDockerTestnet.new(4);
await testnet.waitForHealthy();

// Get public keys for state proof verification
const pubkeys = testnet.getValidatorPublicKeys();
console.log("Validator Keys:", pubkeys);

// Fetch latest beacon header
const header = await testnet.getBeaconHeader();
console.log("Latest Header:", header);

// Clean up
await testnet.teardown();
```

## Architecture

- **Execution Layer**: Geth (exposed at :8545)
- **Beacon Node**: Lighthouse (exposed at :5052)
- **Validator Client**: Lighthouse (manages multiple validator keys)

## Proof Testing Note

To test Ethereum state proofs on the home chain (Aptos-based), you will need:
1. The **Sync Committee** keys (accessible via `getSyncCommittee()`).
2. The **Beacon Block Header** (accessible via `getBeaconHeader()`).
3. The **Execution Payload** within the beacon block (contains the EL state root).
4. An EL storage proof (at :8545 using `eth_getProof`).
