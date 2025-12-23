# Zapatos Docker Testnet

A local multi-validator testnet for developing and testing timelock encryption features in zapatos (Atomica's fork of Aptos).

## Overview

This docker testnet simulates a production-like network of 4 validators running locally using binaries built from the zapatos source code.

**Key Features:**
- ✅ Dockerfile builds zapatos in consistent environment
- ✅ Multi-stage build with minimal runtime image
- ✅ Images tagged with zapatos git commit for traceability
- ✅ Can pull pre-built images from GitHub Container Registry
- ✅ CI/CD automatically builds and pushes images
- ✅ Multi-validator setup (4 validators)
- ✅ Isolated Docker network with predictable IPs
- ✅ Exposed REST APIs and metrics endpoints
- ✅ Automatic genesis generation
- ✅ Rust test harness for integration testing

## Quick Start

### Option 1: Pull Pre-built Image (Fastest)

```bash
# Pull image from GitHub Container Registry
docker pull ghcr.io/OWNER/zapatos-bin:latest

# Tag for local use
docker tag ghcr.io/OWNER/zapatos-bin:latest zapatos-testnet/validator:latest

# Run tests
cd tests
cargo test testnet_basic -- --test-threads=1 --nocapture
```

### Option 2: Build Locally

```bash
# Build from local zapatos source
cd docker-testnet
./build.sh

# Run tests (Docker handled automatically)
cd ../tests
cargo test testnet_basic -- --test-threads=1 --nocapture
```

## Building Images

### From Local Source

```bash
cd docker-testnet
./build.sh
```

**Smart Caching:**
- Checks if an image already exists for the current zapatos commit
- If yes: Just updates 'latest' tag (~1 second)
- If no: Builds binary and packages in Docker (~10-20 minutes first time)
- Reuses Rust cargo cache across builds for faster incremental builds

**Build Process:**
1. Compiles `aptos-node` binary from zapatos source using cargo
2. Copies binary into `docker-testnet/bin/`
3. Builds minimal Docker image (~200MB) with the pre-built binary
4. Tags with git commit: `zapatos-testnet/validator:<commit>`
5. Cleans up temporary bin directory

**Build times:**
- First build: 10-20 minutes (cargo compiles all dependencies)
- Incremental builds: 1-3 minutes (cargo cache reused)
- Same commit rebuild: < 1 second (image cached)
- Docker build step: ~10 seconds (just packages binary)

### Push to GitHub Container Registry

```bash
# Authenticate with GitHub
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Build and push
./build.sh --push
```

### Build Specific Commit

```bash
./build.sh --ref main          # Build main branch
./build.sh --ref v1.2.3        # Build specific tag
./build.sh --ref abc123        # Build specific commit
```

## Running Tests

Tests handle Docker automatically - no manual start/stop needed!

```bash
cd tests
cargo test testnet_basic -- --test-threads=1 --nocapture
```

**What happens:**
1. Test starts → Docker testnet spins up (4 validators)
2. Test runs → Queries validators via REST API
3. Test ends → Docker testnet tears down (even on panic)

**No manual docker commands required!**

## Manual Testnet (Optional)

For exploration or debugging:

```bash
# Start testnet
make start

# Check status
make status

# View logs
make logs

# Stop testnet
make clean
```

## GitHub Actions CI/CD

Images are automatically built and pushed to GitHub Container Registry on:
- Push to `main` or `timelock-feature` branches
- Pull requests (build only, no push)
- Manual workflow dispatch

**Workflow: `.github/workflows/build-docker-images.yml`**
- Reuses Rust cargo cache from other workflows (shared-key: "zapatos")
- Builds `aptos-node` binary from zapatos source
- Packages binary into minimal Docker image
- Pushes to `ghcr.io/OWNER/zapatos-bin`
- Tags with zapatos commit SHA and branch name
- Skips build if image already exists for that commit
- Much faster than building in Docker (reuses cached dependencies)

## Architecture

### Build Approach

**Binary Build (Outside Docker):**
- Compiles `aptos-node` from zapatos source using local/CI Rust toolchain
- Leverages Rust cargo cache for fast incremental builds
- Build happens in `source/zapatos/` using `cargo build --release --bin aptos-node`
- Binary is copied to `docker-testnet/bin/` temporarily

**Docker Image (Packaging Only):**
- Base: `debian:bullseye-slim`
- Minimal runtime dependencies (ca-certificates, libssl, etc.)
- Copies pre-built `aptos-node` binary from bin/
- Runs as unprivileged `aptos` user
- ~200MB final image
- Very fast to build (~10 seconds) since no compilation happens

**Benefits:**
- Reuses Rust cargo cache across builds (GitHub Actions cache or local)
- Faster incremental builds (1-3 min vs 10-20 min)
- Simpler Dockerfile (no multi-stage build complexity)
- Better cache utilization in CI/CD

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
│  ┌─────────────┐                                        │
│  │ Validator 3 │                                        │
│  │ 172.19.0.13 │                                        │
│  │  :8083 API  │                                        │
│  └─────────────┘                                        │
└─────────────────────────────────────────────────────────┘
```

### Directory Structure

```
docker-testnet/
├── Dockerfile               # Multi-stage build
├── .dockerignore           # Exclude unnecessary files
├── build.sh                # Local build script
├── docker-compose.yaml     # 4-validator testnet
├── Makefile                # Management commands
├── validator-config.yaml   # Node configuration
├── .env                    # Image and network config
└── README.md               # This file
```

## Build Approach Evolution

| Aspect | Old (Docker buildx bake) | Previous (Multi-stage Docker) | Current (Pre-built binary) |
|--------|--------------------------|-------------------------------|----------------------------|
| **Binary Build** | Host machine or Docker | Inside Docker (builder stage) | Outside Docker with cargo |
| **Caching** | Cargo cache only | Docker layer cache | Rust cargo cache (shared) |
| **Build Speed** | 10-20 min each time | 10-20 min (Docker build) | 1-3 min (incremental) |
| **CI Integration** | Complex | Moderate | Simple (reuses existing workflow) |
| **Image Distribution** | Local only | GitHub Container Registry | GitHub Container Registry |
| **Image Size** | ~1.5GB | ~200MB | ~200MB |
| **Cache Sharing** | No | No | Yes (across workflows) |
| **Reproducibility** | Varies by host | Consistent | Consistent |

## Development Workflow

### Typical Development Cycle

```bash
# 1. Make changes to zapatos source
cd source/zapatos
# ... make changes ...

# 2. Build new image (cached if commit unchanged)
cd ../../docker-testnet
./build.sh

# 3. Run tests (Docker automatic)
cd ../tests
cargo test testnet_basic -- --test-threads=1

# 4. Iterate
```

### Using Pre-built Images

```bash
# Pull latest from CI
docker pull ghcr.io/OWNER/zapatos-bin:latest
docker tag ghcr.io/OWNER/zapatos-bin:latest zapatos-testnet/validator:latest

# Run tests immediately (no build needed!)
cd tests
cargo test testnet_basic -- --test-threads=1
```

## Makefile Commands

| Command | Description |
|---------|-------------|
| `make help` | Show all available commands |
| `make start` | Start the validator testnet |
| `make stop` | Stop testnet (preserves data) |
| `make restart` | Restart testnet |
| `make clean` | Stop and remove all containers/volumes |
| `make status` | Show validator status |
| `make info` | Show connection information |
| `make logs` | Show logs from all validators |
| `make logs-0` | Show logs from validator 0 |

## Troubleshooting

**Image build fails?**
→ Check zapatos compiles: `cd ../source/zapatos && cargo check`

**Can't pull from ghcr.io?**
→ Repository might be private. Build locally: `./build.sh`

**Tests fail to start Docker?**
→ Ensure image exists: `docker images zapatos-testnet/validator`

**Port conflicts?**
→ Stop other services using ports 8080-8083

## Related Documentation

- [Timelock Implementation Plan](../docs/development/timelock-implementation-plan.md)
- [Test Harness Documentation](../tests/docker_harness/mod.rs)
- [GitHub Actions Workflow](../.github/workflows/build-docker-images.yml)
