# Testing Guide - Docker Testnet SDKs

This document explains how to run tests for the TypeScript and Rust Docker testnet SDKs, including the comprehensive local image build tests.

## Overview

Both SDKs have test suites that validate:
1. **Local image building** - Build from source with sccache
2. **Testnet functionality** - Start validators and verify consensus
3. **Key management** - Read keys from storage (not generate)
4. **Faucet operations** - Fund accounts in test mode

## Quick Reference

### TypeScript SDK

```bash
cd typescript-sdk

# All tests
npm test

# Specific tests
npm run test:local-build    # Local image build (SLOW first time)
npm run test:faucet         # Faucet functionality
npm run test:verification   # General verification
```

### Rust SDK

```bash
cd rust-sdk

# All tests (sequential)
cargo test -- --nocapture --test-threads=1

# Specific tests
cargo test --test local_build_test -- --nocapture --test-threads=1
cargo test --test basic_test -- --nocapture --test-threads=1
```

## Local Image Build Tests

These tests validate the **entire local build workflow** from source to running testnet.

### ⚠️ Important Notes

- **First run is SLOW**: 10-15 minutes to build the image
- **Subsequent runs are fast**: 2-3 minutes thanks to sccache
- **Disk space**: Requires ~5GB for build cache
- **Docker required**: Must have Docker running

### TypeScript - Local Build Test

**File**: `typescript-sdk/test/local-build.test.ts`

**What it tests:**
1. ✅ Builds the validator image from `source/atomica-aptos`
2. ✅ Starts a testnet with the locally built image
3. ✅ Verifies validators are running and producing blocks
4. ✅ Queries on-chain state (ValidatorSet, ledger info)
5. ✅ Checks build metadata (git hash)

**Run it:**
```bash
cd typescript-sdk

# Build and run test
npm run test:local-build

# With verbose output
DEBUG_TESTNET=1 npm run test:local-build
```

**Expected output:**
```
=== Building Local Validator Image ===
This may take 10-15 minutes on first build...
Subsequent builds will be much faster (~2-3min) thanks to sccache

[... Docker build output ...]
✓ Image built successfully

=== Starting Testnet with Local Image ===
Using image: atomica-validator:local
✓ Testnet started with 2 validators

=== Verifying Testnet Functionality ===
Waiting for consensus to start...
✓ Consensus is running - blocks being produced
✓ Validator 0: chain_id=4, version=15, height=7
✓ Validator 1: chain_id=4, version=15, height=7
✓ On-chain state accessible: 2 active validators

✅ All tests passed - local image is fully functional!
```

**Test breakdown:**
- `should build local image successfully` - Builds the image (20min timeout)
- `should start testnet with local image` - Starts validators (5min timeout)
- `should have functional validators` - Verifies functionality (2min timeout)
- `should have correct build metadata` - Checks git hash (30sec timeout)

### Rust - Local Build Test

**File**: `rust-sdk/tests/local_build_test.rs`

**What it tests:**
1. ✅ Builds the validator image from source
2. ✅ Starts a testnet with the local image
3. ✅ Verifies consensus and block production
4. ✅ Queries ledger info from all validators
5. ✅ Validates build metadata

**Run it:**
```bash
cd rust-sdk

# Build and run test
cargo test --test local_build_test -- --nocapture --test-threads=1

# With logging
RUST_LOG=info cargo test --test local_build_test -- --nocapture --test-threads=1
```

**Expected output:**
```
=== Building Local Validator Image ===
This may take 10-15 minutes on first build...
Subsequent builds will be much faster (~2-3min) thanks to sccache

[... Docker build output ...]
✓ Image built successfully

=== Starting Testnet with Local Image ===
✓ Testnet started with 2 validators
  Using image: atomica-validator:local

=== Verifying Testnet Functionality ===
✓ Consensus is running - blocks being produced
✓ Validator 0: chain_id=4, version=12, height=6
✓ Validator 1: chain_id=4, version=12, height=6
  Build metadata: git_hash=36fc852

✅ All tests passed - local image is fully functional!
```

**Test breakdown:**
- `test_build_local_image` - Builds the image
- `test_start_testnet_with_local_image` - Full integration test
- `test_sccache_speedup` - Optional performance test (ignored by default)

## sccache Performance Test

Both SDKs include an **optional test** that builds the image twice to demonstrate sccache effectiveness.

### TypeScript

```bash
cd typescript-sdk

# Run the skipped test
bun test test/local-build.test.ts -t "sccache Performance"
```

### Rust

```bash
cd rust-sdk

# Run the ignored test
cargo test --test local_build_test test_sccache_speedup -- --nocapture --test-threads=1 --ignored
```

**What it does:**
1. Clean build (removes sccache) - ~10-15min
2. Cached build (uses sccache) - ~2-3min
3. Compares and reports speedup

**Expected output:**
```
Build 1: Populating sccache (slow)...
✓ Build 1 completed in 782.3s

Build 2: Using sccache (fast)...
✓ Build 2 completed in 156.7s

Speedup: 5.0x faster
Cache effectiveness: 80.0% time saved
```

## Other Test Suites

### TypeScript - Faucet Tests

**File**: `typescript-sdk/test/faucet.test.ts`

Tests the faucet functionality for funding new accounts.

```bash
npm run test:faucet
```

**Tests:**
- Validator identity verification
- Faucet account funding
- Multiple account funding
- Total supply tracking

### TypeScript - Verification Tests

**File**: `typescript-sdk/test/verification.test.ts`

General testnet verification tests.

```bash
npm run test:verification
```

### Rust - Basic Tests

**File**: `rust-sdk/tests/basic_test.rs`

Basic testnet functionality tests.

```bash
cargo test --test basic_test -- --nocapture --test-threads=1
```

### Rust - Library Tests

**File**: `rust-sdk/src/lib.rs` (inline tests)

Unit tests for SDK functionality.

```bash
cargo test -- --nocapture --test-threads=1
```

**Tests:**
- `test_docker_lifecycle` - Start/stop testnet
- `test_read_keys_from_storage` - Verify key reading

## CI/CD Considerations

### GitHub Actions / CI

For CI environments, you may want to:

1. **Skip slow tests** by default
2. **Cache the sccache volume** between runs
3. **Use matrix testing** for different configurations

**Example GitHub Actions:**

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      # Cache sccache volume
      - name: Cache sccache
        uses: actions/cache@v3
        with:
          path: ~/.docker/volumes/atomica-sccache
          key: sccache-${{ runner.os }}-${{ hashFiles('**/Cargo.lock') }}

      # Run fast tests only
      - name: Run tests
        run: |
          cd typescript-sdk
          npm run test:verification
          npm run test:faucet
```

### Pre-commit Hook

For local development, add to `.git/hooks/pre-commit`:

```bash
#!/bin/bash
# Run fast tests before commit

cd typescript-sdk
npm run test:verification || exit 1

cd ../rust-sdk
cargo test -- --test-threads=1 || exit 1
```

## Troubleshooting

### Test timeout

**Problem:** Test times out during image build

**Solution:**
```bash
# Increase timeout or build image separately first
cd docker-testnet/config
./build-local-image.sh

# Then run test (will be fast)
cd ../typescript-sdk
npm run test:local-build
```

### sccache not working

**Problem:** Builds are slow even after first build

**Solution:**
```bash
# Check sccache volume exists
docker volume ls | grep atomica-sccache

# View sccache stats
cd docker-testnet/config
./build-local-image.sh --stats

# Rebuild cache
./build-local-image.sh --clean-sccache
```

### Port conflicts

**Problem:** Tests fail with "port already in use"

**Solution:**
```bash
# Stop any running testnets
cd docker-testnet/config
docker compose down -v

# Or kill specific ports
lsof -ti:8080 | xargs kill -9
```

### Docker out of disk space

**Problem:** Docker build fails with "no space left"

**Solution:**
```bash
# Clean up Docker
docker system prune -a --volumes

# Remove sccache if needed
docker volume rm atomica-sccache
```

## Test Coverage

### TypeScript SDK

| Test Suite | Coverage | Duration |
|------------|----------|----------|
| local-build | Image build + testnet | 15-20min (first), 3-5min (cached) |
| faucet | Faucet operations | 2-5min |
| verification | General validation | 1-2min |

### Rust SDK

| Test Suite | Coverage | Duration |
|------------|----------|----------|
| local_build_test | Image build + testnet | 15-20min (first), 3-5min (cached) |
| basic_test | Basic testnet ops | 1-2min |
| lib (inline) | Unit tests | <1min |

## Best Practices

1. **Run fast tests frequently** - Use faucet/verification tests during development
2. **Run local build tests before PR** - Ensure changes work with local builds
3. **Use sccache** - Don't use `--clean-sccache` unless necessary
4. **Sequential execution** - Always use `--test-threads=1` for Rust tests
5. **Monitor resources** - Docker builds use significant CPU/memory

## Related Documentation

- [LOCAL_BUILD.md](./LOCAL_BUILD.md) - Local image building guide
- [KEY_MANAGEMENT.md](./KEY_MANAGEMENT.md) - Key management overview
- [config/README.md](./config/README.md) - Testnet configuration

## Reporting Issues

If tests fail unexpectedly:

1. Check Docker is running: `docker info`
2. Check disk space: `df -h`
3. View logs: `docker compose logs`
4. Report at: https://github.com/bomba-atomica/atomica-aptos/issues
