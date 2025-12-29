# Aptos Docker Testnet

Full-featured Aptos testnet running in Docker with **production-like account funding**.

## Quick Start

```typescript
import { DockerTestnet } from "@atomica/docker-testnet";

// Start 4-validator testnet
const testnet = await DockerTestnet.new(4);

// Bootstrap with production-like funding
await testnet.bootstrapValidators();

// Fund new accounts (no magic, just transfers!)
await testnet.faucet(newAccountAddress, 100_000_000n);

// Clean up
await testnet.teardown();
```

## Key Features

### ✅ Production-Like Account Funding

**No magic accounts, no minting privileges during runtime.**

This testnet emulates production mainnet:
- Validators have unlocked funds (simulating staking rewards)
- New accounts funded via **validator transfers** (not minting)
- Root account (0xA550C18) used **only** for initial bootstrap
- All runtime operations use standard account-to-account transfers

**Result:** Your test code behaves identically on mainnet! 🎉

### ✅ Multi-Validator Consensus

- 1-7 validators with real consensus (not fake/local testnet)
- Full P2P networking and block production
- Realistic timing and finality
- Chain ID: 4 (local testnet)

### ✅ TypeScript SDK

Simple, ergonomic API for testnet management:
- Start/stop testnets programmatically
- Production-like faucet
- Block production verification
- Automatic cleanup

## Documentation

### Getting Started

- **[typescript-sdk/README.md](typescript-sdk/README.md)** - Complete API reference and usage guide
- **[config/README.md](config/README.md)** - Docker configuration and manual operation

### Production-Like Faucet

- **[typescript-sdk/FAUCET.md](typescript-sdk/FAUCET.md)** ⭐ - Production-like faucet system explained
  - How it works (bootstrap → runtime)
  - Why this approach
  - API usage
  - Comparison to production mainnet

### Testing

- **[typescript-sdk/test/README.md](typescript-sdk/test/README.md)** - Test suite documentation
  - Faucet tests
  - Network probes
  - Cleanup handling

### Technical Details

- **[testnet_startup.md](testnet_startup.md)** - Startup analysis and debugging
  - Network connectivity
  - Genesis generation
  - Configuration details
  - Faucet approach

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                   Docker Network: 172.19.0.0/16                  │
├────────────────┬────────────────┬────────────────┬───────────────┤
│  validator-0   │  validator-1   │  validator-2   │  validator-3  │
│  172.19.0.10   │  172.19.0.11   │  172.19.0.12   │  172.19.0.13  │
│                │                │                │               │
│ 8080 REST API  │ 8080 REST API  │ 8080 REST API  │ 8080 REST API │
│ 6180 P2P       │ 6180 P2P       │ 6180 P2P       │ 6180 P2P      │
│ 9101 Metrics   │ 9101 Metrics   │ 9101 Metrics   │ 9101 Metrics  │
└────────────────┴────────────────┴────────────────┴───────────────┘
```

### Funding Flow

```
Genesis Phase:
  Validators: 1M APT (STAKED/LOCKED) ← For consensus
  Root Acct:  Unlimited (Core Resources)

Bootstrap Phase (ONE TIME):
  Root → Validators: 100K APT (UNLOCKED) ← Simulates staking rewards

Runtime Phase:
  Validators → New Accounts: X APT (TRANSFER) ← Production-like!
```

## Directory Structure

```
docker-testnet/
├── README.md                    # This file
├── testnet_startup.md           # Startup analysis
├── config/
│   ├── README.md                # Docker configuration
│   ├── docker-compose.yaml      # 4-validator setup
│   ├── generate-genesis.sh      # Genesis generation script
│   └── validator-config.yaml    # Node configuration
└── typescript-sdk/
    ├── README.md                # SDK documentation
    ├── FAUCET.md                # Production-like faucet ⭐
    ├── src/
    │   ├── index.ts             # DockerTestnet class
    │   └── genesis.ts           # Genesis generation
    └── test/
        ├── README.md            # Test documentation
        └── faucet.test.ts       # Faucet tests
```

## Usage Examples

### Basic Testing

```typescript
import { DockerTestnet } from "@atomica/docker-testnet";
import { AptosAccount } from "aptos";

describe("My Aptos Tests", () => {
    let testnet: DockerTestnet;

    beforeAll(async () => {
        testnet = await DockerTestnet.new(4);
        await testnet.bootstrapValidators();
    });

    afterAll(async () => {
        await testnet.teardown();
    });

    test("fund and use account", async () => {
        const account = new AptosAccount();

        // Production-like funding
        await testnet.faucet(account.address(), 100_000_000n);

        // ... your test logic ...
    });
});
```

### Custom Validator Operations

```typescript
// Access validator accounts directly
const validator0 = await testnet.getValidatorAccount(0);

// Use for custom operations
const txn = await coinClient.transfer(
    validator0,
    recipientAddress,
    amount
);
```

### Network Verification

```typescript
// Wait for blocks to be produced
await testnet.waitForBlocks(10);

// Query ledger state
const info = await testnet.getLedgerInfo(0);
console.log(`Epoch: ${info.epoch}, Block: ${info.block_height}`);
```

## Why Production-Like Funding?

### Traditional Testnet Approach ❌

```typescript
// Uses magic account with minting privileges
const faucet = new FaucetClient("http://faucet:8080");
await faucet.fundAccount(address, amount);
// ^ This doesn't exist on mainnet!
```

**Problem:** Your code works on testnet but might fail on mainnet.

### Our Approach ✅

```typescript
// Uses validator transfers (standard operations)
await testnet.faucet(address, amount);
// Internally: validator.transfer(address, amount)
// ^ This works identically on mainnet!
```

**Benefit:** Production parity. Your test code works on mainnet.

## Comparison to Production

| Aspect | Production Mainnet | Docker Testnet |
|--------|-------------------|----------------|
| Validators | Earn unlocked rewards | Bootstrap transfer (unlocked) |
| New accounts | Funded by transfers | Funded by validator transfers |
| Minting | None (after genesis) | None (after bootstrap) |
| Magic accounts | Don't exist | Only for bootstrap |
| Code behavior | Standard transfers | **Identical** standard transfers |

## Installation

```bash
cd source/docker-testnet/typescript-sdk
npm install
npm run build
```

## Running Tests

```bash
# All tests
npm test

# Specific test file
npx bun test test/faucet.test.ts

# With debug logging
DEBUG_TESTNET=1 npm test
```

## Manual Docker Operation

```bash
cd config

# Start
docker compose up -d

# View logs
docker compose logs -f validator-0

# Stop
docker compose down -v
```

## Troubleshooting

### Port Conflicts

```bash
cd config
docker compose down -v

# Check ports
lsof -i :8080-8083
```

### Validators Not Syncing

```bash
# Check logs
docker compose logs validator-0

# Enable debug mode
DEBUG_TESTNET=1 npm test
```

### Cleanup Failed

```bash
# Manual cleanup
cd config
docker compose down -v --remove-orphans

# Force remove
docker rm -f $(docker ps -aq --filter name=atomica)
```

## Key Concepts

**Genesis:** Initial blockchain state with validators and staked funds.

**Bootstrap:** One-time setup giving validators unlocked funds (simulates rewards).

**Faucet:** Production-like account funding via validator transfers.

**Validator Account:** Account with both staked (locked) and unlocked funds.

**Root Account (0xA550C18):** Core Resources account, only for bootstrap.

## Contributing

When making changes:

1. Update relevant documentation
2. Run tests: `npm test`
3. Test with debug logging: `DEBUG_TESTNET=1 npm test`
4. Verify cleanup: No orphaned containers after tests

## Related Projects

- **[atomica-aptos](https://github.com/bomba-atomica/atomica-aptos)** - Aptos core with Atomica modifications
- Validator Docker images built from atomica-aptos

## License

MIT
