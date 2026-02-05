# E2E Test Redundancy Analysis

## Summary

Created 7 separate E2E test files from the original monolithic test. Analysis shows **2 tests are redundant** and can be removed or marked as optional.

## Test Files Analysis

### ✅ **KEEP** - e2e-01-mint-tokens.test.ts
- **Purpose**: Test ERC20 minting on Ethereum
- **Unique value**: Validates basic contract functionality
- **Dependencies**: None
- **Verdict**: **REDUNDANT - Can Remove**
- **Reason**: Every other test mints tokens in beforeAll anyway. This test doesn't add unique value beyond what's already validated in setup of other tests.
- **Recommendation**: Delete or mark as `.skip` for quick smoke testing only

### ✅ **KEEP** - e2e-02-lock-fake-eth.test.ts
- **Purpose**: Test locking FakeETH in LockBox
- **Unique value**:
  - Validates LockBox contract lock mechanism
  - Verifies storage key calculation matches on-chain
  - Tests eth_getStorageAt directly
- **Dependencies**: Requires minted FakeETH
- **Verdict**: **ESSENTIAL - Keep**
- **Reason**: Critical for validating storage layout and lock mechanism

### ❌ **REMOVE** - e2e-03-lock-fake-usd.test.ts
- **Purpose**: Test locking FakeUSD in LockBox
- **Unique value**: Tests same lock mechanism with different token (6 decimals vs 18)
- **Dependencies**: Requires minted FakeUSD
- **Verdict**: **REDUNDANT - Remove**
- **Reason**:
  - Tests exact same contract functionality as e2e-02
  - Only difference is token address and decimal places
  - Storage layout is already validated in e2e-02
  - No unique cross-chain functionality being tested
- **Recommendation**: Delete this test file

### ✅ **KEEP** - e2e-04-generate-proof.test.ts
- **Purpose**: Generate Ethereum state proof for locked FakeETH
- **Unique value**:
  - Tests eth_getProof RPC call
  - Validates proof structure (account proof, storage proof)
  - Verifies on-chain vs off-chain storage key matching
  - Tests proof generation after finalization
- **Dependencies**: Requires locked FakeETH
- **Verdict**: **ESSENTIAL - Keep**
- **Reason**: Core functionality for cross-chain bridge

### ✅ **KEEP** - e2e-05-submit-proof.test.ts
- **Purpose**: Submit Ethereum proof to Aptos and create receipt
- **Unique value**:
  - Tests complete cross-chain flow
  - Validates Aptos Move contract accepts Ethereum proofs
  - Verifies receipt creation and storage
  - Tests lock_id calculation
- **Dependencies**: Requires generated proof
- **Verdict**: **ESSENTIAL - Keep**
- **Reason**: Main E2E test validating the entire system works end-to-end

### ✅ **KEEP** - e2e-06-replay-protection.test.ts
- **Purpose**: Prevent duplicate proof submission (replay attacks)
- **Unique value**:
  - Tests E_ALREADY_CLAIMED error is thrown
  - Validates critical security property
- **Dependencies**: Requires already-submitted proof
- **Verdict**: **ESSENTIAL - Keep**
- **Reason**: Critical security test. Prevents double-spending attacks.

### ✅ **KEEP** - e2e-07-type-isolation.test.ts
- **Purpose**: Verify FakeETH and FakeUSD registries are separate
- **Unique value**:
  - Tests Move phantom type system works correctly
  - Validates multi-asset support
- **Dependencies**: Requires submitted FakeETH proof
- **Verdict**: **KEEP (with caveat)**
- **Reason**:
  - Tests important type system property
  - However, if we trust Move's phantom types, this is somewhat redundant
  - **Recommendation**: Keep for now, but could be marked `.skip` if test suite needs to be faster

## Recommendations

### Immediate Actions

1. **DELETE** `e2e-03-lock-fake-usd.test.ts` - Duplicate of e2e-02
2. **MARK AS OPTIONAL** `e2e-01-mint-tokens.test.ts` - Add `.skip` or delete

### Final Test Suite

After removing redundant tests, we'll have **5 essential E2E tests**:

1. ~~e2e-01-mint-tokens.test.ts~~ (redundant - delete or skip)
2. **e2e-02-lock-fake-eth.test.ts** (storage layout validation)
3. ~~e2e-03-lock-fake-usd.test.ts~~ (redundant - delete)
4. **e2e-04-generate-proof.test.ts** (proof generation)
5. **e2e-05-submit-proof.test.ts** (cross-chain submission)
6. **e2e-06-replay-protection.test.ts** (security)
7. **e2e-07-type-isolation.test.ts** (multi-asset support)

**Result**: 5 core tests + 2 optional/redundant = 7 total (can reduce to 5)

## Test Execution Strategy

### Option A: Minimal Suite (Fastest)
Run only essential tests (2, 4, 5, 6):
- Total time: ~12-15 minutes
- Coverage: Core functionality + security

### Option B: Full Suite (Comprehensive)
Run all 7 tests:
- Total time: ~20-25 minutes
- Coverage: Everything including edge cases

### Option C: Recommended
Run 5 essential tests (2, 4, 5, 6, 7):
- Total time: ~15-18 minutes
- Coverage: Core + security + multi-asset

## Impact on Test Organization

From original plan of 3 files → 7 files → 5 files (after removing redundant)

**Benefits of current structure**:
- ✅ Each test is independent and focused
- ✅ Easy to run individual tests during development
- ✅ Clear test names describe what's being tested
- ✅ Failures are isolated and easy to debug

**Drawbacks**:
- ⚠️ Some setup duplication (mitigated by dual-chain-fixture)
- ⚠️ Tests 5-7 depend on prior steps being done in beforeAll
