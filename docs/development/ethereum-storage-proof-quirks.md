# Ethereum Storage Proof Quirks and Known Issues

## Overview

This document describes known issues and quirks when working with Ethereum storage proofs (`eth_getProof`) for cross-chain state verification.

## Nested Mapping Storage Proofs

### Issue

**Geth's `eth_getProof` RPC call returns zero values for nested mapping storage slots**, even when:
- The storage actually contains non-zero values (verified via direct contract reads)
- The node is running in archive mode (`--gcmode=archive`)
- The storage key calculation is correct
- Both viem and ethers.js are used

### Affected Configuration

- **Ethereum Client**: Geth v1.13.14
- **Mode**: Full sync with archive mode
- **RPC Method**: `eth_getProof`
- **Storage Type**: Nested mappings (e.g., `mapping(address => mapping(address => uint256))`)

### Evidence

Extensive testing showed that for a contract with:
```solidity
mapping(address => mapping(address => uint256)) public lockedBalances;
```

**Direct contract reads work**:
```typescript
const balance = await contract.lockedBalances(user, token);
// Returns: 50000000000000000000 (50 ETH) ✅
```

**eth_getProof returns zero**:
```typescript
const storageKey = keccak256(abi.encode(user, keccak256(abi.encode(token, 0))));
const proof = await provider.send("eth_getProof", [contractAddress, [storageKey], blockNumber]);
// proof.storageProof[0].value returns: "0x0" ❌
```

This was tested across:
- Multiple block numbers (lock block, lock+1, lock+5, "latest")
- Multiple libraries (ethers.js, viem)
- With retries and delays
- All scenarios returned 0

### Root Cause

Unknown whether this is:
1. A Geth bug with nested mapping proof generation
2. A known limitation of `eth_getProof` for complex storage layouts
3. A configuration issue with our Geth setup

### Workaround

**Use single-level mappings with composite keys instead of nested mappings.**

❌ **Don't use** (nested mapping):
```solidity
mapping(address => mapping(address => uint256)) public lockedBalances;
```

✅ **Use instead** (single-level mapping):
```solidity
mapping(bytes32 => uint256) public lockedBalances;

function getLockKey(address user, address token) public pure returns (bytes32) {
    return keccak256(abi.encodePacked(user, token));
}
```

Storage key calculation for single-level mapping:
```solidity
// For mapping at slot N with key K:
storageKey = keccak256(abi.encode(K, uint256(N)))
```

### Alternative: Event-Based Proofs

For future implementation, consider using **event/log proofs** instead of storage proofs:

```solidity
event TokensLocked(
    address indexed user,
    address indexed token,
    uint256 amount,
    uint256 blockNumber
);

function lock(address token, uint256 amount) external {
    // ... lock logic ...
    emit TokensLocked(msg.sender, token, amount, block.number);
}
```

Benefits:
- Transaction receipt proofs are more reliable
- Events are indexed and easier to query
- No storage layout concerns
- Historical events are preserved

Implementation reference: EIP-1186 transaction receipt proofs.

## Best Practices for Storage Proofs

### 1. Use Simple Storage Layouts

For storage values that need to be proven cross-chain:
- ✅ Direct storage slots (`uint256 public value`)
- ✅ Single-level mappings with composite keys
- ❌ Nested mappings
- ❌ Complex structs in mappings

### 2. Verify Storage Key Calculation

Always provide an on-chain function to verify storage key calculation:

```solidity
function calculateStorageKey(address user, address token) external pure returns (bytes32) {
    bytes32 key = keccak256(abi.encodePacked(user, token));
    return keccak256(abi.encode(key, uint256(0))); // slot 0
}
```

This allows off-chain code to verify correctness:
```typescript
const offChainKey = calculateStorageKey(user, token);
const onChainKey = await contract.calculateStorageKey(user, token);
assert(offChainKey === onChainKey);
```

### 3. Test with eth_getProof Early

Don't assume `eth_getProof` will work for your storage layout. Test it early:

```typescript
// Deploy contract
// Write to storage
// Verify with direct read
const directValue = await contract.getValue();

// Verify with eth_getProof
const proof = await provider.send("eth_getProof", [address, [storageKey], blockNumber]);
const proofValue = BigInt(proof.storageProof[0].value);

assert(directValue === proofValue, "eth_getProof doesn't work for this storage layout!");
```

### 4. Use Archive Nodes

Storage proofs for historical blocks require archive nodes:
```bash
geth --syncmode=full --gcmode=archive
```

Without archive mode, `eth_getProof` only works for recent blocks.

## Testing Storage Proofs

### Local Testing

Use the Ethereum Docker testnet for local testing:
```typescript
import { EthereumDockerTestnet } from "@atomica/ethereum-docker-testnet";

const testnet = await EthereumDockerTestnet.start(4);
// Testnet runs Geth in archive mode by default
```

### Integration Tests

See working examples:
- `source/state-proofs/typescript/test/integration.test.ts` - Simple storage contract that works
- `source/atomica-web/tests/meta/ethereum/proof-generation.test.ts` - LockBox proof tests

### Known Working Pattern

This storage pattern is proven to work with `eth_getProof`:

```solidity
contract SimpleStorage {
    uint256 public value; // Direct storage at slot 0

    function setValue(uint256 _value) external {
        value = _value;
    }
}
```

```typescript
const storageKey = ethers.zeroPadValue("0x0", 32); // slot 0
const proof = await provider.send("eth_getProof", [address, [storageKey], blockNumber]);
// Works correctly ✅
```

## Related Issues

- **Investigation Report**: `source/atomica-web/docs/PROOF_GENERATION_FINDINGS.md`
- **Test Suite**: `source/atomica-web/tests/meta/ethereum/proof-generation-*.test.ts`

## References

- [EIP-1186: eth_getProof](https://eips.ethereum.org/EIPS/eip-1186)
- [Ethereum Storage Layout](https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)
- [Geth RPC Documentation](https://geth.ethereum.org/docs/interacting-with-geth/rpc)

## Future Work

- [ ] Implement event-based proof system as alternative to storage proofs
- [ ] Test with Erigon client to see if nested mappings work
- [ ] Investigate Geth source code to understand why nested mappings fail
- [ ] Consider contributing fix to Geth if this is a bug
