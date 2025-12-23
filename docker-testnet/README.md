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
docker pull ghcr.io/OWNER/zapatos-testnet/validator:latest

# Tag for local use
docker tag ghcr.io/OWNER/zapatos-testnet/validator:latest zapatos-testnet/validator:latest

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
- If no: Builds from source (10-20 minutes)

**Build Process:**
1. Creates a Docker build context with zapatos source
2. Compiles `aptos-node` binary inside Docker
3. Creates minimal runtime image (~200MB)
4. Tags with git commit: `zapatos-testnet/validator:<commit>`

**Build times:**
- First build: 10-20 minutes
- Cached rebuilds: < 1 second
- Docker layer cache: Significantly faster on subsequent builds

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
- Builds Docker image from zapatos source
- Pushes to `ghcr.io/OWNER/zapatos-testnet/validator`
- Tags with zapatos commit SHA and branch name
- Caches layers for faster builds
- Skips build if image already exists for that commit

## Architecture

### Multi-Stage Dockerfile

**Stage 1: Builder**
- Base: `rust:1.75-bullseye`
- Installs build dependencies (cmake, clang, etc.)
- Copies zapatos source from context
- Compiles `aptos-node` binary
- Extracts git commit metadata

**Stage 2: Runtime**
- Base: `debian:bullseye-slim`
- Minimal dependencies (ca-certificates, libssl, etc.)
- Copies only the compiled binary
- Runs as unprivileged `aptos` user
- ~200MB final image

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

## Advantages Over Old Approach

| Aspect | Old (buildx bake) | New (Dockerfile) |
|--------|-------------------|------------------|
| **Build Environment** | Host machine | Consistent Docker environment |
| **Reproducibility** | Varies by host | Always same build environment |
| **CI/CD** | Complex setup | Simple `docker build` |
| **Image Distribution** | Local only | Push to GitHub Container Registry |
| **Caching** | Cargo cache only | Docker layer cache + cargo cache |
| **Image Size** | ~1.5GB | ~200MB (multi-stage) |
| **Dependencies** | Host must have all deps | All deps in Dockerfile |

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
docker pull ghcr.io/OWNER/zapatos-testnet/validator:latest
docker tag ghcr.io/OWNER/zapatos-testnet/validator:latest zapatos-testnet/validator:latest

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
