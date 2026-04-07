# state-proofs

Status: `live`

## Purpose

TypeScript library for fetching and cryptographically verifying Ethereum state proofs (EIP-1186 / `eth_getProof`). Used by the cross-chain flow to prove that a user has locked ERC-20 tokens in the `LockBox` contract on Ethereum before being allowed to participate in an Aptos auction. Also includes IBE (Identity-Based Encryption) primitives used by the client for sealed-bid encryption.

## Public API surface

Package name: `@atomica/state-proof-verifier`

Entry point: `typescript/dist/index.d.ts`

### Proof fetching

| Export | Description |
|---|---|
| `fetchProof` | Fetch an EIP-1186 account + storage proof from an Ethereum RPC node |
| `fetchBlock` | Fetch an Ethereum block by number or hash |
| `fetchBlockTransactions` | Fetch all transactions in a block |
| `fetchBlockReceipts` | Fetch all receipts in a block |
| `fetchTransaction` | Fetch a single transaction |
| `fetchTransactionReceipt` | Fetch a transaction receipt |
| `fetchFullTransactionReceipt` | Fetch receipt with decoded logs |

### Proof verification

| Export | Description |
|---|---|
| `verifyAccountProof` | Verify an MPT account proof against a state root |
| `verifyStorageProof` | Verify an MPT storage proof against a storage root |
| `decodeAccountState` | Decode RLP-encoded Ethereum account state |
| `verifyTransactionProof` | Verify an MPT transaction proof |
| `verifyReceiptProof` | Verify an MPT receipt proof |

### MPT primitives

| Export | Description |
|---|---|
| `verifyMerkleProof`, `hashNode`, `decodeNode`, `keyToNibbles`, `decodeHexPrefix`, `matchPath` | Low-level Merkle-Patricia Trie operations |

### IBE (Identity-Based Encryption)

Re-exported from `./ibe` — Boneh-Franklin IBE for sealed-bid encryption.

### Beacon chain

Re-exported from `./beacon` — Ethereum beacon chain state helpers.

### Types

`EthereumProof`, `StorageProof`, `AccountState`, `VerificationResult`, `Block`, `TrieNode`, `BranchNode`, `ExtensionNode`, `LeafNode`

### Constants

`EMPTY_ACCOUNT`, `HP_FLAGS`

## Dependents

- `source/atomica-sdk` — imports IBE primitives via `@atomica/state-proof-verifier/ibe`
- `source/atomica-crosschain-testing` — uses proof fetching and verification in Rust integration tests (via the TypeScript SDK bridge)
- `source/atomica-demo` — imports IBE for client-side bid encryption

## See also

- `docs/architecture/v0-architecture.md` §3 — cross-chain settlement flow using state proofs
- `source/atomica-move-contracts/sources/eth_proof.move` — on-chain MPT verifier that mirrors this library
