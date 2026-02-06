# Aptos LockBox Module Deployment - Isolated E2E Test Plan

**Date:** 2026-02-05
**Status:** Implemented
**File:** `source/atomica-web/tests/meta/aptos/lockbox-module-deployment.test.ts`

## Background

The cross-chain lock receipt E2E test (`lock-receipt-e2e.test.ts`) has 3 failing tests (Tests 5-7) due to Aptos module deployment/indexing issues. These failures cascade from an inability to find the `lock_receipt` module on the Aptos chain:

```
AptosApiError: module/lock_receipt failed with: {"message":"not found","error_code":"web_framework_error"}
```

This is **separate** from the successful `eth_getProof` fix (Tests 1-4 pass).

## Problem

The main E2E test includes both:
1. Ethereum side (minting, locking, proof generation) - **Working**
2. Aptos side (module deployment, view function calls) - **Failing**

When Aptos module deployment fails, it causes cascading failures in all subsequent tests, making it difficult to isolate and debug the issue.

## Solution: Isolated Test Suite

Create a separate, focused E2E test that isolates the Aptos module deployment issue:

### Test Coverage

| Test | Description | Validates |
|------|-------------|-----------|
| TEST 1 | Deploy `lock_receipt` module | Module deployment succeeds and is indexed |
| TEST 2 | List deployed modules | `lock_receipt` appears in account modules |
| TEST 3 | Call `get_asset_count` | View function works (no 404) |
| TEST 4 | Call `is_asset_registered` (FakeETH) | View function works (no 404) |
| TEST 5 | Call `is_asset_registered` (FakeUSD) | View function works (no 404) |
| TEST 6 | Call `get_receipt_count` | View function works (no 404) |
| TEST 7 | Initialize FakeETH registry | Initialization succeeds |
| TEST 8 | Initialize FakeUSD registry | Initialization succeeds |
| TEST 9 | Call `get_asset_count` after init | Returns correct count (2) |
| TEST 10 | Verify `is_asset_registered` returns true | Both assets registered |
| TEST 11 | Verify `get_receipt_count` returns 0 | Fresh registries are empty |

### Key Features

1. **No Ethereum Dependencies**: Completely isolates Aptos module issues
2. **Explicit 404 Detection**: Each view function test catches and fails with descriptive message if 404 occurs
3. **Step-by-Step Verification**: Validates each stage independently
4. **Quick Iteration**: Faster to run than full E2E (no block finalization wait)

### 404 Error Detection Pattern

```typescript
try {
  const result = await viewFunction(...);
} catch (error: any) {
  if (error.message.includes("not found") || error.message.includes("404")) {
    throw new Error(`View function returned 404: ${error.message}`);
  }
  throw error;
}
```

## Running the Tests

```bash
cd source/atomica-web
bun run test:meta tests/meta/aptos/lockbox-module-deployment.test.ts
```

Or run all meta tests including the new one:

```bash
cd source/atomica-web
bun run test:meta
```

## Test Results

**All 10 tests PASS ✓**

```
Test File: source/atomica-web/tests/meta/aptos/lockbox-module-deployment.test.ts
Tests Run: 10 | Passed: 10 | Failed: 0
Duration: ~43 seconds (excluding testnet startup)
```

### Passing Tests
1. ✓ Deploy atomica-move-contracts including lock_receipt
2. ✓ Verify module has expected view functions (6 functions found)
3. ✓ Initialize FakeETH registry
4. ✓ Initialize FakeUSD registry
5. ✓ Call is_registry_initialized for FakeETH
6. ✓ Call is_registry_initialized for FakeUSD
7. ✓ Call get_receipt_count
8. ✓ Call is_lock_claimed
9. ✓ Call get_total_locked
10. ✓ Call get_receipt (correctly returns NOT_FOUND for non-existent receipt)

## Root Cause Analysis

The original E2E test failures were caused by:

1. **Missing Registry Initialization**: The `lock_receipt` module requires explicit initialization for each Chain/Asset pair:
   ```move
   lock_receipt::initialize<Ethereum, FakeETH>(account)
   lock_receipt::initialize<Ethereum, FakeUSD>(account)
   ```
   The `deployContracts` helper only initializes `registry`, `fake_eth`, and `fake_usd` - not `lock_receipt` registries.

2. **View Function Names**: The expected functions `get_asset_count` and `is_asset_registered` don't exist. The actual functions are:
   - `is_registry_initialized<Chain, Asset>()` - checks if registry exists
   - `get_receipt_count<Chain, Asset>()` - counts receipts
   - `get_total_locked<Chain, Asset>()` - total locked value
   - `is_lock_claimed<Chain, Asset>(lock_id)` - checks replay protection
   - `get_receipt<Chain, Asset>(lock_id)` - retrieves receipt

## Fix Required for Main E2E Test

Update `lock-receipt-e2e.test.ts` to:
1. Call `lock_receipt::initialize<Ethereum, FakeETH>()` after deployment
2. Call `lock_receipt::initialize<Ethereum, FakeUSD>()` after deployment
3. Use correct function names (`is_registry_initialized` not `is_asset_registered`)

## Files Modified

- **Added**: `source/atomica-web/tests/meta/aptos/lockbox-module-deployment.test.ts`

## Related Files

- `source/atomica-move-contracts/sources/lock_receipt.move` - Move module source
- `source/atomica-web/tests/meta/cross-chain/lock-receipt-e2e.test.ts` - Main E2E test
- `lockbox-e2e-test-report.md` - Previous test results

## Next Steps

1. Run isolated Aptos module deployment tests
2. Fix any 404/module accessibility issues found
3. Re-run main E2E test to verify all 7 tests pass
4. Merge isolated test into main test suite or keep as debugging tool
