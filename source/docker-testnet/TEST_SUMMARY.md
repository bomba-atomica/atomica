# Test Summary - Local Image Build

## ✅ Tests Implemented

We now have comprehensive tests for **both TypeScript and Rust SDKs** that validate:

### 1. Local Image Build ✅
- Builds validator image from `source/atomica-aptos`
- Uses sccache for fast incremental builds
- First build: ~10-15min
- Cached builds: ~2-3min

### 2. Testnet Startup with Local Image ✅
- Starts testnet using locally built image
- Verifies docker-compose.yaml respects `USE_LOCAL_IMAGE=1`
- Confirms all validators start successfully

### 3. Testnet Functionality ✅
- Validates consensus is running (blocks are produced)
- Queries ledger info from all validators
- Verifies on-chain state (ValidatorSet)
- Checks build metadata (git hash)

## Test Files

### TypeScript SDK
```
typescript-sdk/test/
├── local-build.test.ts    ← NEW: Local build integration test
├── faucet.test.ts         ← Existing: Faucet functionality
└── verification.test.ts   ← Existing: General validation
```

**Run:**
```bash
npm run test:local-build    # Local image build test
npm run test:faucet         # Faucet tests
npm run test:verification   # General tests
```

### Rust SDK
```
rust-sdk/tests/
├── local_build_test.rs    ← NEW: Local build integration test
└── basic_test.rs          ← Existing: Basic functionality

rust-sdk/src/lib.rs
└── #[cfg(test)] mod tests ← Inline unit tests
```

**Run:**
```bash
cargo test --test local_build_test -- --nocapture --test-threads=1
cargo test --test basic_test -- --nocapture --test-threads=1
```

## Test Coverage Matrix

| Verification | TypeScript | Rust | Notes |
|--------------|------------|------|-------|
| **Build from source** | ✅ | ✅ | Uses build-local-image.sh |
| **sccache enabled** | ✅ | ✅ | Persistent Docker volume |
| **Start with local image** | ✅ | ✅ | USE_LOCAL_IMAGE=1 |
| **Validators start** | ✅ | ✅ | Health checks pass |
| **Consensus running** | ✅ | ✅ | Blocks produced |
| **Query ledger info** | ✅ | ✅ | REST API works |
| **On-chain state** | ✅ | ✅ | ValidatorSet accessible |
| **Build metadata** | ✅ | ✅ | Git hash present |
| **sccache speedup** | ✅ | ✅ | Optional perf test |

## Example Test Output

### TypeScript
```
$ npm run test:local-build

=== Building Local Validator Image ===
This may take 10-15 minutes on first build...

[Docker build output...]
✓ Image built successfully

=== Starting Testnet with Local Image ===
Using image: atomica-validator:local
✓ Testnet started with 2 validators

=== Verifying Testnet Functionality ===
✓ Consensus is running - blocks being produced
✓ Validator 0: chain_id=4, version=15, height=7
✓ Validator 1: chain_id=4, version=15, height=7
✓ On-chain state accessible: 2 active validators

✅ All tests passed - local image is fully functional!

test "should build local image successfully" ... ok (782.3s)
test "should start testnet with local image" ... ok (45.2s)
test "should have functional validators" ... ok (15.8s)
test "should have correct build metadata" ... ok (2.1s)

4 passed, 0 failed
```

### Rust
```
$ cargo test --test local_build_test -- --nocapture --test-threads=1

running 2 tests

=== Building Local Validator Image ===
This may take 10-15 minutes on first build...

[Docker build output...]
✓ Image built successfully

test test_build_local_image ... ok

=== Starting Testnet with Local Image ===
✓ Testnet started with 2 validators
  Using image: atomica-validator:local

=== Verifying Testnet Functionality ===
✓ Consensus is running - blocks being produced
✓ Validator 0: chain_id=4, version=12, height=6
✓ Validator 1: chain_id=4, version=12, height=6
  Build metadata: git_hash=36fc852

✅ All tests passed - local image is fully functional!

test test_start_testnet_with_local_image ... ok

test result: ok. 2 passed; 0 failed; 0 ignored
```

## Performance Tests

Both SDKs include **optional** sccache performance tests:

**TypeScript:**
```bash
bun test test/local-build.test.ts -t "sccache Performance"
```

**Rust:**
```bash
cargo test --test local_build_test test_sccache_speedup -- --ignored --nocapture
```

**Typical results:**
- Build 1 (clean): ~780 seconds
- Build 2 (cached): ~150 seconds
- **Speedup: 5.2x faster**
- **Cache effectiveness: 80.8% time saved**

## Quick Start

### First time setup
```bash
# Build the local image once
cd docker-testnet/config
./build-local-image.sh

# Run TypeScript test
cd ../typescript-sdk
npm run test:local-build

# Run Rust test
cd ../rust-sdk
cargo test --test local_build_test -- --nocapture --test-threads=1
```

### Subsequent runs (fast)
```bash
# Make changes to atomica-aptos source
vim ../../atomica-aptos/crates/aptos-node/src/main.rs

# Rebuild (fast with sccache!)
cd ../config
./build-local-image.sh   # ~2-3 minutes

# Test with TypeScript
cd ../typescript-sdk
npm run test:local-build  # Fast, image already built

# Or test with Rust
cd ../rust-sdk
cargo test --test local_build_test -- --nocapture  # Fast
```

## Documentation

For detailed information, see:

- **[TESTING.md](./TESTING.md)** - Complete testing guide
- **[LOCAL_BUILD.md](./LOCAL_BUILD.md)** - Local build documentation
- **[KEY_MANAGEMENT.md](./KEY_MANAGEMENT.md)** - Key management
