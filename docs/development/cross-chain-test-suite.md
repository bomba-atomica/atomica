# Cross-Chain Test Suite Documentation

**Last Updated**: 2026-02-06
**Test Framework**: Vitest
**Test Location**: `atomica-web/tests/meta/cross-chain/`

---

## Overview

The cross-chain test suite validates the complete Ethereum ↔ Aptos bridge functionality, including:
- Token locking on Ethereum
- State proof generation
- Proof verification on Aptos
- Lock receipt creation
- Security (replay attack prevention)
- Type isolation (multi-asset support)

---

## Test Suite Architecture

### Directory Structure

```
tests/meta/cross-chain/
├── e2e-01-mint-tokens.test.ts              # Mint ERC20 tokens
├── e2e-02-lock-fake-eth.test.ts            # Lock FakeETH in LockBox
├── e2e-03-generate-proof.test.ts           # Generate Ethereum state proof
├── e2e-04-submit-proof.test.ts             # Submit proof to Aptos
├── e2e-05-replay-protection.test.ts        # Test replay attack prevention
├── e2e-06-type-isolation.test.ts           # Test multi-asset registry isolation
├── helpers/
│   ├── dual-chain-fixture.ts               # Shared Ethereum + Aptos setup
│   └── aptos-view-utils.ts                 # Aptos view function helpers
├── TEST_REDUNDANCY_ANALYSIS.md             # Analysis of test redundancy
├── REFACTOR_SUMMARY.md                     # Refactor documentation
└── lock-receipt-e2e.test.ts.old            # Original monolithic test (deprecated)
```

### Design Principles

1. **Independent Tests**: Each test file is self-contained and can run independently
2. **Shared Fixtures**: Common setup logic extracted to `dual-chain-fixture.ts`
3. **Fresh State**: Each test generates fresh proofs and state (no hardcoded fixtures)
4. **Comprehensive Validation**: Tests verify both happy paths and security properties
5. **Clear Naming**: Test names clearly describe what is being tested

---

## Individual Tests

### e2e-01: Mint Tokens ✅

**Purpose**: Verify ERC20 token minting on Ethereum

**Status**: ✅ PASSING
**Runtime**: ~115s (~2 minutes)

**What it tests**:
- Minting FakeETH (18 decimals)
- Minting FakeUSD (6 decimals)
- Balance verification on-chain

**Dependencies**: None

**Amounts**:
- FakeETH: 1,000 tokens (1000 * 10^18 wei)
- FakeUSD: 5,000 tokens (5000 * 10^6 units)

**Key validations**:
```typescript
expect(ethBalance).toBe(MINT_AMOUNT_ETH);
expect(usdBalance).toBe(MINT_AMOUNT_USD);
```

---

### e2e-02: Lock FakeETH ✅

**Purpose**: Validate LockBox contract and storage layout

**Status**: ✅ PASSING
**Runtime**: ~130s (~2.2 minutes)

**What it tests**:
- ERC20 approval for LockBox
- Locking tokens in LockBox contract
- Storage key calculation (on-chain vs off-chain)
- Direct storage read via `eth_getStorageAt`

**Dependencies**: Mints FakeETH in `beforeAll`

**Amounts**:
- Locks: 10.0 FakeETH

**Key validations**:
```typescript
expect(lockedBalance).toBe(LOCK_AMOUNT_ETH);
expect(storageValueBigInt).toBe(LOCK_AMOUNT_ETH);
```

**Critical verification**:
- Storage layout works with `eth_getProof` (single-level mapping with composite keys)
- See: `/docs/development/ethereum-storage-proof-quirks.md`

---

### e2e-03: Lock FakeUSD ❌

**Status**: ❌ DELETED (redundant)

**Reason**: Duplicate of e2e-02 with different token. Storage layout is already validated.

**Analysis**: See `TEST_REDUNDANCY_ANALYSIS.md`

---

### e2e-03: Generate Ethereum State Proof ✅

**Purpose**: Test Ethereum state proof generation

**Status**: ✅ PASSING
**Runtime**: ~272s (~4.5 minutes)

**What it tests**:
- Waiting for block finalization (12 confirmations)
- Storage key matching (on-chain vs off-chain)
- `eth_getProof` RPC call
- Proof structure validation
- Proof data integrity

**Dependencies**: Mints and locks FakeETH in `beforeAll`

**Finalization**: Waits for 12 blocks after lock transaction

**Key validations**:
```typescript
expect(onChainStorageKey).toBe(offChainStorageKey);
expect(rawStorageValue).toBe(LOCK_AMOUNT_ETH);
expect(proof.accountProof.length).toBeGreaterThan(0);
expect(proof.storageProof.length).toBeGreaterThan(0);
expect(BigInt(proof.storageValue)).toBe(LOCK_AMOUNT_ETH);
```

**Proof structure**:
- Block number: Lock block
- Block hash: 32 bytes
- State root: 32 bytes
- Account proof: Array of RLP-encoded nodes
- Storage proof: Array of RLP-encoded nodes
- Storage key: 32 bytes
- Storage value: uint256

**Critical verification**:
- `eth_getProof` returns non-zero values (confirms storage layout fix)
- Proof can be serialized for Aptos submission

---

### e2e-04: Submit Proof to Aptos ✅

**Purpose**: Test complete cross-chain flow

**Status**: ✅ PASSING
**Runtime**: ~272s (~4.5 minutes)

**What it tests**:
- Proof submission to Aptos Move contract
- Lock receipt creation
- Receipt data validation
- Lock claim status
- Registry metrics update

**Dependencies**: Full flow - mints, locks, generates proof in `beforeAll`

**Aptos transaction**:
```move
lock_receipt::register_ethereum_lock<FakeETH>(
    block_number: u64,
    block_hash: vector<u8>,
    state_root: vector<u8>,
    lockbox_address: vector<u8>,
    user_address: vector<u8>,
    token_address: vector<u8>,
    storage_key: vector<u8>,
    storage_value: u256,
    account_proof: vector<vector<u8>>,
    storage_proof: vector<vector<u8>>
)
```

**Key validations**:
```typescript
expect(isClaimed[0]).toBe(true);
expect(receiptAmount.toString()).toBe(proof.storageValue.toString());
expect(receiptBlock.toString()).toBe(proof.blockNumber.toString());
expect(receiptStatus).toBe(0); // ACTIVE
expect(receiptCount[0].toString()).toBe("1");
```

**Receipt verification**:
- Lock ID calculated from proof components
- Receipt contains correct user, amount, block, status
- Registry count incremented

---

### e2e-05: Replay Attack Prevention ✅

**Purpose**: Test security against duplicate submissions

**Status**: ✅ PASSING
**Runtime**: ~272s (~4.5 minutes)

**What it tests**:
- Duplicate proof submission is rejected
- Error code `E_ALREADY_CLAIMED` is returned
- Lock cannot be claimed twice

**Dependencies**: Full flow + proof submission in `beforeAll`

**Actual behavior**:
- ✅ Duplicate proof submission correctly rejected
- ✅ Error contains `E_ALREADY_CLAIMED`
- ✅ Lock cannot be claimed twice
- ✅ Registry replay protection working as designed

---

### e2e-06: Type Isolation ✅

**Purpose**: Test multi-asset registry isolation

**Status**: ✅ PASSING
**Runtime**: ~272s (~4.5 minutes)

**What it tests**:
- FakeETH and FakeUSD have separate registries
- Receipt counts are independent
- Phantom types work correctly

**Dependencies**: Submits FakeETH proof only in `beforeAll`

**Actual results**:
- ✅ FakeETH registry: 1 receipt
- ✅ FakeUSD registry: 0 receipts
- ✅ Phantom types correctly isolate registries
- ✅ No cross-contamination between asset types

---

## Shared Infrastructure

### Dual-Chain Fixture

**File**: `helpers/dual-chain-fixture.ts`

**Purpose**: Provide shared Ethereum + Aptos testnet setup

**What it does**:
1. Starts both testnets in parallel
2. Deploys Ethereum contracts (FakeETH, FakeUSD, LockBox)
3. Deploys Aptos Move modules (lock_receipt, registry, fake_eth, fake_usd)
4. Waits for module indexing with robust exponential backoff
5. Initializes Aptos registries

**Functions**:
```typescript
setupDualChainFixture(options?: {
  useShared?: boolean;      // Use singleton instance (default: false)
  ethereumSlots?: number;   // Number of validators (default: 4)
  aptosSlots?: number;      // Number of validators (default: 4)
}): Promise<DualChainFixture>

teardownDualChainFixture(fixture: DualChainFixture): Promise<void>
```

**Fixture structure**:
```typescript
interface DualChainFixture {
  eth: {
    testnet: EthereumDockerTestnet;
    provider: ethers.JsonRpcProvider;
    signer: ethers.Wallet;
    contracts: {
      fakeETH: string;
      fakeUSD: string;
      lockBox: string;
    };
  };
  aptos: {
    testnet: DockerTestnet;
    client: Aptos;
    account: Account;
    deployer: Account;
    moduleAddress: string;
  };
}
```

**Setup time**: ~90-120 seconds

**Key features**:
- Parallel testnet startup (faster than sequential)
- Robust module indexing (exponential backoff, 90s timeout)
- Comprehensive logging
- Clean teardown

---

### Module Indexing Helper

**File**: `../aptos/helpers/module-indexing-utils.ts`

**Purpose**: Robustly wait for Aptos modules to be indexed

**Problem solved**: Original tests had 60s timeout with 2s polling, frequently timing out

**Solution**:
- Exponential backoff: 1s → 2s → 4s → 8s → 10s (max)
- 90s timeout (increased from 60s)
- Rich error capture (last 5 errors on failure)
- Module callable verification
- Comprehensive diagnostics

**Function**:
```typescript
waitForModuleIndexed(
  client: Aptos,
  moduleAddress: string,
  moduleName: string,
  options?: {
    maxWaitMs?: number;          // Default: 90000
    exponentialBackoff?: boolean; // Default: true
    captureErrors?: boolean;      // Default: true
    initialDelayMs?: number;      // Default: 1000
  }
): Promise<ModuleIndexingResult>
```

**Result**:
```typescript
interface ModuleIndexingResult {
  success: boolean;
  attempts: number;
  errors: Array<{ timestamp: number; error: string }>;
  totalWaitMs: number;
}
```

**Performance**: Typically detects modules in 0-2 seconds (1-2 attempts)

---

## Running Tests

### Run All Cross-Chain Tests

```bash
cd source/atomica-web
bun test tests/meta/cross-chain/
```

### Run Individual Tests

```bash
# Test 01: Mint tokens
bun test tests/meta/cross-chain/e2e-01-mint-tokens.test.ts

# Test 02: Lock FakeETH
bun test tests/meta/cross-chain/e2e-02-lock-fake-eth.test.ts

# Test 03: Generate proof
bun test tests/meta/cross-chain/e2e-03-generate-proof.test.ts

# Test 04: Submit proof
bun test tests/meta/cross-chain/e2e-04-submit-proof.test.ts

# Test 05: Replay protection
bun test tests/meta/cross-chain/e2e-05-replay-protection.test.ts

# Test 06: Type isolation
bun test tests/meta/cross-chain/e2e-06-type-isolation.test.ts
```

### Run with Specific Timeout

```bash
bun test tests/meta/cross-chain/e2e-04-submit-proof.test.ts --timeout 600000
```

---

## Test Execution Flow

Each test follows this pattern:

```typescript
describe("E2E XX: Test Name", () => {
  let fixture: DualChainFixture;

  beforeAll(async () => {
    // 1. Setup dual-chain testnet
    fixture = await setupDualChainFixture();

    // 2. Perform prerequisite actions
    //    (mint, lock, generate proof, etc.)

  }, 600000); // 10 minute timeout

  afterAll(async () => {
    // 3. Clean teardown
    if (fixture) {
      await teardownDualChainFixture(fixture);
    }
  });

  it("should test specific behavior", async () => {
    // 4. Execute test
    // 5. Validate results
  }, 300000); // 5 minute timeout
});
```

---

## Performance Metrics

| Test | Setup | Test | Total | Status | Key Operation |
|------|-------|------|-------|--------|---------------|
| e2e-01 | 90s | 25s | 115s | ✅ | Token minting |
| e2e-02 | 90s | 40s | 130s | ✅ | Token locking |
| e2e-03 | 90s | 182s | 272s | ✅ | Proof generation (12 block wait) |
| e2e-04 | 90s | 182s | 272s | ✅ | Proof submission |
| e2e-05 | 90s | 182s | 272s | ✅ | Replay protection |
| e2e-06 | 90s | 182s | 272s | ✅ | Type isolation |

**Total sequential runtime**: ~1,331s (~22 minutes for all 6 tests)

**Bottlenecks**:
- Dual-chain setup: 90s (required for each test)
- Block finalization: 12 blocks × ~12s = 144s
- Module indexing: 0-2s (instant with new helper)

---

## Common Issues & Solutions

### Issue: Module Indexing Timeout

**Symptom**: `lock_receipt module failed to index within 60s`

**Root Cause**: Original 2s polling interval was too slow

**Solution**: ✅ Fixed with exponential backoff helper
- Now detects modules in 0-2s
- 90s timeout provides safety margin

**Result**: No more indexing timeouts!

---

### Issue: eth_getProof Returns Zero

**Symptom**: Storage proof has `value: 0x0` even though balance is locked

**Root Cause**: Geth's `eth_getProof` doesn't work reliably with nested mappings

**Solution**: ✅ Changed storage layout to single-level mapping
```solidity
// OLD (doesn't work):
mapping(address => mapping(address => uint256)) public lockedBalances;

// NEW (works):
mapping(bytes32 => uint256) public lockedBalances;
function getLockKey(address user, address token) public pure returns (bytes32);
```

**Documentation**: See `/docs/development/ethereum-storage-proof-quirks.md`

**Result**: `eth_getProof` now returns correct values!

---

### Issue: Transaction Nonce Errors

**Symptom**: `replacement fee too low` or nonce errors

**Root Cause**: Rapid sequential transactions without nonce management

**Solution**: Use explicit nonce management
```typescript
let nonce = await signer.getNonce();
await sendAndWaitForTx(tx1, 1, { nonce: nonce++ });
await sendAndWaitForTx(tx2, 1, { nonce: nonce++ });
```

**Result**: Sequential transactions execute reliably

---

### Issue: Test Flakiness

**Symptom**: Tests pass locally but fail in CI

**Root Causes**:
1. Not waiting for finalization
2. Race conditions in module indexing
3. Insufficient block confirmations

**Solutions**:
1. ✅ Explicit `waitForBlocks(12)` after lock transactions
2. ✅ Robust module indexing with exponential backoff
3. ✅ Verify blocks are actually finalized before querying proofs

---

## Debugging

### Enable Verbose Logging

Tests already include comprehensive logging. Look for:
- `[PHASE X]` - Setup phases
- `[Module Indexing]` - Module detection progress
- `[TEST X]` - Test execution steps
- `✓` - Success indicators
- `✗` - Failure indicators

### Check Container Logs

```bash
# List running containers
docker ps

# View Ethereum logs
docker logs eth-execution

# View Aptos logs
docker logs <aptos-validator-container>
```

### Inspect Test Artifacts

Tests log key information:
- Contract addresses
- Transaction hashes
- Block numbers
- Proof structures
- Receipt data

### Common Debug Points

1. **Setup Phase**: Verify both testnets start
2. **Contract Deployment**: Check bytecode exists
3. **Module Indexing**: Verify module is callable
4. **Transaction Execution**: Check tx status = 1
5. **Proof Generation**: Verify non-zero storage value
6. **Proof Submission**: Check Aptos tx success

---

## Test Data

### Ethereum Addresses

**Deployer**: `0x8943545177806ED17B9F23F0a21ee5948eCaa776`
**Contracts**: Deterministic per test run (see logs)

### Aptos Addresses

**Deployer**: `0x44eb548f999d11ff192192a7e689837e3d7a77626720ff86725825216fcbd8aa`
**Test Account**: `0x147e4d3a5b10eaed2a93536e284c23096dfcea9ac61f0a8420e5d01fbd8f0ea8`

### Token Amounts

| Token | Mint | Lock | Decimals |
|-------|------|------|----------|
| FakeETH | 1,000 | 10 | 18 |
| FakeUSD | 5,000 | 100 | 6 |

---

## Best Practices

### When Writing New Tests

1. **Use the dual-chain fixture** for consistency
2. **Generate fresh proofs** (don't use hardcoded fixtures)
3. **Wait for finalization** (12 blocks minimum)
4. **Verify all assertions** (don't skip validations)
5. **Clean up** (use `afterAll` to teardown)

### Test Independence

- Each test should be runnable independently
- Don't rely on global state or test execution order
- Use `beforeAll` to set up prerequisites

### Performance

- Minimize setup duplication (use shared fixture)
- Run independent tests in parallel when possible
- Use appropriate timeouts (don't set too low)

---

## Continuous Integration

### GitHub Actions

Tests run automatically on:
- Pull requests to `main`
- Commits to `main`
- Manual workflow dispatch

### Expected CI Runtime

- Full suite: ~25-30 minutes
- Individual test: ~2-5 minutes

### CI Configuration

```yaml
test-cross-chain:
  runs-on: ubuntu-latest
  timeout-minutes: 40
  steps:
    - uses: actions/checkout@v3
    - uses: oven-sh/setup-bun@v1
    - run: bun install
    - run: bun test tests/meta/cross-chain/
```

---

## Future Improvements

### Potential Optimizations

1. **Shared fixture across tests**: Reduce total runtime by reusing setup
   - Pro: Faster test execution
   - Con: Less isolation, potential for state leakage

2. **Parallel test execution**: Run independent tests concurrently
   - Challenge: Resource constraints (Docker containers)
   - Benefit: ~3x speedup possible

3. **Fixture proof option**: Allow tests to use pre-generated proofs
   - Pro: Much faster test execution
   - Con: Less comprehensive (doesn't test proof generation)

4. **Snapshot testing**: Cache blockchain state between runs
   - Pro: Instant setup
   - Con: Complexity, potential for stale state

### Test Coverage Gaps

1. **Invalid proof testing**: Test various malformed proofs
2. **Edge cases**: Zero amounts, max uint256 values
3. **Multiple users**: Test concurrent proof submissions
4. **Different block numbers**: Test proof from various blocks
5. **Network failures**: Test resilience to RPC errors

---

## References

- [Ethereum Storage Proof Quirks](/docs/development/ethereum-storage-proof-quirks.md)
- [Test Redundancy Analysis](../atomica-web/tests/meta/cross-chain/TEST_REDUNDANCY_ANALYSIS.md)
- [Refactor Summary](../atomica-web/tests/meta/cross-chain/REFACTOR_SUMMARY.md)
- [Implementation Status](/IMPLEMENTATION_STATUS.md)
- [Test Results](/TEST_RESULTS.md)

---

## Contact & Support

For questions or issues:
1. Check test logs for error messages
2. Review this documentation
3. Check referenced documents above
4. Create an issue in the repository
