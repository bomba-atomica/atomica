# Lock Receipt Architecture

## Overview

The `lock_receipt` module provides a generic, extensible framework for verifying and registering cross-chain asset locks on Aptos. It uses Move's type system to create type-safe, reusable receipts for any asset locked on any supported chain.

## Design Goals

1. **Generic Over Chains**: Support Ethereum, Bitcoin, Cosmos, etc. without code duplication
2. **Generic Over Assets**: Support any token type (ERC20, native ETH, NFTs) with a single module
3. **Cryptographic Verification**: Verify proofs cryptographically, don't trust attestations
4. **Replay Protection**: Prevent the same lock from being claimed multiple times
5. **Asset Isolation**: Different assets maintain separate state
6. **Type Safety**: Leverage Move's type system to prevent misuse

## Core Concepts

### Lock Receipt

A `LockReceipt` is a Move resource that represents a verified cross-chain lock. It serves as proof that assets were locked on a remote chain and can be used to mint corresponding tokens on Aptos.

```move
struct LockReceipt<phantom Chain, phantom Asset> has key {
    /// Unique identifier for this lock (prevents replay)
    lock_id: vector<u8>,

    /// User who locked the assets on the remote chain
    user: address,

    /// Amount of assets locked (in the asset's base units)
    amount: u256,

    /// Block number where the lock occurred
    block_number: u64,

    /// Timestamp when the receipt was created
    timestamp: u64,

    /// Status of the receipt
    status: u8, // 0 = Active, 1 = Claimed, 2 = Revoked
}
```

### Phantom Types for Chain and Asset

We use **phantom type parameters** to encode chain and asset information at the type level:

```move
// Ethereum chain marker
struct Ethereum has copy, drop, store {}

// Asset markers
struct FakeETH has copy, drop, store {
    // No fields needed - this is just a type tag
}

struct FakeUSD has copy, drop, store {}

// Example: A receipt for FakeETH locked on Ethereum
LockReceipt<Ethereum, FakeETH>
```

**Benefits:**
- Type safety: Can't mix receipts for different chains or assets
- No runtime overhead: Phantom types are erased at compilation
- Extensibility: Add new chains/assets by defining new marker types

## Architecture Components

### 1. Receipt Registry

A global registry stores all lock receipts and prevents replay attacks:

```move
struct ReceiptRegistry<phantom Chain, phantom Asset> has key {
    /// Map from lock_id -> receipt
    receipts: Table<vector<u8>, LockReceipt<Chain, Asset>>,

    /// Set of claimed lock IDs (for efficient replay checking)
    claimed_locks: SimpleMap<vector<u8>, bool>,

    /// Total value locked (for metrics)
    total_locked: u256,
}
```

### 2. Proof Verification

The module delegates cryptographic verification to chain-specific modules:

```move
/// Verify an Ethereum lock proof
public fun verify_ethereum_lock<Asset>(
    proof: &EthereumStateProof,
    expected_user: address,
    expected_amount: u256,
): vector<u8> {
    // 1. Verify MPT proof cryptographically
    let verified_amount = eth_proof::verify_and_extract(proof);

    // 2. Check amount matches expected
    assert!(verified_amount == expected_amount, E_AMOUNT_MISMATCH);

    // 3. Generate unique lock ID from proof
    let lock_id = generate_lock_id(proof);

    lock_id
}
```

### 3. Entry Functions

Public entry functions for users to register locks:

```move
/// Register a lock from Ethereum
public entry fun register_ethereum_lock<Asset>(
    account: &signer,
    // Ethereum proof parameters
    block_number: u64,
    block_hash: vector<u8>,
    state_root: vector<u8>,
    // ... more proof fields
    amount: u256,
) acquires ReceiptRegistry {
    // 1. Create and verify proof
    let proof = eth_proof::create_proof(...);
    let lock_id = verify_ethereum_lock<Asset>(&proof, ...);

    // 2. Check for replay
    assert!(!is_lock_claimed<Ethereum, Asset>(lock_id), E_ALREADY_CLAIMED);

    // 3. Create receipt
    let receipt = create_receipt<Ethereum, Asset>(
        lock_id,
        signer::address_of(account),
        amount,
        block_number,
    );

    // 4. Store in registry
    store_receipt<Ethereum, Asset>(receipt);

    // 5. Emit event
    event::emit(LockRegistered<Ethereum, Asset> { ... });
}
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User locks FakeETH on Ethereum                               │
│    LockBox.lock(FakeETH, 10 ETH)                               │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. User generates Ethereum state proof (off-chain)              │
│    generateLockedBalanceProof(user, FakeETH, block)            │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. User submits proof to Aptos                                  │
│    register_ethereum_lock<FakeETH>(proof_params, 10_ETH)       │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 4. lock_receipt module verifies proof                           │
│    - Calls eth_proof::verify_and_extract()                     │
│    - Checks MPT proofs cryptographically                        │
│    - Validates amount matches                                   │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 5. Creates LockReceipt<Ethereum, FakeETH>                      │
│    - Stores in ReceiptRegistry                                  │
│    - Marks lock_id as claimed (replay protection)              │
│    - Emits LockRegistered event                                 │
└─────────────────┬───────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────┐
│ 6. User can now use receipt to mint FakeETH on Aptos           │
│    fake_eth::mint_from_receipt<Ethereum>(receipt)              │
└─────────────────────────────────────────────────────────────────┘
```

## Type Safety Examples

### Valid Operations

```move
// Register Ethereum FakeETH lock
register_ethereum_lock<FakeETH>(account, eth_proof, 10_ETH);

// Register Ethereum FakeUSD lock
register_ethereum_lock<FakeUSD>(account, eth_proof, 100_USD);

// Mint FakeETH from Ethereum receipt
fake_eth::mint_from_receipt<Ethereum>(receipt);
```

### Invalid Operations (Compile-time Errors)

```move
// ERROR: Can't use Ethereum receipt with Bitcoin chain type
fake_eth::mint_from_receipt<Bitcoin>(ethereum_receipt);

// ERROR: Can't mint FakeUSD from FakeETH receipt
fake_usd::mint_from_receipt<Ethereum>(fake_eth_receipt);

// ERROR: Type mismatch - receipt is for FakeETH, not FakeUSD
let receipt: LockReceipt<Ethereum, FakeETH> = ...;
fake_usd::do_something(receipt); // Won't compile!
```

## Security Properties

### 1. Cryptographic Verification

All locks are verified using cryptographic proofs (MPT for Ethereum). The system never trusts user-provided amounts without verifying them against the source chain's state.

### 2. Replay Protection

Each lock generates a unique `lock_id` based on:
- Block hash
- Transaction index
- Log index
- User address
- Token address

The `claimed_locks` map ensures each lock can only be registered once.

### 3. Type Isolation

Different asset types maintain completely separate state due to Move's type system:

```move
// These are different resources with separate storage
ReceiptRegistry<Ethereum, FakeETH>
ReceiptRegistry<Ethereum, FakeUSD>
```

This prevents:
- Mixing receipts for different assets
- Accidentally minting the wrong token type
- Cross-contamination of balances

## Integration with Existing Modules

### fake_eth.move Integration

```move
module atomica::fake_eth {
    use atomica::lock_receipt::{Self, LockReceipt};

    /// Mint FakeETH from a verified lock receipt
    public entry fun mint_from_ethereum_lock(
        account: &signer,
        receipt_owner: address,
    ) acquires FakeEthStore {
        // 1. Get receipt from lock_receipt module
        let amount = lock_receipt::claim<Ethereum, FakeETH>(
            receipt_owner
        );

        // 2. Mint tokens
        mint_internal(signer::address_of(account), amount);
    }
}
```

### eth_proof.move Integration

The `lock_receipt` module uses `eth_proof::verify_and_extract()` for cryptographic verification:

```move
use atomica::eth_proof::{Self, StateProof};

public fun verify_ethereum_lock<Asset>(
    proof: &StateProof,
    expected_amount: u256,
): vector<u8> {
    // Delegate to eth_proof for MPT verification
    let verified_amount = eth_proof::verify_and_extract(proof);

    assert!(verified_amount == expected_amount, E_AMOUNT_MISMATCH);

    // Generate unique lock ID
    generate_lock_id(proof)
}
```

## Extending to New Chains

Adding support for a new chain (e.g., Bitcoin) requires:

1. **Define chain marker type:**
   ```move
   struct Bitcoin has copy, drop, store {}
   ```

2. **Implement verification function:**
   ```move
   public fun verify_bitcoin_lock<Asset>(
       proof: &BitcoinProof,
       expected_amount: u256,
   ): vector<u8> {
       // Bitcoin-specific verification logic
   }
   ```

3. **Add entry function:**
   ```move
   public entry fun register_bitcoin_lock<Asset>(
       account: &signer,
       // Bitcoin proof parameters
       ...
   ) acquires ReceiptRegistry {
       // Similar to register_ethereum_lock
   }
   ```

No changes to existing code required!

## Extending to New Assets

Adding support for a new asset (e.g., USDC) requires:

1. **Define asset marker type:**
   ```move
   struct USDC has copy, drop, store {}
   ```

2. **Use existing functions with new type:**
   ```move
   register_ethereum_lock<USDC>(account, proof, 1000_USDC);
   ```

3. **Integrate with asset module:**
   ```move
   module atomica::usdc {
       public entry fun mint_from_ethereum_lock(
           account: &signer,
           receipt_owner: address,
       ) {
           let amount = lock_receipt::claim<Ethereum, USDC>(receipt_owner);
           mint_internal(signer::address_of(account), amount);
       }
   }
   ```

## Events

```move
struct LockRegistered<phantom Chain, phantom Asset> has drop, store {
    lock_id: vector<u8>,
    user: address,
    amount: u256,
    block_number: u64,
    timestamp: u64,
}

struct LockClaimed<phantom Chain, phantom Asset> has drop, store {
    lock_id: vector<u8>,
    claimer: address,
    amount: u256,
}
```

## View Functions

```move
/// Check if a lock has been claimed
#[view]
public fun is_lock_claimed<Chain, Asset>(lock_id: vector<u8>): bool

/// Get total locked value for an asset
#[view]
public fun get_total_locked<Chain, Asset>(): u256

/// Get receipt details
#[view]
public fun get_receipt<Chain, Asset>(lock_id: vector<u8>): (address, u256, u64, u8)
```

## Testing Strategy

### Unit Tests

- Test receipt creation and storage
- Test replay protection
- Test type safety (different assets maintain separate state)
- Test lock ID generation uniqueness

### Integration Tests

- Test Ethereum proof verification → receipt creation
- Test receipt claiming
- Test interaction with fake_eth/fake_usd modules

### E2E Test

Complete cross-chain flow:
1. Lock on Ethereum
2. Generate proof
3. Register receipt on Aptos
4. Claim and mint tokens

## Future Extensions

### 1. Time-Locked Receipts

Add expiration times for receipts:

```move
struct LockReceipt<phantom Chain, phantom Asset> has key {
    // ... existing fields
    expires_at: u64, // Timestamp when receipt expires
}
```

### 2. NFT Support

Support non-fungible assets:

```move
struct NFTAsset has copy, drop, store {
    collection: vector<u8>,
    token_id: u256,
}

LockReceipt<Ethereum, NFTAsset>
```

### 3. Unlock Flow

Support unlocking assets on the source chain:

```move
public entry fun unlock_on_ethereum<Asset>(
    account: &signer,
    receipt: LockReceipt<Ethereum, Asset>,
) {
    // Burn tokens on Aptos
    // Generate unlock proof
    // Mark receipt as revoked
}
```

## Summary

The `lock_receipt` module provides a **generic, type-safe, cryptographically secure** framework for cross-chain asset locks. By leveraging Move's phantom types, it achieves:

- **Zero code duplication** across chains and assets
- **Compile-time safety** preventing misuse
- **Extensibility** without modifying existing code
- **Clean separation of concerns** between verification and asset management

This architecture enables Atomica to support unlimited chains and assets with a single, well-tested codebase.
