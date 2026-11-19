# docker-testnet

Status: `live`

## Overview

Full-featured Aptos testnet running in Docker with production-like account funding.

## Quick Start

```typescript
import { DockerTestnet } from "@atomica/aptos-docker-testnet";

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

- **[aptos-testnet/README.md](aptos-testnet/README.md)** - Aptos testnet SDK API and usage guide
- **[config/README.md](config/README.md)** - Docker configuration and manual operation
- **[ethereum-testnet/README.md](ethereum-testnet/README.md)** - Ethereum testnet

### Testing

- **[aptos-testnet/test/README.md](aptos-testnet/test/README.md)** - Test suite documentation

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
├── config/
│   ├── README.md                # Docker configuration
│   ├── docker-compose.yaml      # 4-validator setup
│   └── generate-genesis.sh      # Genesis generation script
├── aptos-testnet/               # @atomica/aptos-docker-testnet SDK
│   ├── README.md                # SDK documentation
│   ├── src/
│   │   ├── index.ts             # DockerTestnet class
│   │   ├── genesis.ts           # Genesis generation
│   │   └── localnet.ts          # Test lifecycle helpers
│   └── test/
│       ├── README.md            # Test documentation
│       └── faucet.test.ts       # Faucet tests (and others)
└── ethereum-testnet/            # Ethereum Docker testnet and SDK
```

## Usage Examples

### Basic Testing

```typescript
import { DockerTestnet } from "@atomica/aptos-docker-testnet";
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
const txn = await coinClient.transfer(validator0, recipientAddress, amount);
```

### Network Verification

```typescript
// Wait for blocks to be produced
await testnet.waitForBlocks(10);

// Query ledger state
const info = await testnet.getLedgerInfo(0);
console.log(`Epoch: ${info.epoch}, Block: ${info.block_height}`);
```

## Comparison to Production

| Aspect         | Production Mainnet    | Docker Testnet                   |
| -------------- | --------------------- | -------------------------------- |
| Validators     | Earn unlocked rewards | Bootstrap transfer (unlocked)    |
| New accounts   | Funded by transfers   | Funded by validator transfers    |
| Minting        | None (after genesis)  | None (after bootstrap)           |
| Magic accounts | Don't exist           | Only for bootstrap               |
| Code behavior  | Standard transfers    | **Identical** standard transfers |

## Installation

```bash
cd source/docker-testnet/aptos-testnet
bun install
bun run build
```

## Running Tests

```bash
# All tests
bun run test

# Specific test file
bun run test test/faucet.test.ts

# With debug logging
ATOMICA_DEBUG_TESTNET=1 npm test
```

## Local devnet run

One command brings up the whole dual-chain devnet on a workstation, checks it, and tears it down:

```bash
cd source/atomica-demo
bun run devnet:check
```

It runs `scripts/local-devnet-check.ts`, which runs `prepare:deps` once the host checks pass. That script starts both chains with `setupDualChainTestnet`, which deploys the Atomica Move package and the EVM contracts. It then asserts three things:

- `auction::is_pair_allowed(LAUNCH_PAIR_BCS)` is true.
- A FakeETH lock through LockBox emits `Locked`.
- `create_auction` for the lock's window succeeds.

It prints a JSON report and exits 0 only when all three hold and teardown succeeded. The report holds `pairAllowed`, the `Locked` event, the `create_auction` transaction hash, the docker caps of each container, and `maxLoad1m`.

Prerequisites:

- The `aptos` CLI on `PATH`, the same release binary CI installs (`binary-0ef2c9a5c5`).
- Forge output in `source/evm-contracts/out` (`forge build`).
- The `ethereum-testnet-setup` image. The check refuses to run without it, because compose would build it.

The validators use the pinned prebuilt image from `config/docker-compose.yaml`. The check never builds an image, a release binary, or a swarm.

Host guards (`scripts/host-load-guard.ts`):

- It refuses to start when the 1-minute load average is 32 or more.
- It refuses to start when containers of this devnet exist. It matches only the compose projects `atomica-testnet` and `ethereum-testnet` and their container names, so other projects' containers do not count.
- It refuses to start when another docker network overlaps `172.19.0.0/16`, the subnet of `atomica-testnet`. The error names that network.
- Right after the host checks pass it creates the `atomica-testnet` network itself, so no other project takes the subnet during the minutes before the Aptos `compose up`. Compose reuses it. Teardown removes it.
- It checks the load every 30 seconds. At 32 or more it aborts and tears down.
- It tears down on success, failure, SIGINT and SIGTERM with `docker compose down -v --remove-orphans` in both compose directories.

Every devnet container has a CPU and memory cap:

| Container                         | CPUs | Memory |
| --------------------------------- | ---- | ------ |
| `atomica-validator-0..3` (each)   | 1    | 3 GB   |
| `eth-execution`                   | 1    | 2 GB   |
| `eth-beacon`                      | 1    | 3 GB   |
| `eth-validator-1..4` (each)       | 0.25 | 512 MB |
| Ethereum `setup` (genesis)        | 0.5  | 1 GB   |
| Aptos genesis (`docker run --rm`) | 0.5  | 2 GB   |
| **Total**                         | 8    | 22 GB  |

Check the caps of a running devnet:

```bash
docker inspect --format '{{.Name}} {{.HostConfig.NanoCpus}} {{.HostConfig.Memory}}' \
  $(docker ps -q --filter name=atomica-validator- --filter name=eth-)
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

### Debug Logging

Enable verbose debug logging with environment variable:

```bash
ATOMICA_DEBUG_TESTNET=1 npm test
```

This enables:

- Genesis generation debug logs
- Docker compose operation logs
- Network discovery logs
- Configuration file verification logs

### Manual Verification Commands

```bash
# Check all validator status
for port in 8080 8081 8082 8083; do
    echo "=== Validator on port $port ==="
    curl -s http://127.0.0.1:$port/v1 | jq '{epoch,block_height,node_role}'
done

# Check validator logs for connectivity
docker compose logs --tail=50 validator-0 | grep -i "connect\|error\|peer"

# Check container networking
docker exec atomica-validator-0 curl -s http://172.19.0.11:8080/v1
```

### Port Conflicts

```bash
cd config
docker compose down -v

# Check ports
lsof -i :8080-8083
```

### Validators Not Syncing

If validators report `Epoch: 0` and `Block Height: 0` for >30s, or you see "Connection Refused" errors in logs:

1. **Check Logs**: `docker compose logs validator-0`
2. **Verify Config**: Ensure `listen_address` is set to `/ip4/0.0.0.0/tcp/6180` in the generated `node-config.yaml`.
   - _Note: This was a known startup issue fixed by ensuring the genesis generator correctly sets this field._
3. **Check Firewall**: Ensure no firewall is blocking container-to-container traffic on port 6180.

### Cleanup Failed

```bash
# Manual cleanup
cd config
docker compose down -v --remove-orphans

# Force remove
docker rm -f $(docker ps -aq --filter name=atomica)
```

## Required Ports

| Port | Protocol  | Purpose                | Listen Address |
| ---- | --------- | ---------------------- | -------------- |
| 8080 | TCP/HTTP  | REST API               | 0.0.0.0:8080   |
| 6180 | TCP/Noise | Validator-to-Validator | 0.0.0.0:6180   |
| 6181 | TCP/Noise | VFN Network (optional) | 0.0.0.0:6181   |
| 9101 | TCP/HTTP  | Metrics/Prometheus     | 0.0.0.0:9101   |

## Contributing

When making changes:

1. Update relevant documentation
2. Run tests: `npm test`
3. Test with debug logging: `ATOMICA_DEBUG_TESTNET=1 npm test`
4. Verify cleanup: No orphaned containers after tests

## License

MIT
