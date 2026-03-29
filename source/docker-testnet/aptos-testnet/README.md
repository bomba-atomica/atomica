# Aptos Docker Testnet

Docker-based local Aptos testnet for development and testing.

## Purpose

This package provides a complete Docker-based Aptos testnet infrastructure with test utilities, making it easy to develop and test Aptos applications locally without relying on external testnets.

## What's Inside

### Testnet Infrastructure
- **Docker Compose Setup**: Complete Aptos validator network in Docker
- **Genesis Configuration**: Automated genesis creation with pre-funded accounts
- **Localnet Management**: Start, stop, and manage local Aptos networks
- **Framework Deployment**: Automatic deployment of Aptos framework and test contracts

### Test Utilities
- **Faucet**: Fund accounts with APT tokens
- **Mock Wallet**: Browser-compatible mock Ethereum wallet for testing
- **Browser Commands**: Vitest browser mode commands for E2E tests
- **Network Probing**: Health checks and validator connectivity tests

### Browser Support
- **Browser-compatible exports**: Utilities that work in browser test environments
- **Wallet mocking**: Mock MetaMask for integration tests
- **Test commands**: Vitest browser commands for testnet lifecycle

## Key Components

### Testnet Lifecycle
```typescript
import { setupLocalnet, teardownLocalnet } from "@atomica/aptos-docker-testnet";

// Start local testnet
await setupLocalnet();

// Deploy contracts
await deployContracts();

// ... run tests ...

// Cleanup
await teardownLocalnet();
```

### Browser Testing
```typescript
import { commands } from "vitest/browser";

// Available in browser tests
await commands.setupLocalnet();
await commands.deployContracts();
await commands.fundAccount(address, amount);
```

### Mock Wallet
```typescript
import { MockWallet } from "@atomica/aptos-docker-testnet/browser-utils/MockWallet";

const wallet = new MockWallet(privateKey);
const provider = wallet.getProvider();
// Use like MetaMask in tests
```

## Architecture

**Node.js Side** (Test Infrastructure):
- `localnet.ts`: Docker container management
- `genesis.ts`: Genesis block creation
- `ensureFramework.ts`: Contract deployment
- `probe.ts`: Network health checks

**Browser Side** (Test Utilities):
- `browser-index.ts`: Browser-safe SDK utilities
- `browser-utils/`: Mock wallet and helpers
- `browser-commands.ts`: Vitest commands bridge

## Testing

**Test Environment**: Node.js (Meta Tests)

These are infrastructure validation tests that verify the testnet setup works correctly. They run in a **Node.js environment** (not browser) because they:
- Spawn child processes (`aptos` CLI)
- Manage Docker containers
- Access filesystem and system resources
- Test platform infrastructure, not application code

Test coverage:
- Validator connectivity and health checks
- Block production and consensus
- Faucet functionality (Ed25519 and SECP256k1)
- Account creation and funding
- Contract deployment (simple and Atomica contracts)
- Multi-validator network progress

Run tests:
```bash
bun run test
```

**Important**: Tests use Vitest runner with `describe.sequential` to run sequentially. This prevents port conflicts since each test starts its own localnet on ports 8080/8081.

## Configuration

Default testnet configuration:
- **Chain ID**: 4 (local)
- **RPC**: http://localhost:8080
- **Faucet**: http://localhost:8081
- **Validators**: 1 node setup

## Contract Addresses

Test contracts deployed to a deterministic address:
- Set via `CONTRACT_ADDR` in config.ts
- Includes `fake_eth`, `fake_usd`, and `auction` modules

## Usage

### In Node.js Tests
```typescript
import { setupLocalnet, fundAccount } from "@atomica/aptos-docker-testnet";

beforeAll(async () => {
  await setupLocalnet();
});

test("my test", async () => {
  await fundAccount(myAddress, 1_000_000_000);
  // ... test logic ...
});
```

### In Browser Tests (Vitest)
```typescript
import { commands } from "vitest/browser";
import { MockWallet } from "@atomica/aptos-docker-testnet/browser-utils/MockWallet";

beforeAll(async () => {
  await commands.setupLocalnet();
  await commands.deployContracts();
});

test("UI test", async () => {
  const wallet = new MockWallet(privateKey);
  window.ethereum = wallet.getProvider();
  // ... test UI ...
});
```

## Related Packages

- `@atomica/sdk`: Core account and transaction utilities
- `@atomica/atomica-web-ui`: UI components that use this testnet
- `@atomica/atomica-web-demo`: Demo app with integration tests
