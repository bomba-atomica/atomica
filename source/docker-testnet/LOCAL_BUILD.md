# Local Docker Image Building

This document explains how to build the Atomica Aptos validator image locally from source for faster iteration during development.

## Overview

The local build tools are now maintained in the **atomica-aptos repository** at `atomica/docker/`. This allows developers to build validator images directly from Aptos source code.

### Why Local Builds?

- **Faster iteration**: Test your Aptos changes immediately without waiting for CI
- **BuildKit cache**: Incremental builds reuse compiled artifacts
- **Development workflow**: Edit Aptos source → Rebuild image → Test with testnet
- **Offline capable**: Works completely offline after initial setup

## Quick Start

### Build the Local Image

```bash
# From atomica-aptos repository
cd ../atomica-aptos/atomica/docker
./build-local-image.sh
```

The first build will take some time to compile all dependencies. Subsequent builds will be much faster thanks to BuildKit cache mounts.

### Use with Docker Testnet

After building the local image, use it with docker-testnet:

```bash
# Use local image with docker-compose
cd ../../docker-testnet/config
USE_LOCAL_IMAGE=1 docker compose up -d

# Or specify the image directly
IMAGE_NAME=atomica-validator:local docker compose up -d
```

## Build Script Reference

The build script is located at `../atomica-aptos/atomica/docker/build-local-image.sh`.

### Basic Usage

```bash
# Default: release build
./build-local-image.sh

# Debug build (faster compile, slower runtime)
./build-local-image.sh --profile debug

# Clean build (ignores cache)
./build-local-image.sh --no-cache

# Custom image tag
./build-local-image.sh --tag my-custom-tag
```

### All Options

```
--profile <release|debug>   Build profile (default: release)
--features <features>       Cargo features (default: testing)
--tag <tag>                 Image tag (default: local)
--no-cache                  Disable Docker build cache
--help                      Show help message
```

### Examples

```bash
# Fast debug build for quick testing
./build-local-image.sh --profile debug

# Clean release build
./build-local-image.sh --no-cache

# Build with custom features
./build-local-image.sh --features "testing,consensus-only-perf-test"

# Custom tag
./build-local-image.sh --tag dev-v2
```

## SDK Integration

### TypeScript

```typescript
import { DockerTestnet } from "@atomica/docker-testnet";

// Use local image for testnet
const testnet = await DockerTestnet.new(4, { useLocalImage: true });
```

Or set environment variable:

```bash
USE_LOCAL_IMAGE=1 bun test
```

### Rust

```rust
use atomica_docker_testnet::DockerTestnet;

#[tokio::main]
async fn main() {
    // Use local image for testnet
    let testnet = DockerTestnet::new(4, true).await.unwrap();
}
```

## Development Workflow

### Typical Iteration Cycle

```bash
# 1. Make changes to atomica-aptos source
vim ../atomica-aptos/crates/aptos-node/src/main.rs

# 2. Rebuild the image
cd ../atomica-aptos/atomica/docker
./build-local-image.sh

# 3. Test with docker-testnet
cd ../../docker-testnet/config
USE_LOCAL_IMAGE=1 docker compose up -d

# 4. Run tests or interact with testnet
cd ../typescript-sdk
bun test
```

## How BuildKit Cache Works

### First Build
```
Developer: ./build-local-image.sh
  ↓
Docker BuildKit: cargo build --release
  ↓
BuildKit: Compiling all crates (stores in cache)
  ↓
Output: atomica-validator:local image
```

### Subsequent Builds (Changed Files Only)
```
Developer: Edit Aptos source, rebuild
  ↓
Docker BuildKit: cargo build --release
  ↓
BuildKit: Reuses cached artifacts for unchanged crates
  ↓
BuildKit: Only recompiles changed crates
  ↓
Output: atomica-validator:local image (much faster!)
```

## Troubleshooting

### Build script not found

**Problem:** Running from wrong directory

**Solution:**
```bash
# Must run from atomica-aptos/atomica/docker
cd ../atomica-aptos/atomica/docker
./build-local-image.sh
```

### Image tag mismatch

**Problem:** Built image with custom tag but docker-compose expects `local`

**Solution:**
```bash
# Either build with default tag
./build-local-image.sh

# Or specify custom tag in docker-compose
IMAGE_NAME=atomica-validator:mytag docker compose up -d
```

### Slow builds even after cache

**Problem:** BuildKit cache was cleared

**Solution:**
```bash
# BuildKit cache is managed automatically
# To force clean build, use --no-cache
./build-local-image.sh --no-cache
```

### Binary not found in container

**Problem:** Build may have failed but Docker cached the layer

**Solution:**
```bash
# Force rebuild without cache
./build-local-image.sh --no-cache
```

## Architecture Details

### Dockerfile.local Structure

```dockerfile
# Stage 1: Build with BuildKit cache mounts
FROM rust:1.75-bullseye AS builder
- Install build dependencies
- Mount BuildKit cache (cargo registry, git, target)
- Build aptos-node binary only

# Stage 2: Runtime image
FROM debian:bullseye-slim
- Copy binary from builder
- Minimal runtime dependencies
- Run as aptos user
```

### BuildKit Cache Mounts

The Dockerfile uses three cache mounts:
- **Cargo registry**: `/usr/local/cargo/registry` - Downloaded crates
- **Cargo git**: `/usr/local/cargo/git` - Git dependencies
- **Build artifacts**: `/build/atomica-aptos/target` - Compiled code

These caches persist across builds, making incremental builds much faster.

## Performance Comparison

### Published Image (Default)
```
Pull time: ~30s (download from GitHub registry)
Total time: ~30s
Use case: Production, CI/CD, stable testing
```

### Local Build
```
First build: ~10-20min (compile everything)
Subsequent: ~2-5min (only changed files)
Use case: Active development, debugging Aptos code
```

## Environment Variables

Docker-compose and SDKs support:

- `USE_LOCAL_IMAGE=1` - Use locally built image instead of published
- `IMAGE_NAME=<name:tag>` - Specify custom image name/tag
- `VALIDATOR_IMAGE_REPO=<repo>` - Specify image repository (for published images)

## Documentation

For more information about the build system:
- Build script documentation: `../atomica-aptos/atomica/docker/build-local-image.sh --help`
- Docker build README: `../atomica-aptos/atomica/docker/README.md`
- Testnet configuration: [config/README.md](./config/README.md)
- Key management: [KEY_MANAGEMENT.md](./KEY_MANAGEMENT.md)

## Next Steps

- See [TESTING.md](./TESTING.md) for testing with local images
- See [README.md](./README.md) for general testnet usage
- Report issues at https://github.com/bomba-atomica/atomica-aptos/issues
