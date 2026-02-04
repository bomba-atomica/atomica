# Ethereum State Proof Quirks

## Geth eth_getProof `value` Field Bug

### Issue Description

When calling Geth's `eth_getProof` RPC method, the returned `value` field in the storage proof may be `0x0` even when the actual storage value is non-zero. This occurs despite the correct value being embedded in the RLP-encoded proof nodes.

### Observed Behavior

**Transaction:**
- Locked 10 FAKETH in LockBox contract at block 15
- Storage key: `0xdc645937229477e3cc27d4db2b45c4c99a2c0103a072bedf41f20db02442f893`

**eth_getProof Response:**
```json
{
  "storageProof": [{
    "key": "0xdc645937...",
    "value": "0x0",           // <-- INCORRECT - should be 10 FAKETH
    "proof": [
      "0xf8518080a0884ad486347eca64356434a306a5543269797899d5e076acf8a79dace46209688080808080808080808080a076e1a31897219b17b69f8e780ecacc4dd0fe30078c44f9bedb95cd370ca749358080",
      "0xeba03a64bd8733a29a73daa36cf098a19d7de59f7d8b7ac75540619b6d2570f19b7e89888ac7230489e80000"
    ]
  }]
}
```

**Actual Storage Value:**
The correct value `0x8ac7230489e80000` (10 FAKETH = 10 × 10¹⁸ wei) is encoded in the second proof node.

### Root Cause Analysis

The second proof node is an RLP-encoded leaf node containing `[storage_key, storage_value]`:

```
0xeba03a64bd8733a29a73daa36cf098a19d7de59f7d8b7ac75540619b6d2570f19b7e89888ac7230489e80000
```

Decoded:
- `0xeb` = RLP list with 44 bytes of payload
- First item (32 bytes): storage key
- Second item: RLP-encoded value `0x88 0x8ac7230489e80000`
  - `0x88` = short string with 8 bytes of data
  - `0x8ac7230489e80000` = 10 FAKETH in wei

### Workaround

Decode the storage value directly from the RLP proof nodes instead of relying on the `value` field:

```typescript
function decodeValueFromStorageProof(proofNodes: string[]): bigint {
  for (const node of proofNodes) {
    const data = Buffer.from(node.slice(2), 'hex');
    // Parse RLP list and extract second item (storage value)
    // ...
  }
  return 0n;
}
```

### Environment

- **Geth Version:** Ethereum Docker testnet (Geth + Lighthouse)
- **Network:** Private PoS testnet with 4 validators
- **Chain ID:** 32382
- **Block Number:** 16

### Related Files

- `source/atomica-web/src/lib/ethereum/proofs/generator.ts` - TypeScript proof generator with RLP decoder
- `lib/ethereum-fixtures/golden_vectors.json` - Golden test vectors with real proofs
- `source/atomica-move-contracts/sources/eth_proof.move` - Move MPT verification

### Potential Explanations

1. **Geth Bug:** Geth may have a bug in `eth_getProof` where it incorrectly computes the value field for certain storage layouts
2. **Storage Slot Initialization:** Uninitialized vs. zero-value storage slots might be handled differently
3. **Mapping Layout:** The nested mapping storage layout (`lockedBalances[user][token]`) may trigger edge cases
4. **Timing Issue:** Value read before state transition is finalized in the block being queried

### Further Investigation

- Test with different Geth versions
- Test with simpler storage layouts (single value vs. mapping)
- Check Geth source code for `eth_getProof` implementation
- Test with Erigon/Besu to compare behavior
