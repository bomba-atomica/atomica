# State Proof Verifier

Cryptographic utilities for cross-chain state verification and identity-based encryption.

## Purpose

This package provides the cryptographic primitives needed for:
1. **Cross-chain state verification**: Verify Ethereum state proofs on other chains
2. **Identity-Based Encryption (IBE)**: Sealed-bid auctions with encrypted bids
3. **Receipt verification**: Validate Ethereum transaction receipts

## What's Inside

### IBE (Identity-Based Encryption)
- **BLS12-381 Pairing**: Pairing-based cryptography for IBE
- **System Parameter Generation**: Create master public/private key pairs
- **Encryption**: Encrypt messages to an identity (public key = identity hash)
- **Decryption**: Decrypt with private key derived from identity

### State Proof Verification
- **MPT (Merkle Patricia Trie)**: Ethereum state trie verification
- **Receipt Verification**: Validate transaction receipts against state root
- **Account State**: Verify account balance, nonce, storage

### Beacon Chain
- **Consensus verification**: Verify beacon chain blocks
- **Validator data**: Process validator state

## Architecture

### IBE Implementation
Uses BLS12-381 curve for pairing-based encryption:
1. **Setup**: Generate master public key (MPK) and master secret key (MSK)
2. **Extract**: Derive private key for an identity from MSK
3. **Encrypt**: Encrypt message using MPK and identity
4. **Decrypt**: Decrypt using identity's private key

```
Identity → Hash → Point on curve → Pair with MPK → Encryption key
```

### State Proof Flow
1. Fetch Ethereum state root from beacon chain
2. Generate Merkle proof for specific account/storage
3. Verify proof against state root
4. Extract verified data

## Key Functions

### IBE
```typescript
import * as ibe from "@atomica/state-proof-verifier/ibe";

// Setup
const { mpk, msk } = await ibe.generateSystemParameters();

// Encrypt to identity
const identity = new TextEncoder().encode("user@example.com");
const message = new TextEncoder().encode("secret bid: 100");
const { u, v } = await ibe.encrypt(mpk, identity, message);

// Decrypt (requires MSK to derive private key)
const privateKey = await ibe.extract(msk, identity);
const decrypted = await ibe.decrypt(privateKey, u, v);
```

### State Verification
```typescript
import { verifyAccountProof } from "@atomica/state-proof-verifier";

const proof = {
  stateRoot: "0x...",
  accountProof: [...],
  address: "0x..."
};

const verified = verifyAccountProof(proof);
console.log("Balance:", verified.balance);
```

## Testing

IBE tests verify:
- System parameter generation (MPK/MSK creation)
- Encryption produces valid ciphertext
- Different messages produce different ciphertexts
- Pairing math correctness

Run tests:
```bash
bun test
```

## Use Cases

### Sealed-Bid Auctions
1. Auctioneer generates MPK
2. Bidders encrypt bids using MPK and auction ID as identity
3. Only auctioneer (with MSK) can decrypt after bidding closes
4. No one can see bids before reveal

### Cross-Chain Verification
1. App needs Ethereum account balance on Aptos
2. Fetches Merkle proof from Ethereum
3. Submits proof to Aptos contract
4. Contract verifies proof against known state root
5. Balance is proven without trusted oracle

## Dependencies

- `@noble/bls12-381`: BLS12-381 curve implementation
- `@noble/hashes`: Cryptographic hash functions
- `@ethereumjs/trie`: Ethereum trie data structures
- `@ethereumjs/util`: Ethereum utilities

## Security Considerations

### IBE
- **MSK must be kept secret**: Anyone with MSK can decrypt all messages
- **Identity collisions**: Use domain separation (e.g., "auction:123")
- **Randomness**: Uses cryptographically secure random for key generation

### State Proofs
- **State root must be trusted**: Verify source of state root (e.g., light client)
- **Proof completeness**: Ensure all required nodes are in proof
- **Block finality**: Only verify against finalized blocks

## Related Packages

- `@atomica/sdk`: Uses IBE for auction bid encryption
- `@atomica/atomica-web-ui`: UI components for encrypted bids
- `@atomica/atomica-web-demo`: Demo of sealed-bid auctions
