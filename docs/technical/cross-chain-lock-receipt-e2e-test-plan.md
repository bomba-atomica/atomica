# Cross-Chain Lock Receipt E2E Test Plan

## Overview

This document outlines the end-to-end testing strategy for the cross-chain lock receipt system, which enables users to lock assets on Ethereum and receive verifiable receipts on Aptos.

## Test Architecture

### Dual Testnet Setup

The E2E test requires two independent blockchain testnets running simultaneously:

1. **Ethereum Docker Testnet**
   - 4 validators running Geth + Prysm (Proof-of-Stake)
   - Pre-deployed contracts: FakeETH, FakeUSD, LockBox
   - Pre-funded test accounts with ETH
   - JSON-RPC on port 8545
   - Beacon API on port 5052

2. **Aptos Docker Testnet**
   - 4 validators running Aptos nodes
   - Pre-deployed Move modules: lock_receipt, fake_eth, fake_usd
   - Faucet account for funding test accounts
   - REST API on port 8080

### Test Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. SETUP PHASE                                                  │
├─────────────────────────────────────────────────────────────────┤
│ a. Start Ethereum testnet (4 validators)                        │
│ b. Start Aptos testnet (4 validators)                           │
│ c. Deploy Ethereum contracts (FakeETH, FakeUSD, LockBox)        │
│ d. Deploy Aptos modules (lock_receipt, fake_eth, fake_usd)      │
│ e. Initialize registries on Aptos                               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. ETHEREUM MINTING PHASE                                       │
├─────────────────────────────────────────────────────────────────┤
│ a. User calls FakeETH.mint(1000 ETH)                            │
│    - Transaction submitted to Ethereum                          │
│    - Wait for confirmation                                      │
│    - Verify user balance: 1000 FakeETH                          │
│                                                                  │
│ b. User calls FakeUSD.mint(5000 USD)                            │
│    - Transaction submitted to Ethereum                          │
│    - Wait for confirmation                                      │
│    - Verify user balance: 5000 FakeUSD                          │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. ETHEREUM LOCKING PHASE                                       │
├─────────────────────────────────────────────────────────────────┤
│ a. User approves LockBox to spend FakeETH                       │
│    - FakeETH.approve(LockBox, 10 ETH)                           │
│    - Wait for confirmation                                      │
│                                                                  │
│ b. User locks FakeETH in LockBox                                │
│    - LockBox.lock(FakeETH, 10 ETH)                              │
│    - Wait for confirmation                                      │
│    - Verify LockBox balance: 10 FakeETH                         │
│    - Verify user locked balance: 10 FakeETH                     │
│                                                                  │
│ c. User approves and locks FakeUSD (similar process)            │
│    - Approve: FakeUSD.approve(LockBox, 100 USD)                 │
│    - Lock: LockBox.lock(FakeUSD, 100 USD)                       │
│    - Verify LockBox balance: 100 FakeUSD                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. PROOF GENERATION PHASE                                       │
├─────────────────────────────────────────────────────────────────┤
│ a. Wait for lock transaction to be finalized (12 blocks)        │
│                                                                  │
│ b. Generate Ethereum state proof for FakeETH lock               │
│    - Call eth_getProof(LockBox, storageKey, blockNumber)        │
│    - Extract proof components:                                  │
│      * block_hash                                               │
│      * state_root                                               │
│      * account_proof (MPT proof for LockBox account)            │
│      * storage_proof (MPT proof for locked balance)             │
│      * storage_value (10 ETH in wei)                            │
│                                                                  │
│ c. Generate storage key for user+token mapping                  │
│    - Compute: keccak256(token || keccak256(user || uint(0)))    │
│    - This is Solidity nested mapping key calculation            │
│                                                                  │
│ d. Repeat for FakeUSD lock proof                                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 5. APTOS REGISTRATION PHASE                                     │
├─────────────────────────────────────────────────────────────────┤
│ a. User (or admin) submits FakeETH lock proof to Aptos          │
│    - Call: lock_receipt::register_ethereum_lock<FakeETH>(       │
│        block_number,                                            │
│        block_hash,                                              │
│        state_root,                                              │
│        lockbox_address,                                         │
│        user_eth_address,                                        │
│        token_address,                                           │
│        storage_key,                                             │
│        storage_value,                                           │
│        account_proof,                                           │
│        storage_proof                                            │
│      )                                                          │
│                                                                  │
│ b. Aptos chain verifies the proof                               │
│    - MPT verification of account_proof against state_root       │
│    - MPT verification of storage_proof against account's        │
│      storage_root                                               │
│    - Extract verified storage_value                             │
│    - Generate unique lock_id from proof components              │
│                                                                  │
│ c. Create LockReceipt<Ethereum, FakeETH>                        │
│    - Store in ReceiptRegistry                                   │
│    - Mark lock_id as claimed (replay protection)                │
│    - Emit LockRegistered event                                  │
│                                                                  │
│ d. Repeat for FakeUSD lock                                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 6. VERIFICATION PHASE                                           │
├─────────────────────────────────────────────────────────────────┤
│ a. Query Aptos for user's lock receipts                         │
│    - Get receipt by lock_id                                     │
│    - Verify: user address (converted from Ethereum)             │
│    - Verify: amount (10 ETH in wei)                             │
│    - Verify: status = ACTIVE                                    │
│    - Verify: block_number matches Ethereum                      │
│                                                                  │
│ b. Check registry metrics                                       │
│    - get_receipt_count<Ethereum, FakeETH>() == 1                │
│    - get_total_locked<Ethereum, FakeETH>() == 10 ETH (wei)      │
│    - is_lock_claimed<Ethereum, FakeETH>(lock_id) == true        │
│                                                                  │
│ c. Verify FakeUSD receipt (similar checks)                      │
│                                                                  │
│ d. Test replay attack prevention                                │
│    - Try to register same proof again                           │
│    - Should fail with E_ALREADY_CLAIMED                         │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 7. OPTIONAL: CLAIMING PHASE                                     │
├─────────────────────────────────────────────────────────────────┤
│ a. User claims receipt to mint FakeETH on Aptos                 │
│    - Call: fake_eth::mint_from_lock(lock_id)                    │
│    - Verifies user owns the receipt                             │
│    - Marks receipt as CLAIMED                                   │
│    - Mints 1 FakeETH (10^18 wei → 10^8 with 8 decimals)         │
│                                                                  │
│ b. Verify cannot claim again                                    │
│    - Call should fail with E_RECEIPT_ALREADY_CLAIMED            │
│                                                                  │
│ Note: This phase requires address mapping between Ethereum      │
│       and Aptos accounts, which may need additional setup.      │
└─────────────────────────────────────────────────────────────────┘
```

## Detailed Test Scenarios

### Scenario 1: Happy Path - FakeETH Lock and Receipt

**Prerequisites:**
- Ethereum testnet running
- Aptos testnet running
- Contracts deployed
- User has ETH for gas

**Steps:**
1. Mint 1000 FakeETH on Ethereum
2. Approve LockBox to spend 10 FakeETH
3. Lock 10 FakeETH in LockBox
4. Wait for finalization (12 blocks)
5. Generate Ethereum state proof
6. Submit proof to Aptos
7. Verify receipt created
8. Check registry state

**Expected Results:**
- ✅ FakeETH minted successfully
- ✅ LockBox approved and locked funds
- ✅ Proof generation succeeds
- ✅ Proof verification succeeds on Aptos
- ✅ Receipt stored with correct data
- ✅ lock_id marked as claimed
- ✅ Metrics updated correctly

### Scenario 2: Replay Attack Prevention

**Prerequisites:**
- Scenario 1 completed
- Same proof available

**Steps:**
1. Attempt to submit the same proof again
2. Transaction should be rejected

**Expected Results:**
- ❌ Transaction fails with `E_ALREADY_CLAIMED`
- ✅ Receipt count remains 1
- ✅ Total locked amount unchanged

### Scenario 3: Invalid Proof Rejection

**Prerequisites:**
- Ethereum testnet running
- Aptos testnet running

**Steps:**
1. Generate proof with modified storage_value
2. Submit to Aptos
3. Transaction should be rejected

**Expected Results:**
- ❌ MPT verification fails
- ❌ No receipt created
- ✅ Registry state unchanged

### Scenario 4: Multi-Asset Lock

**Prerequisites:**
- Both testnets running
- FakeETH and FakeUSD deployed

**Steps:**
1. Lock 10 FakeETH
2. Lock 100 FakeUSD
3. Generate proofs for both
4. Submit both proofs to Aptos
5. Verify both receipts

**Expected Results:**
- ✅ Two separate receipts created
- ✅ Separate registries: ReceiptRegistry<Ethereum, FakeETH> and ReceiptRegistry<Ethereum, FakeUSD>
- ✅ Type isolation maintained
- ✅ Independent metrics for each asset

### Scenario 5: Unauthorized Signer

**Prerequisites:**
- FakeETH locked by User A
- Proof generated for User A's lock

**Steps:**
1. User B attempts to register the proof
2. Transaction should be rejected

**Expected Results:**
- ❌ Transaction fails with `E_UNAUTHORIZED_SIGNER`
- ✅ No receipt created for User B
- ✅ Registry state unchanged

## Implementation Requirements

### Ethereum Contracts

**FakeETH.sol / FakeUSD.sol:**
```solidity
function mint(uint256 amount) external;
function approve(address spender, uint256 amount) external;
function balanceOf(address account) external view returns (uint256);
```

**LockBox.sol:**
```solidity
function lock(address token, uint256 amount) external;
function getLockedBalance(address user, address token) external view returns (uint256);
```

### Aptos Modules

**lock_receipt.move:**
```move
public entry fun initialize<Chain, Asset>(account: &signer);

public entry fun register_ethereum_lock<Asset>(
    account: &signer,
    block_number: u64,
    block_hash: vector<u8>,
    state_root: vector<u8>,
    contract_address: vector<u8>,
    user_address: vector<u8>,
    token_address: vector<u8>,
    storage_key: vector<u8>,
    storage_value: u256,
    account_proof: vector<vector<u8>>,
    storage_proof: vector<vector<u8>>,
) acquires ReceiptRegistry;

#[view]
public fun get_receipt<Chain, Asset>(
    lock_id: vector<u8>
): (address, u256, u64, u8) acquires ReceiptRegistry;

#[view]
public fun is_lock_claimed<Chain, Asset>(lock_id: vector<u8>): bool;

#[view]
public fun get_receipt_count<Chain, Asset>(): u64;

#[view]
public fun get_total_locked<Chain, Asset>(): u256;
```

**fake_eth.move / fake_usd.move:**
```move
public entry fun initialize(admin: &signer);

public entry fun mint_from_lock(
    account: &signer,
    lock_id: vector<u8>,
) acquires ManagingRefs;
```

### Test Utilities

**Proof Generator (`src/lib/ethereum/proofs/generator.ts`):**
```typescript
export async function generateLockProof(
    provider: JsonRpcProvider,
    lockBoxAddress: string,
    userAddress: string,
    tokenAddress: string,
    blockNumber: number
): Promise<EthereumStateProof> {
    // 1. Calculate storage key for nested mapping
    const storageKey = calculateStorageKey(userAddress, tokenAddress);
    
    // 2. Get proof from Ethereum node
    const proof = await provider.send("eth_getProof", [
        lockBoxAddress,
        [storageKey],
        `0x${blockNumber.toString(16)}`
    ]);
    
    // 3. Extract and format proof components
    return {
        blockNumber,
        blockHash: proof.blockHash,
        stateRoot: proof.stateRoot,
        accountProof: proof.accountProof,
        storageProof: proof.storageProof[0].proof,
        storageValue: proof.storageProof[0].value,
    };
}
```

**Address Converter:**
```typescript
export function ethereumToAptosAddress(ethAddress: string): string {
    // Remove 0x prefix
    const hex = ethAddress.slice(2);
    
    // Pad to 32 bytes (64 hex chars)
    // Ethereum: 20 bytes → pad with 12 zero bytes on left
    const padded = "0".repeat(24) + hex;
    
    return "0x" + padded;
}
```

## Test Data

### Pre-funded Accounts

**Ethereum:**
- Account 0: 10,000 ETH (for gas)
- Private Key: Available from `EthereumDockerTestnet.getTestAccounts()`

**Aptos:**
- Faucet account: Can fund any address
- Test account: Funded with 100 APT

### Test Amounts

| Asset    | Mint Amount | Lock Amount | Expected Receipt Value |
|----------|-------------|-------------|------------------------|
| FakeETH  | 1000 ETH    | 10 ETH      | 10^19 wei (u256)       |
| FakeUSD  | 5000 USD    | 100 USD     | 10^8 (6 decimals)      |

### Block Confirmation Requirements

- **Ethereum finalization**: 12 blocks (~3 minutes)
- **Aptos confirmation**: 1 block (~1 second)
- **Total test time**: ~5-7 minutes including setup

## Error Scenarios to Test

| Scenario | Expected Error | Error Code |
|----------|---------------|------------|
| Replay attack | E_ALREADY_CLAIMED | 1 |
| Invalid MPT proof | E_HASH_MISMATCH (from mpt.move) | 2 |
| Wrong storage value | E_AMOUNT_MISMATCH | 2 |
| Unauthorized signer | E_UNAUTHORIZED_SIGNER | 9 |
| Uninitialized registry | E_REGISTRY_NOT_INITIALIZED | 6 |
| Non-existent receipt | E_RECEIPT_NOT_FOUND | 3 |

## Performance Metrics

### Target Timings

- **Testnet startup**: < 4 minutes (both chains)
- **Contract deployment**: < 30 seconds
- **Minting**: < 5 seconds per transaction
- **Locking**: < 10 seconds (approve + lock)
- **Proof generation**: < 2 seconds
- **Proof verification on Aptos**: < 5 seconds
- **Total E2E flow**: < 7 minutes

### Resource Usage

- **Docker containers**: 10 total (4 ETH validators + 4 Aptos validators + 2 support)
- **Memory**: ~8GB total
- **Disk**: ~2GB
- **Network**: Docker bridge network

## Monitoring and Debugging

### Log Points

1. **Testnet startup**: Validator health, genesis completion
2. **Contract deployment**: Transaction hashes, contract addresses
3. **Minting**: User balances before/after
4. **Locking**: LockBox balances, locked amounts
5. **Proof generation**: Proof size, verification locally
6. **Aptos submission**: Transaction hash, gas used
7. **Receipt verification**: Receipt data, registry state

### Debug Helpers

```typescript
// Log Ethereum transaction details
function logEthTx(tx: TransactionResponse) {
    console.log(`ETH Tx: ${tx.hash}`);
    console.log(`  Block: ${tx.blockNumber}`);
    console.log(`  Gas: ${tx.gasLimit}`);
}

// Log Aptos transaction details
function logAptosTx(tx: any) {
    console.log(`Aptos Tx: ${tx.hash}`);
    console.log(`  Version: ${tx.version}`);
    console.log(`  Success: ${tx.success}`);
}

// Log proof details
function logProof(proof: EthereumStateProof) {
    console.log(`Proof for block ${proof.blockNumber}`);
    console.log(`  Block hash: ${proof.blockHash}`);
    console.log(`  State root: ${proof.stateRoot}`);
    console.log(`  Account proof nodes: ${proof.accountProof.length}`);
    console.log(`  Storage proof nodes: ${proof.storageProof.length}`);
    console.log(`  Storage value: ${proof.storageValue}`);
}
```

## Success Criteria

The E2E test is considered successful when:

1. ✅ Both testnets start and remain healthy
2. ✅ All contracts deploy successfully
3. ✅ User can mint FakeETH and FakeUSD
4. ✅ User can lock assets in LockBox
5. ✅ Proof generation succeeds with valid MPT proofs
6. ✅ Aptos chain accepts and verifies the proofs
7. ✅ Receipts are created with correct data
8. ✅ Registry state is updated correctly
9. ✅ Replay attacks are prevented
10. ✅ Type isolation is maintained
11. ✅ All view functions return correct data
12. ✅ Test completes in < 10 minutes

## Future Enhancements

1. **Address Mapping**: Implement proper Ethereum → Aptos address derivation
2. **Claiming Phase**: Test full mint_from_lock flow
3. **Multi-user**: Test with multiple users locking simultaneously
4. **Unlock Flow**: Test bi-directional bridge (Aptos → Ethereum)
5. **Performance**: Batch proof submissions
6. **Security**: Fuzzing, edge cases, malicious proofs

## References

- [Lock Receipt Architecture](./lock-receipt-architecture.md)
- [Lock Receipt Completion Plan](./lock-receipt-completion-plan.md)
- [Ethereum State Proof Quirks](./ethereum-state-proof-quirks.md)
- [Golden Vectors](../../lib/ethereum-fixtures/golden_vectors.json)

---

**Version**: 1.0  
**Last Updated**: 2026-02-04  
**Status**: Ready for Implementation
