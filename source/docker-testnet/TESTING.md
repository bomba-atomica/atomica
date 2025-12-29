# Testing Guide - Docker Testnet SDKs

This document explains how to run tests for the TypeScript and Rust Docker testnet SDKs, including the comprehensive local image build tests.

## Overview

Both SDKs have test suites that validate:
1. **Testnet functionality** - Start validators and verify consensus
2. **Key management** - Read keys from storage (not generate)
3. **Faucet operations** - Fund accounts in test mode

## Quick Reference

### TypeScript SDK

```bash
cd typescript-sdk

# All tests
npm test

# Specific tests
npm run test:faucet         # Faucet functionality
npm run test:verification   # General verification
```

### Rust SDK

```bash
cd rust-sdk

# All tests (sequential)
cargo test -- --nocapture --test-threads=1

# Specific tests
cargo test --test basic_test -- --nocapture --test-threads=1
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

## Troubleshooting

### Test timeout

**Problem:** Test times out during validator startup

**Solution:**
- Check Docker is running: `docker info`
- View logs: `docker compose logs`
- Increase timeout in `verification.test.ts` (currently 5 minutes)

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

## Test Coverage

### TypeScript SDK

| Test Suite | Coverage | Duration |
|------------|----------|----------|
| faucet | Faucet operations | 2-5min |
| verification | General validation | 1-2min |

### Rust SDK

| Test Suite | Coverage | Duration |
|------------|----------|----------|
| basic_test | Basic testnet ops | 1-2min |
| lib (inline) | Unit tests | <1min |

## Best Practices

1. **Run fast tests frequently** - Use faucet/verification tests during development
2. **Sequential execution** - Always use `--test-threads=1` for Rust tests
3. **Monitor resources** - Docker nodes use significant memory

## Related Documentation

- [KEY_MANAGEMENT.md](./KEY_MANAGEMENT.md) - Key management overview
- [config/README.md](./config/README.md) - Testnet configuration

## Reporting Issues

If tests fail unexpectedly:

1. Check Docker is running: `docker info`
2. Check disk space: `df -h`
3. View logs: `docker compose logs`
4. Report at: https://github.com/bomba-atomica/atomica-aptos/issues
