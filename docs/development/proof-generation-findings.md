# Proof Generation Investigation - Final Findings

## Problem Statement

Cross-chain proof-generation tests timeout because `eth_getProof` returns 0 for storage values in the LockBox contract, even though the contract state is correct.

## Investigation Summary

### What Works ✅

1. **Ethereum testnet setup**: Geth v1.13.14 with archive mode (`--gcmode=archive`) ✅
2. **Contract deployment**: FakeETH, FakeUSD, and LockBox deploy successfully ✅
3. **Lock transactions**: Tokens are locked successfully, receipts show success ✅
4. **Direct contract reads**: `lockBox.lockedBalances(user, token)` returns correct value (50 ETH) ✅
5. **Storage key calculation**: Off-chain calculation matches on-chain `calculateStorageKey()` ✅
6. **Block production**: Blocks are produced consistently ✅
7. **eth_getProof RPC support**: Node responds to `eth_getProof` calls (doesn't error) ✅

### What Fails ❌

**`eth_getProof` ALWAYS returns 0 for `lockedBalances[user][token]` storage value**

Tested scenarios (ALL return 0):
- ❌ Ethers at lock block
- ❌ Ethers at "latest"
- ❌ Viem at lock block
- ❌ Viem at "latest"
- ❌ With 2-second delays and retries
- ❌ At lock block + 1, +2, +3, +4, +5

**But direct contract read returns 50 ETH!**

## Root Cause Analysis

### Storage Layout

**LockBox.sol** (line 33):
```solidity
mapping(address => mapping(address => uint256)) public lockedBalances;
```

This is stored at slot 0. The storage key is calculated as:
```solidity
innerKey = keccak256(abi.encode(token, uint256(0)))
storageKey = keccak256(abi.encode(user, innerKey))
```

**Verified**: Off-chain calculation matches on-chain `calculateStorageKey()` function.

### Comparison to Working Test

**state-proofs/typescript/test/integration.test.ts** (lines 399-434):
- Deploys a minimal contract that writes directly to slot 0
- Uses `fetchProof()` (viem) immediately after transaction
- **Works correctly** - storage value is returned

**Key difference**: Simple storage contract writes to slot 0 directly, not through nested mappings.

### Hypothesis

**Geth's `eth_getProof` may not correctly handle nested mapping storage proofs**, or there's a configuration issue preventing it from indexing nested mapping storage.

## Test Evidence

### Test 1: Direct Storage Access
```
Lock tx in block 6
Direct contract read: 50000000000000000000 (50 ETH) ✅
```

### Test 2: eth_getProof Attempts
```
Storage key: 0x462e60f384983ee5467c2e2b7d3c4c1c13f226341358485aec125dcfceba88c2

Ethers at block 6:     0 ❌
Ethers at "latest":     0 ❌
Viem at block 6:       0 ❌
Viem at "latest":       0 ❌
```

### Test 3: Historical Blocks
```
Block 6 (lock block):  0 ❌
Block 7 (lock + 1):     0 ❌
Block 8 (lock + 2):     0 ❌
...
Block 11 (latest):      0 ❌
```

## Attempted Fixes

1. ✗ Query at `lockBlock + 1` instead of `lockBlock`
2. ✗ Query at "latest" instead of specific block
3. ✗ Use pollUntil with retries and delays
4. ✗ Switch from ethers to viem
5. ✗ Wait for multiple confirmation blocks

**None worked** - all return 0.

## Geth Configuration

From `docker-compose.yaml` line 50:
```bash
--syncmode=full --gcmode=archive --txlookuplimit=0
```

- Archive mode is enabled ✅
- Transaction indexing is enabled ✅
- RPC API includes `eth`, `debug`, `engine`, `txpool` ✅

## Next Steps / Questions

### Option 1: Fix Storage Layout
Could simplify to single-level mapping or direct storage slot?
```solidity
// Instead of: mapping(address => mapping(address => uint256))
// Use: mapping(bytes32 => uint256) where key = keccak256(abi.encode(user, token))
```

### Option 2: Investigate Geth Bug
- Test with different Geth version?
- Test with Erigon instead of Geth?
- Check if Geth has known issues with nested mapping proofs?

### Option 3: Use Different Proof Strategy
- Generate proof for account balance instead of storage?
- Use events/logs instead of storage proofs?

### Option 4: Debug Geth Directly
- Enable Geth debug logging for `eth_getProof`
- Check if storage trie is being built correctly
- Verify the storage trie root hash

## Files Created During Investigation

- `/home/lucas/atomica/source/atomica-web/tests/meta/ethereum/proof-generation-isolated.test.ts` - Step-by-step isolation tests
- `/home/lucas/atomica/source/atomica-web/tests/meta/ethereum/proof-generation-debug.test.ts` - Block-by-block storage tracking
- `/home/lucas/atomica/source/atomica-web/tests/meta/ethereum/proof-generation-simple.test.ts` - Minimal reproduction with retries
- `/home/lucas/atomica/source/atomica-web/tests/meta/ethereum/eth-getproof-basic.test.ts` - Basic eth_getProof validation
- `/home/lucas/atomica/source/atomica-web/tests/meta/ethereum/proof-viem-test.test.ts` - Viem vs Ethers comparison
- `/home/lucas/atomica/source/atomica-web/docs/PROOF_GENERATION_INVESTIGATION_PLAN.md` - Original investigation plan
- `/home/lucas/atomica/source/atomica-web/docs/PROOF_GENERATION_FINDINGS.md` - This document

## Conclusion

The issue is NOT:
- ❌ A timeout/performance problem
- ❌ Block production delays
- ❌ State indexing lag
- ❌ Wrong block number queried
- ❌ Library choice (viem vs ethers)

The issue IS:
- ✅ **`eth_getProof` returns 0 for nested mapping storage, even though the value exists**

This appears to be either:
1. A Geth bug with nested mapping storage proofs, OR
2. A contract storage layout incompatibility with `eth_getProof`, OR
3. A configuration issue we haven't identified

**Recommendation**: Need guidance from someone familiar with Geth's `eth_getProof` implementation or consider alternative approaches to proof generation.
