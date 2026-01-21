# API Reference

Complete API documentation for `@atomica/state-proof-verifier`.

## Table of Contents

- [Proof Fetching](#proof-fetching)
- [Proof Verification](#proof-verification)
- [Types](#types)
- [Utilities](#utilities)

## Proof Fetching

### `fetchProof()`

Fetch account and storage proofs from an Ethereum RPC endpoint.

```typescript
async function fetchProof(
    rpcUrl: string,
    address: string,
    storageKeys: string[],
    block: number | string
): Promise<EthereumProof>
```

**Parameters:**
- `rpcUrl` - Ethereum RPC endpoint URL (e.g., `https://mainnet.infura.io/v3/KEY`)
- `address` - Ethereum address to fetch proof for (0x-prefixed hex string)
- `storageKeys` - Array of storage slot keys to include in proof (0x-prefixed hex strings)
- `block` - Block number (number) or tag (`'latest'`, `'finalized'`, `'safe'`)

**Returns:**
- `Promise<EthereumProof>` - Proof data including accountProof, storageProof, and state root

**Example:**
```typescript
const proof = await fetchProof(
    'https://mainnet.infura.io/v3/YOUR_KEY',
    '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    ['0x0', '0x1'], // storage slots 0 and 1
    12345678
);

console.log(proof.accountProof); // Array of RLP-encoded trie nodes
console.log(proof.stateRoot);    // Block's state root
```

**Throws:**
- `Error` - If RPC request fails or returns invalid data

---

### `fetchBlock()`

Fetch block header data including state root.

```typescript
async function fetchBlock(
    rpcUrl: string,
    block: number | string
): Promise<Block>
```

**Parameters:**
- `rpcUrl` - Ethereum RPC endpoint URL
- `block` - Block number or tag

**Returns:**
- `Promise<Block>` - Block data including stateRoot, hash, number, etc.

**Example:**
```typescript
const block = await fetchBlock('https://mainnet.infura.io/v3/KEY', 'latest');
console.log(block.stateRoot); // 0xabc123...
console.log(block.number);    // 18500000
```

## Proof Verification

### `verifyAccountProof()`

Cryptographically verify an account proof against a state root using MPT verification.

```typescript
async function verifyAccountProof(
    accountProof: string[],
    stateRoot: string,
    address: string
): Promise<VerificationResult>
```

**Parameters:**
- `accountProof` - Array of RLP-encoded trie nodes (from `eth_getProof`)
- `stateRoot` - State root hash from block header (0x-prefixed hex)
- `address` - Account address being proven (0x-prefixed hex)

**Returns:**
- `Promise<VerificationResult>` - Verification result with status and decoded account state

**Example:**
```typescript
const result = await verifyAccountProof(
    proof.accountProof,
    blockHeader.stateRoot,
    '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
);

if (result.valid) {
    console.log('✓ Proof verified!');
    console.log('Nonce:', result.accountState.nonce);
    console.log('Balance:', result.accountState.balance);
    console.log('Storage Hash:', result.accountState.storageHash);
    console.log('Code Hash:', result.accountState.codeHash);
} else {
    console.error('✗ Verification failed:', result.error);
}
```

**Verification Process:**
1. Keccak-256 hash the address to get the trie key
2. RLP decode each proof node
3. Traverse trie path, verifying hashes at each level
4. Verify final hash equals state root
5. Decode leaf node to extract account state

---

### `verifyStorageProof()`

Verify a storage proof against a storage root.

```typescript
async function verifyStorageProof(
    storageProof: string[],
    storageRoot: string,
    key: string
): Promise<VerificationResult>
```

**Parameters:**
- `storageProof` - Array of RLP-encoded trie nodes
- `storageRoot` - Storage root hash from account state
- `key` - Storage slot key (0x-prefixed hex)

**Returns:**
- `Promise<VerificationResult>` - Verification result with storage value

**Example:**
```typescript
const result = await verifyStorageProof(
    proof.storageProof[0].proof,
    accountState.storageHash,
    '0x0'
);

if (result.valid) {
    console.log('Storage value:', result.value);
}
```

---

### `decodeAccountState()`

Decode account state from RLP-encoded account leaf node.

```typescript
function decodeAccountState(leafNode: Buffer): AccountState
```

**Parameters:**
- `leafNode` - RLP-encoded account leaf node

**Returns:**
- `AccountState` - Decoded account state

**Example:**
```typescript
const accountState = decodeAccountState(leafNodeBuffer);
console.log(accountState);
// {
//   nonce: 5,
//   balance: 1500000000000000000n,
//   storageHash: '0x...',
//   codeHash: '0x...'
// }
```

## Types

### `EthereumProof`

Proof data returned by `eth_getProof` RPC call.

```typescript
interface EthereumProof {
    address: string;           // Account address
    accountProof: string[];    // Array of RLP-encoded trie nodes
    balance: string;           // Account balance (hex string)
    codeHash: string;          // Code hash (0x... or empty account)
    nonce: string;             // Account nonce (hex string)
    storageHash: string;       // Storage trie root hash
    storageProof: StorageProof[]; // Storage proofs for requested keys
    stateRoot?: string;        // Block state root (added by fetcher)
}
```

---

### `StorageProof`

Storage proof for a specific storage slot.

```typescript
interface StorageProof {
    key: string;      // Storage slot key
    value: string;    // Storage value (hex string)
    proof: string[];  // Array of RLP-encoded trie nodes
}
```

---

### `AccountState`

Decoded account state from MPT leaf node.

```typescript
interface AccountState {
    nonce: number;           // Account nonce
    balance: bigint;         // Account balance in wei
    storageHash: string;     // Storage trie root (0x-prefixed hex)
    codeHash: string;        // Contract code hash (0x-prefixed hex)
}
```

**Empty Account:**
- Balance: `0n`
- Nonce: `0`
- StorageHash: `0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421` (empty trie)
- CodeHash: `0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470` (empty code)

---

### `VerificationResult`

Result of proof verification.

```typescript
interface VerificationResult {
    valid: boolean;                    // Whether proof is valid
    accountState?: AccountState;       // Decoded account state (if valid)
    value?: string;                    // Storage value (for storage proofs)
    error?: string;                    // Error message (if invalid)
    proofNodes?: number;               // Number of proof nodes verified
}
```

---

### `Block`

Block header data.

```typescript
interface Block {
    number: string;           // Block number (hex)
    hash: string;            // Block hash
    stateRoot: string;       // State trie root
    parentHash: string;      // Parent block hash
    timestamp: string;       // Block timestamp (hex)
    // ... other block fields
}
```

## Utilities

### `verifyMerkleProof()`

Low-level MPT proof verification (used internally by `verifyAccountProof` and `verifyStorageProof`).

```typescript
function verifyMerkleProof(
    proof: Buffer[],
    root: Buffer,
    key: Buffer,
    value: Buffer | null
): boolean
```

**Parameters:**
- `proof` - Array of RLP-encoded trie nodes (as Buffers)
- `root` - Expected root hash
- `key` - Trie key (Keccak-256 hash)
- `value` - Expected value at leaf (null for non-existence proof)

**Returns:**
- `boolean` - True if proof is valid

**Note:** This is a low-level function. Most users should use `verifyAccountProof()` or `verifyStorageProof()` instead.

---

### `hashNode()`

Hash a trie node (used internally).

```typescript
function hashNode(node: Buffer): Buffer
```

**Parameters:**
- `node` - RLP-encoded trie node

**Returns:**
- `Buffer` - Keccak-256 hash of node

---

### `decodeNode()`

Decode an RLP-encoded trie node (used internally).

```typescript
function decodeNode(rlpNode: Buffer): TrieNode
```

**Parameters:**
- `rlpNode` - RLP-encoded node

**Returns:**
- `TrieNode` - Decoded node (branch, extension, or leaf)

## Error Handling

All async functions may throw errors. Common error scenarios:

### RPC Errors

```typescript
try {
    const proof = await fetchProof(rpcUrl, address, [], block);
} catch (error) {
    if (error.message.includes('connection')) {
        console.error('RPC connection failed');
    } else if (error.message.includes('invalid block')) {
        console.error('Block not found');
    }
}
```

### Verification Errors

```typescript
const result = await verifyAccountProof(proof, stateRoot, address);

if (!result.valid) {
    console.error('Verification failed:', result.error);
    // Possible errors:
    // - "Proof chain broken at node X"
    // - "State root mismatch"
    // - "Invalid proof node encoding"
    // - "Key path mismatch"
}
```

## Advanced Usage

### Batch Verification

Verify multiple accounts efficiently:

```typescript
async function verifyMultipleAccounts(
    rpcUrl: string,
    addresses: string[],
    block: number
): Promise<Map<string, VerificationResult>> {
    const results = new Map();

    // Fetch all proofs in parallel
    const proofs = await Promise.all(
        addresses.map(addr => fetchProof(rpcUrl, addr, [], block))
    );

    // Get block header once
    const blockHeader = await fetchBlock(rpcUrl, block);

    // Verify all proofs
    for (let i = 0; i < addresses.length; i++) {
        const result = await verifyAccountProof(
            proofs[i].accountProof,
            blockHeader.stateRoot,
            addresses[i]
        );
        results.set(addresses[i], result);
    }

    return results;
}
```

### Custom RPC Client

Use custom RPC configuration:

```typescript
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

const client = createPublicClient({
    chain: mainnet,
    transport: http('https://mainnet.infura.io/v3/KEY', {
        timeout: 30000,
        retryCount: 3
    })
});

// Use client directly
const proof = await client.getProof({
    address: '0x...',
    storageKeys: [],
    blockNumber: 12345678n
});
```

## Performance Considerations

### Proof Size

- Account proofs typically contain 4-8 trie nodes
- Each node is 32-512 bytes
- Total proof size: ~1-4 KB per account

### Verification Time

- Account proof verification: ~1-5ms
- Storage proof verification: ~1-5ms per slot
- Network latency (RPC fetch): ~100-500ms

### Optimization Tips

1. **Cache block headers** - Reuse state roots for multiple verifications
2. **Batch requests** - Use `Promise.all()` for parallel fetching
3. **Use finalized blocks** - More stable, less likely to reorg
4. **Local node** - Faster RPC access than remote providers

## See Also

- [README.md](../README.md) - Overview and quick start
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Internal architecture details
- [EIP-1186 Specification](https://eips.ethereum.org/EIPS/eip-1186)
