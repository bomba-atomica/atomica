# Zapatos Docker Testnet

A local multi-validator testnet for developing and testing timelock encryption features in zapatos (Atomica's fork of Aptos).

## Overview

This docker testnet simulates a production-like network of 4 validators running locally using binaries built from the zapatos source code.

**Key Features:**
- ✅ Builds from local zapatos source (in `source/zapatos/`)
- ✅ Images tagged with zapatos git commit for traceability
- ✅ Ensures binaries match your local zapatos checkout
- ✅ Multi-validator setup (4 validators)
- ✅ Isolated Docker network with predictable IPs
- ✅ Exposed REST APIs and metrics endpoints
- ✅ Automatic genesis generation
- ✅ Rust test harness for integration testing
- ✅ Optional faucet service for funding accounts

## Quick Start

### Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)
- Rust toolchain (for building zapatos)
- At least 8GB RAM and 20GB disk space

### 1. Build Docker Images

Build the validator docker image from zapatos source:

```bash
cd docker-testnet
./build.sh
```

**Smart Caching:**
- First checks if an image already exists for the current zapatos commit
- If cached: Updates 'latest' tag and exits (< 1 second)
- If not: Builds from source using zapatos's docker buildx infrastructure

**Build Process:**
1. Get current zapatos git commit
2. Check if `zapatos-testnet/validator:<commit>` exists
3. If exists: Tag as 'latest' and skip build
4. If not: Compile `aptos-node` and tag with commit + 'latest'

**Build times:**
- First build: 10-20 minutes
- Rebuilding same commit: < 1 second
- Switching branches: 10-20 minutes (or instant if that commit was built before)

The image tag matches your zapatos git commit, ensuring binaries always match your code.

### 2. Start the Testnet

```bash
# Using the Makefile (recommended)
make start

# Or using docker compose directly
docker compose up -d
```

The testnet will:
- Start 4 validator nodes
- Generate genesis automatically
- Wait for all validators to sync and become healthy
- Expose REST APIs on ports 8080-8083

### 3. Verify It's Running

```bash
# Check status
make status

# Test REST APIs
make test-api

# View connection info
make info

# Watch logs
make logs
```

You should see:
```
Validator 0 API: http://localhost:8080
Validator 1 API: http://localhost:8081
Validator 2 API: http://localhost:8082
Validator 3 API: http://localhost:8083
```

### 4. Stop the Testnet

```bash
# Stop (preserves data)
make stop

# Clean up everything (removes volumes)
make clean
```

## Architecture

### Network Topology

```
┌─────────────────────────────────────────────────────────┐
│  Docker Network: zapatos-testnet (172.19.0.0/16)       │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ Validator 0 │  │ Validator 1 │  │ Validator 2 │    │
│  │ 172.19.0.10 │  │ 172.19.0.11 │  │ 172.19.0.12 │    │
│  │  :8080 API  │  │  :8081 API  │  │  :8082 API  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘    │
│                                                          │
│  ┌─────────────┐  ┌─────────────┐                      │
│  │ Validator 3 │  │   Faucet    │                      │
│  │ 172.19.0.13 │  │ 172.19.0.20 │                      │
│  │  :8083 API  │  │  :8000 API  │                      │
│  └─────────────┘  └─────────────┘                      │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### Directory Structure

```
docker-testnet/
├── build.sh                    # Build zapatos docker images
├── docker-compose.yaml         # 4-validator testnet config
├── Makefile                    # Convenience commands
├── validator-config.yaml       # Validator node config overrides
├── .env                        # Image and network configuration
└── README.md                   # This file
```

### Key Differences from Aptos Production Setup

| Aspect | Aptos Production | Zapatos Testnet |
|--------|-----------------|-----------------|
| **Images** | Pre-built from Docker Hub (`aptoslabs/validator`) | Built from local source (`./build.sh`) |
| **Image Tags** | Version numbers (e.g., `v1.2.3`) | Git commit from zapatos source |
| **Validators** | Single validator | 4 validators |
| **Genesis** | Manual or scripted | Auto-generated in test mode |
| **Epochs** | 1 hour (3600s) | 30 seconds (for fast testing) |
| **Purpose** | Running a node | Development and testing |
| **Traceability** | Official releases | Matches your local code exactly |

## Usage

### Manual Operation

Start and interact with the testnet manually:

```bash
# Start testnet
make start

# Query validator 0
curl http://localhost:8080/v1 | jq

# Get current block height
curl http://localhost:8080/v1 | jq '.block_height'

# View validator metrics
curl http://localhost:9101/metrics

# Extract genesis files
make extract-genesis

# Open shell in validator
make shell-0

# View logs from specific validator
make logs-0
```

### Integration Testing

Use the Rust test harness to programmatically control the testnet:

```rust
use docker_harness::DockerTestnet;

#[tokio::test]
async fn test_timelock_encryption() {
    // Start a 4-validator testnet
    let testnet = DockerTestnet::new(4).await.unwrap();

    // Query validator state
    let ledger_info = testnet.get_ledger_info(0).await.unwrap();
    println!("Block height: {}", ledger_info.block_height);

    // Wait for blocks to be produced
    testnet.wait_for_blocks(10, 60).await.unwrap();

    // Get DKG group public key for timelock
    let group_pk = testnet.get_validator_group_pubkey().await.unwrap();

    // Encrypt data, submit transactions, etc...

} // Testnet automatically cleaned up on drop
```

Run integration tests:

```bash
cd ../tests
cargo test -- --test-threads=1 --nocapture
```

**Note:** Tests must run sequentially (`--test-threads=1`) to avoid Docker port conflicts.

## Configuration

### Changing Number of Validators

Edit `.env`:
```bash
NUM_VALIDATORS=7  # Change from 4 to 7
```

Then update `docker-compose.yaml` to add services `validator-4`, `validator-5`, `validator-6`.

### Modifying Validator Config

Edit `validator-config.yaml` to change:
- Epoch duration
- Consensus timeouts
- API limits
- Logging levels

Changes take effect on next `make restart`.

### Using Custom Zapatos Branch

The build script uses whatever zapatos source is in `source/zapatos/`. To test a different branch:

```bash
cd ../source/zapatos
git checkout my-feature-branch
cd ../../docker-testnet
./build.sh  # Rebuild with new code
make restart
```

## Troubleshooting

### Docker Images Not Found

**Error:** `Error response from daemon: No such image: zapatos-testnet/validator:local`

**Solution:** Run `./build.sh` to build images from source first.

### Validators Not Starting

**Error:** `Timeout waiting for validators`

**Check:**
1. Docker has enough resources (8GB RAM minimum)
2. No port conflicts: `lsof -i :8080-8083`
3. View logs: `make logs`
4. Check Docker: `docker ps -a`

### Build Failures

**Error:** Build script fails with compilation errors

**Solutions:**
- Ensure Rust toolchain is up to date: `rustup update`
- Check zapatos source is valid: `cd source/zapatos && cargo check`
- Clean build cache: `cd source/zapatos && cargo clean`
- Check Docker has enough disk space

### Testnet Running Slowly

**Symptoms:** Slow block production, high CPU usage

**Solutions:**
- Increase Docker resource limits
- Reduce number of validators (edit `.env`)
- Check system resources: `docker stats`

### Integration Tests Failing

**Common Issues:**
1. **Images not built:** Run `./build.sh` first
2. **Parallel execution:** Must use `--test-threads=1`
3. **Stale containers:** Run `make clean` to reset
4. **Port conflicts:** Stop other services using ports 8080-8083

## Advanced Usage

### Running with Faucet

```bash
make start-with-faucet
```

Faucet API: `http://localhost:8000`

### Extracting Genesis for Other Tools

```bash
make extract-genesis
# Creates: genesis.blob, waypoint.txt
```

Use these files to connect external fullnodes or tools.

### Monitoring Metrics

Each validator exposes Prometheus metrics:
- Validator 0: http://localhost:9101/metrics
- Validator 1: http://localhost:9102/metrics
- Validator 2: http://localhost:9103/metrics
- Validator 3: http://localhost:9104/metrics

### Debugging Inside Containers

```bash
# Open shell in validator 0
make shell-0

# Check running processes
ps aux | grep aptos-node

# View validator data
ls -la /opt/aptos/var/

# Check network connectivity
ping validator-1
```

## Development Workflow

### Typical Development Cycle

1. **Make changes** to zapatos source code
2. **Rebuild images**: `./build.sh`
3. **Restart testnet**: `make restart`
4. **Run tests**: `cd ../tests && cargo test -- --test-threads=1`
5. **View logs**: `make logs` to debug issues
6. **Iterate**: Repeat steps 1-5

### Testing Timelock Features

```rust
#[tokio::test]
async fn test_timelock_flow() {
    let testnet = DockerTestnet::new(4).await.unwrap();

    // 1. Get validator group public key
    let group_pk = testnet.get_validator_group_pubkey().await.unwrap();

    // 2. Encrypt bid using timelock
    let plaintext = b"secret bid data";
    let ciphertext = encrypt_timelock(plaintext, &group_pk, auction_end_time);

    // 3. Submit encrypted bid on-chain
    submit_encrypted_bid(&testnet, &ciphertext).await;

    // 4. Wait for timelock to expire
    testnet.wait_for_blocks(50, 120).await.unwrap();

    // 5. Validators publish decryption shares
    // 6. Aggregate shares and decrypt
    // 7. Verify plaintext matches
}
```

## Makefile Commands Reference

| Command | Description |
|---------|-------------|
| `make help` | Show all available commands |
| `make build` | Build docker images from zapatos source |
| `make start` | Start the validator testnet |
| `make start-with-faucet` | Start testnet with faucet service |
| `make stop` | Stop testnet (preserves data) |
| `make restart` | Restart testnet |
| `make clean` | Stop and remove all containers/volumes |
| `make status` | Show validator status |
| `make info` | Show connection information |
| `make logs` | Show logs from all validators |
| `make logs-0` | Show logs from validator 0 |
| `make test-api` | Test REST API endpoints |
| `make extract-genesis` | Extract genesis files |
| `make shell-0` | Open shell in validator 0 |
| `make quick-test` | Build, start, and verify |

## Related Documentation

- [Timelock Implementation Plan](../docs/development/timelock-implementation-plan.md)
- [Zapatos DKG Documentation](../source/zapatos/crates/aptos-dkg/README.md)
- [Aptos Node Documentation](https://aptos.dev/nodes/validator-node/validators)

## Contributing

When adding features that require testnet changes:

1. Update `docker-compose.yaml` if new services are needed
2. Update `validator-config.yaml` if config changes are needed
3. Update `docker_harness/mod.rs` if new test utilities are needed
4. Update this README with usage examples
5. Add integration tests in `tests/`

## Support

For issues:
- Check logs: `make logs`
- Review [Troubleshooting](#troubleshooting) section
- Open an issue with logs and environment details
