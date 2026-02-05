# LockBox E2E Test Deep Dive Report
**Date:** 2026-02-05
**Test File:** `tests/meta/cross-chain/lock-receipt-e2e.test.ts`
**Total Tests:** 7 | **Passed:** 4 | **Failed:** 3

---

## Executive Summary

✅ **CRITICAL SUCCESS: The new storage layout works correctly with `eth_getProof`!**

The primary objective—fixing `eth_getProof` compatibility—has been achieved. The refactored single-level mapping storage layout successfully resolves the nested mapping issues that previously caused `eth_getProof` to return 0.

However, there are **Aptos module deployment issues** preventing the cross-chain integration tests from completing.

---

## Test Results

### ✅ PASSING TESTS (4/7)

#### TEST 1: Mint FakeETH and FakeUSD ✅
- **Status:** PASSED
- **Key Actions:**
  - Minted 1,000 FakeETH to test account
  - Minted 5,000 FakeUSD to test account
- **Verification:**
  - Direct `balanceOf` calls confirmed correct amounts
  - Raw `eth_call` debugging showed proper contract responses

#### TEST 2: Lock FakeETH in LockBox ✅
- **Status:** PASSED
- **Key Actions:**
  - Approved LockBox to spend 10 FakeETH
  - Locked 10 FakeETH in block 10
- **Critical Findings:**
  ```
  Lock key (composite): 0x9932b36e3306173f72f21415489f2ff00ea2545d3587974eddc9ad53361ef903
  Storage key (slot 0): 0xa93c65475cce8380a47cd7bfa02635185a71d4e33ccbb396a818f16ac234f349
  Direct storage read: 0x0000000000000000000000000000000000000000000000008ac7230489e80000
  Storage value: 10 ETH ✅
  ```
- **Verification:**
  - ✅ `eth_getStorageAt` returns correct value (10 ETH)
  - ✅ Contract getter `getLockedBalance()` returns 10 ETH
  - ✅ Storage layout verification successful

#### TEST 3: Lock FakeUSD in LockBox ✅
- **Status:** PASSED
- **Key Actions:**
  - Approved and locked 100 FakeUSD in block 12
- **Critical Findings:**
  ```
  Lock key (composite): 0x60de97bb95db69100266804e671203993e5cb2d022a1a98a1fd640ae3c57122f
  Storage key (slot 0): 0x9cb48e994088553d51038c17d883188ee57b9b58fc0fb2983bf737bea23c5388
  Direct storage read: 0x0000000000000000000000000000000000000000000000000000000005f5e100
  Storage value: 100 USD ✅
  ```
- **Verification:**
  - ✅ `eth_getStorageAt` returns correct value (100 USD)
  - ✅ Storage layout works for both FakeETH and FakeUSD

#### TEST 4: Generate Ethereum State Proof ✅
- **Status:** PASSED
- **Duration:** ~141s (waiting for 12 block confirmations)
- **Critical Findings:**
  ```
  🎉 eth_getProof SUCCESS:
    Storage key: 0xa93c65475cce8380a47cd7bfa02635185a71d4e33ccbb396a818f16ac234f349
    Storage value: 0x8ac7230489e80000 (= 10,000,000,000,000,000,000 wei = 10 ETH)
    Account proof: 4 nodes
    Storage proof: 2 nodes
  ✓ eth_getProof returned correct value!
  ```

**THIS IS THE KEY VALIDATION:** The new single-level mapping storage layout successfully works with `eth_getProof`. The problematic nested mapping issue is RESOLVED.

- **Verification Steps:**
  1. ✅ On-chain storage key matches off-chain calculation
  2. ✅ `eth_getStorageAt` confirms storage value = 10 ETH
  3. ✅ `eth_getProof` returns correct storage value = 10 ETH (not 0!)
  4. ✅ Proof structure is valid (4 account nodes, 2 storage nodes)

---

### ❌ FAILING TESTS (3/7)

All failures are due to **Aptos module deployment/indexing issues**, NOT Ethereum proof generation problems.

#### TEST 5: Submit Proof to Aptos ❌
- **Status:** FAILED
- **Error:**
  ```
  AptosApiError: Request to [Fullnode]: GET
  http://127.0.0.1:8080/accounts/0xa32657.../module/lock_receipt
  failed with: {"message":"not found","error_code":"web_framework_error"}
  ```
- **Root Cause:** The `lock_receipt` module is not found on the Aptos blockchain
- **Possible Causes:**
  1. Module didn't deploy correctly
  2. Module needs more time to be indexed (timing issue)
  3. Module name mismatch or incorrect address
  4. Deployment succeeded but module wasn't published correctly

#### TEST 6: Replay Attack Prevention ❌
- **Status:** FAILED (cascading failure from TEST 5)
- **Expected:** Should reject duplicate proof with `E_ALREADY_CLAIMED` error
- **Actual:** Same Aptos module not found error
- **Note:** Cannot test until TEST 5 succeeds

#### TEST 7: Type Isolation ❌
- **Status:** FAILED (cascading failure from TEST 5)
- **Expected:** Verify separate registries for FakeETH and FakeUSD
- **Actual:** Same Aptos module not found error
- **Note:** Cannot test until TEST 5 succeeds

---

## Critical Findings

### ✅ Storage Layout Fix SUCCESSFUL

The refactored storage layout is working perfectly:

**OLD (Broken):**
```solidity
mapping(address => mapping(address => uint256)) public lockedBalances;
// eth_getProof returned 0 ❌
```

**NEW (Working):**
```solidity
mapping(bytes32 => uint256) public lockedBalances;

function getLockKey(address user, address token) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(user, token));
}
// eth_getProof returns correct values ✅
```

**Evidence:**
- Direct storage reads via `eth_getStorageAt`: ✅ Correct
- Contract getter methods: ✅ Correct
- **`eth_getProof` API call: ✅ Correct** (previously returned 0, now returns actual values)

### Storage Key Calculation Verified

Both on-chain and off-chain calculations produce identical results:

**For FakeETH Lock:**
- Composite key: `keccak256(abi.encodePacked(user, token))`
- Storage key: `keccak256(abi.encode(compositeKey, 0))`
- Result: `0xa93c65475cce8380a47cd7bfa02635185a71d4e33ccbb396a818f16ac234f349`
- ✅ Matches between Solidity contract and TypeScript code

**For FakeUSD Lock:**
- Storage key: `0x9cb48e994088553d51038c17d883188ee57b9b58fc0fb2983bf737bea23c5388`
- ✅ Also verified and working

---

## Identified Issues

### 1. Aptos Module Deployment Problem (BLOCKING)

**Severity:** HIGH
**Impact:** Tests 5, 6, 7 cannot run

**Error:**
```
module/lock_receipt failed with: {"message":"not found"}
```

**Investigation Needed:**
1. Check if module was actually published (transaction succeeded but module might not be available)
2. Verify module naming convention (should it be `lock_receipt` or something else?)
3. Check if there's a timing issue (module needs indexing time)
4. Verify the contract compilation and deployment logs

**Observed:**
- Deployment transaction succeeded: `0xb0eec520...` (gas: 14560)
- VM status: "Executed successfully"
- But module queries return 404 Not Found

**Potential Fix:**
- Add longer wait time after deployment for indexing
- Verify module name matches what's being queried
- Check Aptos contract structure (is `lock_receipt` a module or is it `atomica::lock_receipt`?)

### 2. Hex Formatting Issue in Instrumentation (FIXED)

**Severity:** LOW (already fixed)
**Impact:** Caused initial test failure

**Problem:**
- `ethers.toBeHex(10)` produces `"0x0a"` with leading zero
- Geth's `eth_getProof` rejects hex numbers with leading zeros
- Error: `"invalid argument 2: hex number with leading zero digits"`

**Fix Applied:**
```typescript
// OLD (broken):
ethers.toBeHex(lockBlockNumber)  // "0x0a" ❌

// NEW (working):
"0x" + lockBlockNumber.toString(16)  // "0xa" ✅
```

---

## Performance Observations

### Test Timing
- **Setup (both testnets):** ~80-90 seconds
- **Contract deployment:** ~10-15 seconds
- **Each lock operation:** <5 seconds
- **Block finalization wait:** ~120-140 seconds (12 blocks @ ~10s each)
- **Proof generation:** <1 second
- **Total test time:** ~296 seconds (~5 minutes)

### Resource Usage
- Ethereum testnet: 6 containers (1 execution, 1 beacon, 4 validators)
- Aptos testnet: 4 containers (4 validators)
- All containers cleaned up properly after test ✅
- **No zombie containers found** ✅

---

## Recommendations

### Immediate Actions

1. **Fix Aptos Module Deployment**
   - Investigate why `lock_receipt` module returns 404
   - Add debug logging to show which modules are actually deployed
   - Verify module name conventions
   - Possibly increase indexing wait time from 5s to 10-15s

2. **Remove Unnecessary Instrumentation**
   - The direct `eth_getProof` call in TEST 4 can be removed now that we've verified it works
   - Keep the storage key verification (valuable for debugging)

3. **Add Module Verification Step**
   - Before running tests, verify that all required Aptos modules are accessible
   - Query the account to list all deployed modules
   - Fail fast if modules aren't found rather than cascading failures

### Future Improvements

1. **Add Retry Logic**
   - Aptos module queries might need retry logic with backoff
   - Module indexing can be async

2. **Better Error Messages**
   - Distinguish between "module not deployed" vs "module not indexed yet"
   - Provide actionable error messages

3. **Test Isolation**
   - Consider making TEST 5, 6, 7 conditional on TEST 4 success
   - Or add explicit module existence checks before attempting transactions

---

## Conclusion

### ✅ PRIMARY OBJECTIVE ACHIEVED

**The new storage layout successfully fixes the `eth_getProof` compatibility issue.**

Evidence:
- `eth_getStorageAt`: Returns correct values ✅
- `eth_getProof`: Returns correct values ✅ (previously returned 0)
- Storage key calculation: Matches between on-chain and off-chain ✅
- Multiple tokens tested: Both FakeETH and FakeUSD work ✅

### ⚠️ SECONDARY ISSUE IDENTIFIED

**Aptos module deployment needs investigation**

This is a separate issue from the storage layout fix and does not invalidate the success of the primary objective. The Ethereum side of the cross-chain flow is working correctly.

### Next Steps

1. Investigate Aptos module deployment (check module naming, indexing time)
2. Add module verification before tests
3. Re-run tests after Aptos fix
4. All tests should pass once Aptos issue is resolved

---

## Test Instrumentation Added

The following diagnostic logging was added to help debug issues:

1. **Storage Layout Verification:**
   - Log composite lock keys
   - Log storage slot keys
   - Verify on-chain vs off-chain key calculation
   - Direct storage reads via `eth_getStorageAt`

2. **Proof Generation Details:**
   - Block hash and state root
   - Number of proof nodes
   - Storage value in multiple formats
   - Direct `eth_getProof` API testing

3. **Aptos Transaction Details:**
   - Full transaction payload logging
   - Function arguments verification
   - Receipt verification with detailed output

This instrumentation can remain in the test to aid future debugging.
