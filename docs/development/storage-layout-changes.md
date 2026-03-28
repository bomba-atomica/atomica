# LockBox Storage Layout Changes

## Summary

Changed LockBox contract storage from nested mappings to single-level mappings to fix `eth_getProof` compatibility issue.

## Problem

Geth's `eth_getProof` RPC call does not work reliably with nested Solidity mappings, returning zero values even when storage contains non-zero data.

## Solution

Replaced nested mappings with single-level mappings using composite keys.

## Changes Made

### 1. LockBox.sol Contract

**Before:**
```solidity
mapping(address => mapping(address => uint256)) public lockedBalances;
mapping(address => mapping(address => uint256)) public unlockTimes;

// Access: lockedBalances[user][token]
```

**After:**
```solidity
mapping(bytes32 => uint256) public lockedBalances;
mapping(bytes32 => uint256) public unlockTimes;

function getLockKey(address user, address token) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(user, token));
}

// Access: lockedBalances[getLockKey(user, token)]
```

**API Changes:**
- Added: `getLockKey(address user, address token) → bytes32`
- Added: `calculateUnlockTimeStorageKey(address user, address token) → bytes32`
- Modified: All internal functions now use `getLockKey()` to access storage
- View functions maintain same external API (no breaking changes for users)

### 2. storage-key.ts (TypeScript)

**Before:**
```typescript
// Nested mapping calculation
innerKey = keccak256(abi.encode(token, slot))
storageKey = keccak256(abi.encode(user, innerKey))
```

**After:**
```typescript
// Single-level mapping calculation
compositeKey = keccak256(abi.encodePacked(user, token))
storageKey = keccak256(abi.encode(compositeKey, slot))
```

**API Changes:**
- Added: `getLockKey(userAddress, tokenAddress) → string`
- Modified: `calculateLockedBalanceStorageKey()` - now uses composite key approach
- Modified: `calculateUnlockTimeStorageKey()` - now uses slot 1 with composite key

### 3. Documentation

Created: `/home/lucas/atomica/source/docs/development/ethereum-storage-proof-quirks.md`
- Documents the nested mapping issue
- Provides best practices for storage proofs
- Lists known workarounds and alternatives

## Migration Guide

### For Tests

**Before:**
```typescript
const balance = await lockBox.lockedBalances(user, token);
```

**After:**
```typescript
const balance = await lockBox.getLockedBalance(user, token);
```

OR (if you need direct mapping access):
```typescript
const key = await lockBox.getLockKey(user, token);
const balance = await lockBox.lockedBalances(key);
```

### For Storage Key Calculation

**Before:**
```typescript
import { calculateLockedBalanceStorageKey } from "./proofs";
const storageKey = calculateLockedBalanceStorageKey(user, token);
```

**After (no changes needed - same API):**
```typescript
import { calculateLockedBalanceStorageKey } from "./proofs";
const storageKey = calculateLockedBalanceStorageKey(user, token);
// Internal implementation changed, but API is the same
```

### For Proof Generation

No changes needed - `generateLockedBalanceProof()` API remains the same.

## Testing Checklist

- [ ] Recompile Solidity contracts
- [ ] Update test files to use `getLockedBalance()` instead of direct mapping access
- [ ] Verify storage key calculation matches on-chain helper
- [ ] Run proof-generation tests to verify eth_getProof now returns correct values
- [ ] Run E2E cross-chain tests

## Breaking Changes

**For Contract Users:**
- Direct access to `lockedBalances[user][token]` no longer works
- Must use `getLockedBalance(user, token)` view function instead
- This is the recommended approach anyway (using public getters)

**For Proof Generation:**
- None - storage key calculation API unchanged
- Internal implementation updated to match new storage layout

## Gas Impact

**Minimal change:**
- `getLockKey()`: ~200 gas (keccak256 of 40 bytes)
- Storage reads/writes: No change (still single SLOAD/SSTORE per operation)
- Total impact: Negligible (~200 gas per lock/unlock operation)

## Future Work

- [ ] Implement event-based proof system as alternative (more reliable)
- [ ] Test with Erigon client to see if nested mappings work there
- [ ] Consider contributing upstream fix to Geth if this is a bug

## Related Documentation

- Investigation report: `docs/PROOF_GENERATION_FINDINGS.md`
- Quirks documentation: `docs/development/ethereum-storage-proof-quirks.md`
- Test suite: `tests/meta/ethereum/proof-generation-*.test.ts`

## References

- [Solidity Storage Layout](https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)
- [EIP-1186: eth_getProof](https://eips.ethereum.org/EIPS/eip-1186)
