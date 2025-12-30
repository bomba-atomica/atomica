# Aptos Docker Testnet - TypeScript SDK

Production-like Aptos testnet for local development and testing. Runs 1-7 validators with full consensus, block production, and **production-like account funding**.

## Quick Start

```typescript
import { DockerTestnet } from "@atomica/docker-testnet";
import { AptosAccount } from "aptos";

// 1. Start testnet with 4 validators
const testnet = await DockerTestnet.new(4);

// 2. Bootstrap validators with unlocked funds (ONE TIME)
// This simulates validators earning staking rewards
await testnet.bootstrapValidators();

// 3. Use production-like faucet to fund new accounts
const newAccount = new AptosAccount();
await testnet.faucet(newAccount.address(), 100_000_000n); // 1 APT

// 4. Test your code...

// 5. Clean up
await testnet.teardown();
```

## Key Features

### ✅ Production-Like Account Funding

**No magic accounts, no minting privileges.** This testnet emulates production mainnet:

- **Validators have unlocked funds** (simulating staking rewards).
- New accounts are funded via **validator transfers** (not minting).
- The **Root Account** (0xA550C18) is used **only** for initial bootstrap.
- All runtime operations use standard account-to-account transfers.

**Why This Matters:** Your test code behaves identically on mainnet!

### ✅ Robust Lifecycle Management

- **Automatic Cleanup**: Signal handlers intercept `SIGINT` (Ctrl+C), `SIGTERM`, and uncaught exceptions to ensure Docker containers are cleaned up.
- **Multi-Validator Consensus**: Runs real consensus with 1-7 validators, network connectivity, and peer discovery.
- **Block Production**: Correctly tracks block height (not just ledger versions) for reliable `waitForBlocks` synchronization.

## Installation

```bash
cd source/docker-testnet/typescript-sdk
npm install
npm run build
```

## API Reference

### `DockerTestnet.new(numValidators)`

Create and start a fresh testnet.

- **numValidators**: Number of validators (1-7). Default/Recommended is 4.
- **Time**: ~30s to start (longer on first run for image pulls).

### `bootstrapValidators(amountPerValidator?)`

**One-time setup** to give validators unlocked funds for faucet operations.

- **amountPerValidator**: Amount in octas (default: 100,000 APT).
- **Note**: Must be called once after starting the testnet.

### `faucet(address, amount?)`

Fund a new account using production-like validator transfers.

- **address**: Recipient address (Hex string or AccountAddress).
- **amount**: Amount in octas (default: 0.1 APT).
- **Mechanism**: Randomly selects a validator to transfer funds. Auto-creates the account if it doesn't exist.

### `waitForBlocks(numBlocks, timeoutSecs?)`

Wait for a specific number of blocks to be produced.

- **numBlocks**: Number of blocks to wait for.
- **timeoutSecs**: Timeout in seconds (default: 30).
- **Note**: This tracks actual **block height**, not ledger versions, ensuring reliable synchronization.

### `getValidatorAccount(index)`

Get a specific validator account with private key access. Useful for direct validator operations.

### `teardown()`

Stop the testnet and clean up all resources.

- **Note**: Always call this in your `afterAll` hook to prevent orphaned containers.

## Running Tests

The SDK includes a comprehensive test suite verifying the faucet, network connectivity, and consensus.

```bash
# Run all tests
npm test

# Run with debug logging (highly recommended for troubleshooting)
DEBUG_TESTNET=1 npm test

# Run a specific test file
npx bun test test/faucet.test.ts
```

### Signal Handling & Cleanup

The test suite includes signal handlers that guarantee cleanup in almost all scenarios:

- **Success/Failure**: `afterAll` hook runs `teardown()`.
- **Ctrl+C / SIGTERM**: Signal handlers intercept and run `docker compose down`.
- **Uncaught Exceptions**: Handlers catch crashes and cleanup.

**Note:** `kill -9` (SIGKILL) cannot be caught. If used, you must manually clean up.

## Troubleshooting

### Manual Cleanup

If tests hang, crash hard, or `kill -9` was used, you may have orphaned containers.

```bash
cd ../config
docker compose down -v --remove-orphans
```

_Tip: If containers are stubborn, use `docker rm -f $(docker ps -aq --filter name=atomica)`._

### Port Conflicts

Ensure ports `8080-8086` (REST), `6180-6186` (P2P), and `9101-9107` (Metrics) are free.

```bash
lsof -i :8080-8086
```

### Validators Stuck at Genesis

If validators report `Epoch: 0` and `Block Height: 0` for >30s:

1. Check logs: `docker compose logs validator-0`
2. Ensure `DEBUG_TESTNET=1` shows successful peer connections.
3. Verify your machine has enough resources (Docker CPU/RAM).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Docker Network: 172.19.0.0/16                  │
├───────────────┬───────────────┬───────────────┬─────────────────┤
│  validator-0  │  validator-1  │  validator-2  │  validator-3    │
│  172.19.0.10  │  172.19.0.11  │  172.19.0.12  │  172.19.0.13    │
│  Ports: 8080  │  Ports: 8081  │  Ports: 8082  │  Ports: 8083    │
└───────────────┴───────────────┴───────────────┴─────────────────┘
```
