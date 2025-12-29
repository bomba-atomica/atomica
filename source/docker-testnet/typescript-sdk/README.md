# Aptos Docker Testnet - TypeScript SDK

Production-like Aptos testnet for local development and testing. Runs 1-7 validators with full consensus, block production, and **production-like account funding**.

## Quick Start

```typescript
import { DockerTestnet } from "@atomica/docker-testnet";
import { AptosAccount } from "aptos";

// 1. Start testnet with 4 validators
const testnet = await DockerTestnet.new(4);

// 2. Bootstrap validators with unlocked funds (ONE TIME)
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

- Validators have **unlocked funds** (simulating staking rewards)
- New accounts funded via **validator transfers** (not minting)
- Root account (0xA550C18) used **only** for initial bootstrap
- All runtime operations use standard account-to-account transfers

**Why This Matters:** Your test code behaves identically on mainnet! 🎉

See **[FAUCET.md](./FAUCET.md)** for complete documentation.

### ✅ Multi-Validator Consensus

- 1-7 validators with real consensus (not fake/local testnet)
- Block production with configurable epochs
- Network connectivity and peer discovery
- Realistic timing and finality

### ✅ Simple API

```typescript
// Access validators
const validator0 = await testnet.getValidatorAccount(0);

// Query ledger info
const info = await testnet.getLedgerInfo(0);
console.log(`Chain: ${info.chain_id}, Epoch: ${info.epoch}`);

// Wait for blocks
await testnet.waitForBlocks(10);

// Get validator endpoints
const apiUrls = testnet.validatorApiUrls();
```

### ✅ Automatic Cleanup

Signal handlers ensure Docker containers are cleaned up even when tests are interrupted (Ctrl+C, crashes, etc.).

## Installation

```bash
cd source/docker-testnet/typescript-sdk
npm install
npm run build
```

## API Reference

### `DockerTestnet.new(numValidators)`

Create and start a fresh testnet.

```typescript
const testnet = await DockerTestnet.new(4); // 4 validators
```

**Parameters:**
- `numValidators` (1-7): Number of validators to run

**Returns:** `DockerTestnet` instance

**Time:** ~30 seconds (first run: ~1-2 minutes for image downloads)

### `bootstrapValidators(amountPerValidator?)`

One-time setup to give validators unlocked funds for faucet operations.

```typescript
// Default: 100,000 APT per validator
await testnet.bootstrapValidators();

// Custom amount (in octas)
await testnet.bootstrapValidators(1_000_000_000_000n); // 10,000 APT
```

**When to call:** Once, after starting the testnet.

### `faucet(address, amount?)`

Fund a new account using production-like validator transfers.

```typescript
// Default: 0.1 APT
await testnet.faucet(accountAddress);

// Custom amount (in octas)
await testnet.faucet(accountAddress, 500_000_000n); // 5 APT
```

**How it works:**
- Randomly selects a validator
- Transfers funds from that validator
- Auto-creates the account if it doesn't exist

### `getValidatorAccount(index)`

Get a specific validator account with private key access.

```typescript
const validator0 = await testnet.getValidatorAccount(0);

// Use it like any AptosAccount
const txn = await coinClient.transfer(validator0, recipient, amount);
```

### `getRootAccount()`

Get the root account for manual operations.

```typescript
const rootAccount = testnet.getRootAccount();
```

**⚠️ WARNING:** Only use for bootstrap or debugging. Not production-like!

### `validatorApiUrl(index)` / `validatorApiUrls()`

Get validator REST API endpoints.

```typescript
const url = testnet.validatorApiUrl(0); // "http://127.0.0.1:8080"
const allUrls = testnet.validatorApiUrls(); // All validator URLs
```

### `getLedgerInfo(validatorIndex)`

Query ledger information from a validator.

```typescript
const info = await testnet.getLedgerInfo(0);
console.log(`Epoch: ${info.epoch}, Block: ${info.block_height}`);
```

### `waitForBlocks(numBlocks, timeoutSecs?)`

Wait for a specific number of blocks to be produced.

```typescript
await testnet.waitForBlocks(10); // Wait for 10 blocks
await testnet.waitForBlocks(5, 30); // 5 blocks with 30s timeout
```

### `teardown()`

Stop the testnet and clean up all resources.

```typescript
await testnet.teardown();
```

**Note:** Always call this in your `afterAll` hook to prevent orphaned containers.

## Testing

Run the test suite:

```bash
npm test

# With debug logging
DEBUG_TESTNET=1 npm test

# Run specific test file
npx bun test test/faucet.test.ts
```

Test files:
- `test/faucet.test.ts` - Production-like faucet functionality
- `test/probe_validators.ts` - Validator connectivity and sync

See **[test/README.md](./test/README.md)** for detailed test documentation.

## Production-Like Faucet

The faucet system mimics production mainnet behavior:

| Aspect | Production Mainnet | This Testnet |
|--------|-------------------|--------------|
| Initial funds source | Foundation treasury | Root account (bootstrap only) |
| Validator funds | Staking rewards (unlocked) | Bootstrap transfer (unlocked) |
| New account funding | Transfer from existing account | Transfer from validator |
| Minting | None (after genesis) | None (after bootstrap) |
| Magic accounts | Don't exist | Only used at bootstrap |

**Complete documentation:** [FAUCET.md](./FAUCET.md)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  Docker Network: 172.19.0.0/16                  │
├───────────────┬───────────────┬───────────────┬─────────────────┤
│  validator-0  │  validator-1  │  validator-2  │  validator-3    │
│  172.19.0.10  │  172.19.0.11  │  172.19.0.12  │  172.19.0.13    │
│               │               │               │                 │
│ Ports:        │ Ports:        │ Ports:        │ Ports:          │
│ 8080 REST API │ 8080 REST API │ 8080 REST API │ 8080 REST API   │
│ 6180 P2P      │ 6180 P2P      │ 6180 P2P      │ 6180 P2P        │
│ 9101 Metrics  │ 9101 Metrics  │ 9101 Metrics  │ 9101 Metrics    │
└───────────────┴───────────────┴───────────────┴─────────────────┘
```

**Configuration:**
- Chain ID: 4 (local testnet)
- Epoch duration: 7200 seconds
- Stake per validator: 1M APT (locked)
- Faucet funds: 100,000 APT per validator (unlocked)

## Directory Structure

```
typescript-sdk/
├── src/
│   ├── index.ts          # Main DockerTestnet class
│   └── genesis.ts        # Genesis generation
├── test/
│   ├── faucet.test.ts    # Faucet functionality tests
│   └── probe_*.ts        # Network probing utilities
├── README.md             # This file
├── FAUCET.md             # Production-like faucet documentation
└── ROOT_ACCOUNT.md       # Historical root account documentation
```

## Troubleshooting

### Port conflicts
```bash
# Stop existing containers
cd ../config
docker compose down -v

# Check for processes using ports
lsof -i :8080-8083
```

### Validators not syncing
```bash
# Check validator logs
docker compose logs validator-0

# Verify network connectivity
DEBUG_TESTNET=1 npm test
```

### Cleanup failed
```bash
# Manual cleanup
cd ../config
docker compose down -v --remove-orphans

# Force remove containers
docker rm -f $(docker ps -aq --filter name=atomica)
```

## Advanced Usage

### Manual Faucet Implementation

If you need custom faucet logic:

```typescript
import { AptosClient, CoinClient } from "aptos";

const validator = await testnet.getValidatorAccount(0);
const client = new AptosClient(testnet.validatorApiUrl(0));
const coinClient = new CoinClient(client);

const newAccount = new AptosAccount();
const txn = await coinClient.transfer(
    validator,
    newAccount.address(),
    100_000_000n
);
await client.waitForTransaction(txn);
```

### Custom Genesis Configuration

The genesis script is located at `../config/generate-genesis.sh`. See the script for available configuration options.

### Debug Logging

Enable verbose logging:

```bash
DEBUG_TESTNET=1 npm test
```

This shows:
- Genesis generation steps
- Docker compose operations
- Network connectivity checks
- Block production progress

## Related Documentation

- **[FAUCET.md](./FAUCET.md)** - Production-like faucet system
- **[test/README.md](./test/README.md)** - Test suite documentation
- **[ROOT_ACCOUNT.md](./ROOT_ACCOUNT.md)** - Historical root account docs
- **[../config/README.md](../config/README.md)** - Docker testnet configuration
- **[../testnet_startup.md](../testnet_startup.md)** - Startup analysis

## Contributing

When making changes:

1. Ensure tests pass: `npm test`
2. Update documentation for API changes
3. Run with debug logging: `DEBUG_TESTNET=1 npm test`
4. Verify cleanup works: Test should not leave orphaned containers

## License

MIT
