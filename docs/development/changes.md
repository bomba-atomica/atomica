# Storage Layout Changes - Summary

## Changes Made

### 1. Contract Changes (LockBox.sol)
- ✅ Changed storage from nested mappings to single-level mappings
- ✅ Added `getLockKey(address, address) → bytes32` helper function
- ✅ Added `calculateUnlockTimeStorageKey(address, address) → bytes32` helper
- ✅ Updated all internal functions to use composite keys
- ✅ Maintained backward-compatible view function APIs

### 2. TypeScript Changes
- ✅ Updated `storage-key.ts` with new calculation logic
- ✅ Added `getLockKey()` export
- ✅ Updated storage key calculation for single-level mappings

### 3. Test Updates
- ✅ `proof-generation-simple.test.ts` - Updated to use `getLockedBalance()`
- ✅ `eth-getproof-basic.test.ts` - Updated to use `getLockedBalance()`
- ✅ `proof-viem-test.test.ts` - Updated to use `getLockedBalance()`
- ✅ `proof-generation-debug.test.ts` - Updated to use `getLockedBalance()`

### 4. Documentation
- ✅ Created `docs/development/ethereum-storage-proof-quirks.md` - Comprehensive guide
- ✅ Created `docs/STORAGE_LAYOUT_CHANGES.md` - Migration guide
- ✅ Updated memory with solution details

## Next Steps

1. **Compile contracts:**
   ```bash
   cd evm-contracts
   forge build
   ```

2. **Run tests:**
   ```bash
   cd ../atomica-web
   bun run test:meta tests/meta/ethereum/proof-generation.test.ts
   ```

3. **Verify eth_getProof now works:**
   - Should return actual storage values (not 0)
   - Tests should pass without 300s timeouts

## Expected Outcome

After recompiling contracts, `eth_getProof` should now return correct storage values because:
- Single-level mappings work reliably with Geth
- Storage key calculation matches new layout
- Tests use proper API (`getLockedBalance()`)

## Files Modified

### Contracts
- `evm-contracts/src/escrow/LockBox.sol`

### TypeScript
- `atomica-web/src/lib/ethereum/proofs/storage-key.ts`
- `atomica-web/src/lib/ethereum/proofs/index.ts`

### Tests
- `atomica-web/tests/meta/ethereum/proof-generation-simple.test.ts`
- `atomica-web/tests/meta/ethereum/eth-getproof-basic.test.ts`
- `atomica-web/tests/meta/ethereum/proof-viem-test.test.ts`
- `atomica-web/tests/meta/ethereum/proof-generation-debug.test.ts`

### Documentation
- `docs/development/ethereum-storage-proof-quirks.md` (NEW)
- `docs/STORAGE_LAYOUT_CHANGES.md` (NEW)
- `atomica-web/docs/PROOF_GENERATION_FINDINGS.md` (existing)
- `atomica-web/docs/PROOF_GENERATION_INVESTIGATION_PLAN.md` (existing)

## Future Work (TODOs)

- [ ] Implement event-based proof system as alternative
- [ ] Test with Erigon client
- [ ] Run full E2E cross-chain tests
- [ ] Update any frontend code that accesses LockBox
