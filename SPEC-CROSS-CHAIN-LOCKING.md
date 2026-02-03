# Cross-Chain Locking & State Proof Verification
## Specification v1.0

**Date:** 2026-02-03
**Status:** Planning
**Replaces:** Original Phase 4 & 5

---

## Executive Summary

Implement the core cross-chain mechanism: users lock FAKETH/FAKEUSD on Ethereum, generate state proofs, and submit them to Aptos to enable auction participation. This creates trustless verification that funds are locked on Ethereum before allowing auction operations on Aptos.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     ETHEREUM TESTNET                         │
│                                                              │
│  User Locks Coins                                           │
│  ┌──────────┐         ┌──────────────┐                     │
│  │  Seller  │────────▶│  LockBox.sol │                     │
│  │          │  Lock   │              │                     │
│  │ FAKETH   │  10 ETH │  - Escrow    │                     │
│  └──────────┘         │  - Timelock  │                     │
│                       │  - Withdraw  │                     │
│  ┌──────────┐         └──────────────┘                     │
│  │  Buyer   │────────▶┌──────────────┐                     │
│  │          │  Lock   │  LockBox.sol │                     │
│  │ FAKEUSD  │  10k USD│              │                     │
│  └──────────┘         └──────────────┘                     │
│                                                              │
│  State at Block N:                                          │
│  - Seller locked: 10 FAKETH                                 │
│  - Buyer locked: 10,000 FAKEUSD                             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                         │
                         │ Generate State Proof
                         │ (eth_getProof RPC call)
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  STATE PROOF GENERATOR                       │
│                                                              │
│  Input:                                                      │
│  - Ethereum block hash                                       │
│  - LockBox contract address                                  │
│  - Storage slot keys (for locked balances)                   │
│                                                              │
│  Output:                                                     │
│  - Account proof (MPT proof for contract)                    │
│  - Storage proofs (MPT proof for each balance)               │
│  - Block header                                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                         │
                         │ Submit Proof
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                     APTOS TESTNET                            │
│                                                              │
│  ┌────────────────────────────────────────┐                │
│  │  StateProofVerifier.move               │                │
│  │                                         │                │
│  │  1. Verify block header signature       │                │
│  │  2. Verify account proof (MPT)          │                │
│  │  3. Verify storage proof (MPT)          │                │
│  │  4. Extract locked amounts              │                │
│  │                                         │                │
│  │  Result: (seller_locked, buyer_locked)  │                │
│  └────────────────────────────────────────┘                │
│                         │                                    │
│                         ▼                                    │
│  ┌────────────────────────────────────────┐                │
│  │  AuctionRegistry.move                   │                │
│  │                                         │                │
│  │  create_auction_with_proof(             │                │
│  │    proof: StateProof,                   │                │
│  │    seller: address,                     │                │
│  │    amount: u64,                         │                │
│  │    min_price: u64,                      │                │
│  │    duration: u64                        │                │
│  │  )                                      │                │
│  │                                         │                │
│  │  - Verify proof                         │                │
│  │  - Check seller has locked >= amount    │                │
│  │  - Create auction                       │                │
│  └────────────────────────────────────────┘                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Component 1: Ethereum LockBox Contract

### Purpose
Escrow contract that holds FAKETH and FAKEUSD tokens with timelock and withdrawal mechanisms.

### Key Features
1. **Per-User Locking** - Each user has their own balance
2. **Timelock** - Funds locked for minimum duration
3. **Proof-Friendly Storage** - Use predictable storage slots for easy proof generation
4. **Events** - Emit events for indexing locked balances

### Contract Design

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract LockBox {
    // Token addresses
    IERC20 public immutable fakeETH;
    IERC20 public immutable fakeUSD;

    // Minimum lock duration (for testing: 1 hour)
    uint256 public constant MIN_LOCK_DURATION = 1 hours;

    // User balances: user => token => amount
    mapping(address => mapping(address => uint256)) public lockedBalances;

    // Unlock times: user => token => timestamp
    mapping(address => mapping(address => uint256)) public unlockTimes;

    // Events
    event TokensLocked(
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 unlockTime
    );

    event TokensWithdrawn(
        address indexed user,
        address indexed token,
        uint256 amount
    );

    constructor(address _fakeETH, address _fakeUSD) {
        fakeETH = IERC20(_fakeETH);
        fakeUSD = IERC20(_fakeUSD);
    }

    /**
     * Lock tokens for auction participation
     * @param token Address of token to lock (fakeETH or fakeUSD)
     * @param amount Amount to lock
     */
    function lock(address token, uint256 amount) external {
        require(
            token == address(fakeETH) || token == address(fakeUSD),
            "Invalid token"
        );
        require(amount > 0, "Amount must be > 0");

        // Transfer tokens from user to contract
        IERC20(token).transferFrom(msg.sender, address(this), amount);

        // Update locked balance
        lockedBalances[msg.sender][token] += amount;

        // Set unlock time (extend if already locked)
        uint256 newUnlockTime = block.timestamp + MIN_LOCK_DURATION;
        if (newUnlockTime > unlockTimes[msg.sender][token]) {
            unlockTimes[msg.sender][token] = newUnlockTime;
        }

        emit TokensLocked(
            msg.sender,
            token,
            amount,
            unlockTimes[msg.sender][token]
        );
    }

    /**
     * Withdraw unlocked tokens
     * @param token Address of token to withdraw
     * @param amount Amount to withdraw
     */
    function withdraw(address token, uint256 amount) external {
        require(
            block.timestamp >= unlockTimes[msg.sender][token],
            "Tokens still locked"
        );
        require(
            lockedBalances[msg.sender][token] >= amount,
            "Insufficient balance"
        );

        // Update balance
        lockedBalances[msg.sender][token] -= amount;

        // Transfer tokens back to user
        IERC20(token).transfer(msg.sender, amount);

        emit TokensWithdrawn(msg.sender, token, amount);
    }

    /**
     * Get user's locked balance for a token
     * @param user User address
     * @param token Token address
     * @return Locked amount
     */
    function getLockedBalance(
        address user,
        address token
    ) external view returns (uint256) {
        return lockedBalances[user][token];
    }

    /**
     * Check if tokens are unlocked
     * @param user User address
     * @param token Token address
     * @return True if unlocked
     */
    function isUnlocked(
        address user,
        address token
    ) external view returns (bool) {
        return block.timestamp >= unlockTimes[user][token];
    }
}
```

### Storage Layout

The Solidity storage layout for the nested mapping is:
- `lockedBalances[user][token]` is stored at slot: `keccak256(keccak256(token || slot) || user)`
- Where slot = 2 (position of lockedBalances in contract)

This deterministic layout allows us to compute the storage key for any user/token combination.

---

## Component 2: State Proof Generator

### Purpose
Generate Merkle-Patricia Trie proofs from Ethereum state that can be verified on Aptos.

### Implementation

We'll use the existing `@atomica/state-proofs` TypeScript package which already has:
- Ethereum RPC client integration
- `eth_getProof` wrapper
- MPT proof verification
- Receipt proof generation

### Key Functions

```typescript
import { StateProofVerifier } from '@atomica/state-proofs';

/**
 * Generate state proof for locked balance
 */
async function generateLockedBalanceProof(
  ethRpcUrl: string,
  lockBoxAddress: string,
  userAddress: string,
  tokenAddress: string,
  blockNumber: number
): Promise<StateProof> {
  // 1. Calculate storage key for lockedBalances[user][token]
  const storageKey = calculateStorageKey(userAddress, tokenAddress, 2);

  // 2. Get proof from Ethereum
  const proof = await eth_getProof(
    lockBoxAddress,
    [storageKey],
    blockNumber
  );

  // 3. Get block header
  const blockHeader = await eth_getBlockByNumber(blockNumber);

  return {
    blockHeader,
    accountProof: proof.accountProof,
    storageProof: proof.storageProof[0],
    storageKey,
    storageValue: proof.storageProof[0].value
  };
}

/**
 * Calculate storage key for nested mapping
 * lockedBalances[user][token]
 */
function calculateStorageKey(
  userAddress: string,
  tokenAddress: string,
  slot: number
): string {
  // Inner mapping: keccak256(token || slot)
  const innerKey = ethers.keccak256(
    ethers.concat([
      ethers.zeroPadValue(tokenAddress, 32),
      ethers.zeroPadValue(ethers.toBeHex(slot), 32)
    ])
  );

  // Outer mapping: keccak256(user || innerKey)
  const storageKey = ethers.keccak256(
    ethers.concat([
      ethers.zeroPadValue(userAddress, 32),
      innerKey
    ])
  );

  return storageKey;
}
```

---

## Component 3: Aptos State Proof Verifier

### Purpose
Verify Ethereum state proofs on Aptos and extract locked balance amounts.

### Move Module Design

```move
module atomica::state_proof_verifier {
    use std::vector;
    use aptos_std::aptos_hash;

    /// State proof structure
    struct StateProof has copy, drop {
        // Block header (RLP encoded)
        block_header: vector<u8>,
        // Account proof (MPT proof)
        account_proof: vector<vector<u8>>,
        // Storage proof (MPT proof)
        storage_proof: vector<vector<u8>>,
        // Storage key
        storage_key: vector<u8>,
        // Storage value (locked amount)
        storage_value: u256,
    }

    /// Verify state proof and extract locked amount
    public fun verify_locked_balance(
        proof: &StateProof,
        contract_address: vector<u8>,
        expected_state_root: vector<u8>
    ): u256 {
        // 1. Verify block header (simplified for testnet)
        // TODO: In production, verify block header signatures

        // 2. Verify account proof
        let account_data = verify_account_proof(
            &proof.account_proof,
            contract_address,
            expected_state_root
        );

        // 3. Extract storage root from account data
        let storage_root = extract_storage_root(&account_data);

        // 4. Verify storage proof
        let storage_value_bytes = verify_storage_proof(
            &proof.storage_proof,
            proof.storage_key,
            storage_root
        );

        // 5. Decode storage value (u256)
        let locked_amount = decode_u256(&storage_value_bytes);

        locked_amount
    }

    /// Verify Merkle-Patricia Trie account proof
    fun verify_account_proof(
        proof: &vector<vector<u8>>,
        key: vector<u8>,
        root: vector<u8>
    ): vector<u8> {
        // MPT verification logic
        // Returns: RLP-encoded account data
        // (nonce, balance, storageRoot, codeHash)

        // TODO: Implement full MPT verification
        // For now, placeholder that trusts the proof
        vector::empty<u8>()
    }

    /// Verify Merkle-Patricia Trie storage proof
    fun verify_storage_proof(
        proof: &vector<vector<u8>>,
        key: vector<u8>,
        storage_root: vector<u8>
    ): vector<u8> {
        // MPT verification logic
        // Returns: RLP-encoded storage value

        // TODO: Implement full MPT verification
        vector::empty<u8>()
    }

    /// Extract storage root from RLP-encoded account data
    fun extract_storage_root(account_data: &vector<u8>): vector<u8> {
        // Parse RLP: [nonce, balance, storageRoot, codeHash]
        // Return storageRoot (3rd field)

        vector::empty<u8>()
    }

    /// Decode u256 from bytes (big-endian)
    fun decode_u256(bytes: &vector<u8>): u256 {
        // Convert 32 bytes to u256
        0u256
    }
}
```

---

## Component 4: Auction Creation with Proof

### Purpose
Create auctions on Aptos that require proof of locked Ethereum funds.

### Move Module Update

```move
module atomica::registry {
    use atomica::state_proof_verifier::{Self, StateProof};

    /// Create auction with Ethereum lock proof
    public entry fun create_auction_with_proof(
        seller: &signer,
        proof: StateProof,
        eth_contract_address: vector<u8>,
        eth_state_root: vector<u8>,
        amount: u64,
        min_price: u64,
        duration: u64,
        mpk: vector<u8>
    ) {
        // 1. Verify state proof and extract locked amount
        let locked_amount = state_proof_verifier::verify_locked_balance(
            &proof,
            eth_contract_address,
            eth_state_root
        );

        // 2. Ensure locked amount >= auction amount
        assert!(locked_amount >= (amount as u256), E_INSUFFICIENT_LOCKED);

        // 3. Create auction (existing logic)
        // ... existing auction creation code ...
    }

    const E_INSUFFICIENT_LOCKED: u64 = 100;
}
```

---

## Implementation Phases

### Phase 4A: Ethereum LockBox Contract
**Deliverable:** Smart contract for locking FAKETH/FAKEUSD

**Tasks:**
- [ ] Write LockBox.sol contract
- [ ] Write Solidity unit tests (lock, withdraw, balances)
- [ ] Deploy to Ethereum testnet
- [ ] Test storage layout (verify storage keys match calculated keys)

**Test Cases:**
- Lock FAKETH, verify balance stored correctly
- Lock FAKEUSD, verify balance stored correctly
- Cannot withdraw before timelock expires
- Can withdraw after timelock expires
- Storage key calculation matches actual storage slot

---

### Phase 4B: State Proof Generation
**Deliverable:** TypeScript library to generate proofs

**Tasks:**
- [ ] Implement storage key calculator
- [ ] Integrate with @atomica/state-proofs package
- [ ] Create proof generator function
- [ ] Write integration tests (generate proof, verify in JS)
- [ ] Create CLI tool for proof generation

**Test Cases:**
- Calculate correct storage key for nested mapping
- Generate valid account proof
- Generate valid storage proof
- Proof verifies correctly with ethers.js

---

### Phase 4C: Aptos Proof Verifier
**Deliverable:** Move module to verify Ethereum proofs

**Tasks:**
- [ ] Implement MPT verification in Move
- [ ] Implement RLP decoding in Move
- [ ] Write Move unit tests
- [ ] Integration test: generate proof in TS, verify in Move
- [ ] Benchmark gas costs

**Test Cases:**
- Verify valid account proof
- Verify valid storage proof
- Reject invalid proofs
- Extract correct locked amount
- Handle edge cases (zero balance, max value)

---

### Phase 4D: End-to-End Integration
**Deliverable:** Full cross-chain auction flow

**Tasks:**
- [ ] Update AuctionRegistry to accept proofs
- [ ] Create TypeScript orchestration script
- [ ] Write E2E test: lock → proof → auction
- [ ] Update UI to show locked balances
- [ ] Add proof generation to UI flow

**Test Cases:**
- Seller locks FAKETH on Ethereum
- Generate proof of lock
- Submit proof to Aptos
- Create auction successfully
- Buyer locks FAKEUSD
- Generate proof
- Place bid successfully

---

## Data Flow Example

### Example: Seller Creates Auction

1. **Seller locks 10 FAKETH on Ethereum:**
   ```typescript
   // User approves LockBox to spend FAKETH
   await fakeETH.approve(lockBoxAddress, ethers.parseEther("10"));

   // Lock tokens
   await lockBox.lock(fakeETHAddress, ethers.parseEther("10"));
   ```

2. **Generate state proof:**
   ```typescript
   const proof = await generateLockedBalanceProof(
     "http://localhost:8545",
     lockBoxAddress,
     sellerAddress,
     fakeETHAddress,
     await ethTestnet.getBlockNumber()
   );
   ```

3. **Submit proof to Aptos:**
   ```typescript
   // Serialize proof to Move struct
   const moveProof = serializeProofForMove(proof);

   // Create auction with proof
   await aptos.transaction.build.simple({
     sender: sellerAptosAddress,
     data: {
       function: `${REGISTRY_ADDR}::registry::create_auction_with_proof`,
       typeArguments: [],
       functionArguments: [
         moveProof,
         lockBoxAddress,
         proof.blockHeader.stateRoot,
         10, // amount (10 FAKETH)
         1000, // min price (1000 FAKEUSD)
         3600, // duration (1 hour)
         mpk // master public key
       ]
     }
   });
   ```

4. **Aptos verifies proof and creates auction:**
   - Verifies MPT proofs
   - Extracts locked amount (10 FAKETH)
   - Creates auction in registry

---

## Security Considerations

### 1. Block Finality
- **Issue:** Ethereum blocks can be reorged
- **Mitigation:** Only accept proofs from finalized blocks (>= 64 blocks old)
- **Implementation:** Check block finality in proof verifier

### 2. Timelock Duration
- **Issue:** Users could unlock and spend tokens after proof is generated
- **Mitigation:** Enforce minimum lock duration (1 hour for testnet, longer for mainnet)
- **Implementation:** LockBox contract enforces MIN_LOCK_DURATION

### 3. Proof Replay
- **Issue:** Same proof could be used multiple times
- **Mitigation:** Track used proofs by block hash + storage key
- **Implementation:** Maintain set of used proof identifiers in Aptos

### 4. Storage Key Calculation
- **Issue:** Incorrect storage key leads to wrong balance verification
- **Mitigation:** Extensive testing of storage key calculation
- **Implementation:** Unit tests comparing calculated vs actual storage slots

### 5. MPT Verification
- **Issue:** Invalid proofs could be accepted
- **Mitigation:** Rigorous MPT verification implementation
- **Implementation:** Test against known-good proofs from Ethereum

---

## Testing Strategy

### Unit Tests
- **Solidity:** 15 tests for LockBox
- **TypeScript:** 10 tests for proof generation
- **Move:** 20 tests for proof verification

### Integration Tests
- **Cross-chain:** 8 tests for full flow
- **Edge cases:** 5 tests for error conditions

### E2E Tests
- **Happy path:** Complete auction with proofs
- **Failure cases:** Insufficient lock, invalid proof, expired proof

---

## Success Metrics

1. **Functionality**
   - [ ] Can lock FAKETH on Ethereum
   - [ ] Can lock FAKEUSD on Ethereum
   - [ ] Can generate valid state proofs
   - [ ] Can verify proofs on Aptos
   - [ ] Can create auction with proof
   - [ ] Can place bid with proof

2. **Performance**
   - [ ] Proof generation < 5 seconds
   - [ ] Proof verification < 1 second on Aptos
   - [ ] Gas cost < 500k gas for verification

3. **Security**
   - [ ] Cannot bypass lock requirement
   - [ ] Cannot reuse proofs
   - [ ] Cannot use proofs from unfinalized blocks
   - [ ] Timelock enforced correctly

---

## Future Enhancements (Out of Scope)

1. **Light Client Verification**
   - Verify Ethereum block headers using sync committee signatures
   - Full trustless verification without relying on finality

2. **Batch Proofs**
   - Generate proofs for multiple users in single transaction
   - Reduce gas costs for bulk operations

3. **ZK Proofs**
   - Replace MPT proofs with ZK-SNARKs
   - Smaller proof size, faster verification

4. **Cross-Chain Settlement**
   - After auction completes, unlock tokens automatically
   - Transfer tokens based on auction outcome

---

## Appendix: Storage Key Calculation Example

For `lockedBalances[0x1234...][0xABCD...]` where `lockedBalances` is at slot 2:

```typescript
// Step 1: Inner mapping key (token address at slot 2)
const innerKey = keccak256(
  concat([
    pad32(0xABCD...), // token address
    pad32(2)          // slot number
  ])
);
// Result: 0x5678...

// Step 2: Outer mapping key (user address at innerKey)
const storageKey = keccak256(
  concat([
    pad32(0x1234...), // user address
    innerKey          // 0x5678...
  ])
);
// Final storage key: 0x9ABC...
```

This storage key is used in `eth_getProof` to retrieve the locked balance value.

---

**End of Specification**
