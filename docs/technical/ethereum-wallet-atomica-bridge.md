# Ethereum Wallet → Atomica Bridge: Technical Implementation

## Product Overview

**Goal**: Enable users to create blockchain transactions in a browser using MetaMask (or any Ethereum wallet), have those transactions execute on Atomica (Aptos-derived L2), without requiring:
- Pre-existing Atomica accounts
- Gas tokens on Atomica
- Ethereum mainnet transaction submission

**Key Innovation**: Transaction signature happens with Ethereum keys, state verification checks Ethereum state (e.g., locked ETH in contract), and execution happens on Atomica—all without Ethereum gas costs.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    User Browser (Frontend)                       │
│  ┌──────────────┐         ┌─────────────────────────────┐      │
│  │  MetaMask    │────────▶│   Sign Ethereum-style TX    │      │
│  │  (secp256k1) │         │   (ECDSA signature)         │      │
│  └──────────────┘         └─────────────────────────────┘      │
└───────────────────────────────────┬─────────────────────────────┘
                                    │ Signed TX + Ethereum Address
                                    ↓
┌─────────────────────────────────────────────────────────────────┐
│                     Atomica Sequencer/Validator                  │
│                                                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Step 1: Ethereum Signature Verification (AIP-49)      │    │
│  │  - Use secp256k1::ecdsa_recover()                      │    │
│  │  - Verify ECDSA signature with Ethereum address        │    │
│  │  - Extract public key from signature                   │    │
│  └────────────────────────────────────────────────────────┘    │
│                            ↓                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Step 2: Derive Atomica Account (AIP-113)             │    │
│  │  - Compute DAA address from:                           │    │
│  │    * Ethereum public key (abstract_public_key)         │    │
│  │    * Authentication function (secp256k1 verifier)      │    │
│  │    * dApp domain (account_identity)                    │    │
│  │  - Create account if first transaction                 │    │
│  └────────────────────────────────────────────────────────┘    │
│                            ↓                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Step 3: Ethereum State Verification (ZK Light Client) │    │
│  │  - Query Ethereum light client on Atomica              │    │
│  │  - Verify user has locked ETH in contract:             │    │
│  │    * Contract storage Merkle proof                     │    │
│  │    * Verified against Ethereum state root              │    │
│  │    * ZK proof of Ethereum consensus (Sphinx/BN254)     │    │
│  └────────────────────────────────────────────────────────┘    │
│                            ↓                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Step 4: Gas Sponsorship (AIP-39)                      │    │
│  │  - Fee payer signs as sponsor                          │    │
│  │  - User pays no Atomica gas                            │    │
│  │  - Sequence number from user account                   │    │
│  │  - Gas deducted from sponsor account                   │    │
│  └────────────────────────────────────────────────────────┘    │
│                            ↓                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Step 5: Execute Transaction on Atomica                │    │
│  │  - BCS-decode transaction payload                      │    │
│  │  - Execute Move entry function                         │    │
│  │  - Update Atomica state                                │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                                    ↓
┌─────────────────────────────────────────────────────────────────┐
│              Ethereum Light Client on Atomica                    │
│  ┌────────────────────────────────────────────────────────┐    │
│  │  Maintained by:                                         │    │
│  │  - Argument Computer's Sphinx ZK Prover                │    │
│  │  - BN254 Plonk proofs (recursive from STARK)           │    │
│  │  - Verifies Ethereum Deneb sync protocol               │    │
│  │  - Updates Ethereum state root on Atomica              │    │
│  │  - ~11m40s proving latency (worst case)                │    │
│  └────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

## Core Technical Components

### 1. Ethereum Signature Verification (AIP-49)

**Status**: ✅ Native support in Aptos since AIP-49

**Implementation**: Use `aptos_std::secp256k1` module for ECDSA verification

```move
module atomica::ethereum_auth {
    use std::vector;
    use aptos_std::secp256k1;

    /// Verify Ethereum signature and recover address
    public fun verify_ethereum_signature(
        message_hash: vector<u8>,     // 32-byte keccak256 hash
        signature: vector<u8>,         // 65 bytes (r, s, v)
        expected_address: address
    ): bool {
        // Extract recovery_id from v
        // If v == 27, recovery_id = 0
        // If v == 28, recovery_id = 1
        // If v == 37, recovery_id = 0 (EIP-155)
        // If v == 38, recovery_id = 1 (EIP-155)
        let v = *vector::borrow(&signature, 64);
        let recovery_id = if (v == 27 || v == 37) { 0u8 } else { 1u8 };

        // Extract r and s (64 bytes)
        let signature_bytes = vector::slice(&signature, 0, 64);

        // Recover public key (64 bytes uncompressed)
        let public_key_option = secp256k1::ecdsa_recover(
            message_hash,
            recovery_id,
            &signature_bytes
        );

        // Verify recovery succeeded
        if (option::is_none(&public_key_option)) {
            return false
        };

        let public_key = option::destroy_some(public_key_option);

        // Compute Ethereum address: keccak256(public_key)[12:32]
        let eth_address = ethereum_address_from_pubkey(public_key);

        eth_address == expected_address
    }

    /// Compute Ethereum address from secp256k1 public key
    fun ethereum_address_from_pubkey(pubkey: vector<u8>): address {
        use aptos_std::aptos_hash::keccak256;

        // Hash the 64-byte public key
        let hash = keccak256(pubkey);

        // Take last 20 bytes as Ethereum address
        let addr_bytes = vector::slice(&hash, 12, 32);

        address::from_bytes(addr_bytes)
    }
}
```

**Key Features**:
- Native `secp256k1::ecdsa_recover()` function
- Ethereum-compatible recovery_id conversion (v → recovery_id)
- keccak256 hashing via `aptos_hash::keccak256()`
- Direct interoperability with MetaMask signatures

**Gas Cost**: ~5,000-10,000 gas on Aptos (very efficient)

### 2. Derivable Account Abstraction (AIP-113)

**Status**: ✅ Passed governance November 1, 2025 (Proposal 159)

**Concept**: Derive deterministic Atomica addresses from Ethereum public keys without pre-deployment

**Address Derivation Formula**:
```
account_identity = hash(ethereum_pubkey || dapp_domain)
daa_address = hash(authentication_function_id || account_identity)
```

**Implementation**:

```move
module atomica::ethereum_daa {
    use std::string::{String};
    use aptos_framework::account;
    use aptos_framework::account_abstraction;

    /// Authentication function for Ethereum signatures
    public fun authenticate_ethereum(
        account: signer,
        auth_data: account_abstraction::AbstractionAuthData
    ): signer {
        // Extract authentication data
        let digest = auth_data.digest();
        let authenticator = auth_data.authenticator();

        // Parse authenticator: [signature(65 bytes), eth_address(20 bytes)]
        let signature = vector::slice(authenticator, 0, 65);
        let eth_address = vector::slice(authenticator, 65, 85);

        // Verify signature
        assert!(
            ethereum_auth::verify_ethereum_signature(digest, signature, eth_address),
            E_INVALID_SIGNATURE
        );

        account
    }

    /// Derive Atomica address from Ethereum public key
    public fun derive_atomica_address(
        ethereum_pubkey: vector<u8>,
        dapp_domain: String
    ): address {
        // Compute account identity
        let account_identity = hash::sha3_256(
            ethereum_pubkey || string::bytes(&dapp_domain)
        );

        // Get authentication function ID
        let auth_function = module_id(@atomica, b"ethereum_daa", b"authenticate_ethereum");

        // Compute DAA address
        account_abstraction::derive_address(auth_function, account_identity)
    }

    /// Create account on first transaction (automatic)
    public entry fun ensure_account_exists(
        ethereum_pubkey: vector<u8>,
        dapp_domain: String
    ) {
        let daa_address = derive_atomica_address(ethereum_pubkey, dapp_domain);

        if (!account::exists_at(daa_address)) {
            // Create abstracted account with Ethereum authentication
            account_abstraction::create_account(
                daa_address,
                module_id(@atomica, b"ethereum_daa", b"authenticate_ethereum"),
                hash::sha3_256(ethereum_pubkey || string::bytes(&dapp_domain))
            );
        }
    }
}
```

**Key Features**:
- **Deterministic**: Same Ethereum key + domain → same Atomica address
- **Domain-scoped**: Different dApp domains produce different addresses (privacy)
- **No pre-deployment**: Account created automatically on first transaction
- **Standard interface**: Compatible with Aptos account abstraction

**Account Creation Flow**:
1. User signs message with MetaMask
2. Frontend derives Atomica address client-side
3. First transaction creates account automatically
4. Subsequent transactions use existing account

### 3. Ethereum State Verification (ZK Light Client)

**Status**: ✅ Production-ready via Argument Computer

**Technology**: Sphinx (SP1 fork) + BN254 Plonk proofs

**Architecture**:

```move
module atomica::ethereum_light_client {
    use std::option::{Option};

    /// Ethereum state root checkpoint
    struct EthereumStateRoot has key {
        block_number: u64,
        state_root: vector<u8>,  // 32 bytes
        timestamp: u64,
        verified_at: u64
    }

    /// Verify ZK proof of Ethereum state transition
    public entry fun update_ethereum_state_root(
        admin: &signer,
        new_block_number: u64,
        new_state_root: vector<u8>,
        zk_proof: vector<u8>  // BN254 Plonk proof
    ) acquires EthereumStateRoot {
        // Verify ZK proof using Aptos BN254 precompiles
        assert!(
            verify_plonk_proof(zk_proof, new_state_root),
            E_INVALID_ZK_PROOF
        );

        // Update stored state root
        let state_root = borrow_global_mut<EthereumStateRoot>(@atomica);
        state_root.block_number = new_block_number;
        state_root.state_root = new_state_root;
        state_root.timestamp = timestamp::now_seconds();
    }

    /// Verify user has locked ETH in Ethereum contract
    public fun verify_ethereum_balance(
        user_eth_address: address,
        contract_address: address,
        balance: u256,
        merkle_proof: vector<vector<u8>>
    ): bool acquires EthereumStateRoot {
        let state_root = borrow_global<EthereumStateRoot>(@atomica);

        // Construct storage key: keccak256(user_address || storage_slot)
        let storage_key = compute_ethereum_storage_key(
            contract_address,
            user_eth_address
        );

        // Verify Merkle Patricia Trie proof
        verify_ethereum_storage_proof(
            storage_key,
            balance,
            merkle_proof,
            state_root.state_root
        )
    }

    /// Verify Ethereum Merkle Patricia Trie proof
    fun verify_ethereum_storage_proof(
        storage_key: vector<u8>,
        value: u256,
        proof: vector<vector<u8>>,
        state_root: vector<u8>
    ): bool {
        // Implement MPT verification
        // This is complex but well-documented
        // Can use existing libraries or implement from scratch
        // ...
    }
}
```

**ZK Proof Flow**:
1. **Off-chain Prover** (Argument Sphinx):
   - Monitors Ethereum blocks
   - Proves Deneb sync protocol execution
   - Generates BN254 Plonk proof (~200KB)
   - Proving time: ~11m40s worst-case

2. **On-chain Verifier** (Atomica Move):
   - Verifies Plonk proof using BN254 precompiles
   - Updates trusted Ethereum state root
   - ~250,000 gas cost on Aptos

3. **Storage Proof Verification**:
   - User provides Merkle Patricia Trie proof
   - Proves storage slot value at Ethereum contract
   - Verified against trusted state root
   - ~10,000-20,000 gas cost

**Key Benefits**:
- **Trustless**: Cryptographic proof of Ethereum state
- **No oracles**: No trusted third parties
- **Fast finality**: ~12-15 minutes latency
- **Cost-effective**: One-time proof cost amortized across many users

**Integration with Argument Computer**:
- Use their open-source Sphinx prover
- Deploy their Plonk verifier for Move
- Leverage their maintained infrastructure (optional)

### 4. Gas Sponsorship (AIP-39)

**Status**: ✅ Native support in Aptos since AIP-39

**Concept**: Atomica protocol sponsors gas fees for user transactions

**Implementation**:

```move
module atomica::gas_sponsor {
    use aptos_framework::aptos_account;

    /// Sponsor resource storing gas budget
    struct GasSponsor has key {
        balance: u64,
        daily_limit_per_user: u64,
        user_usage: Table<address, u64>
    }

    /// Submit user transaction with fee payer
    public entry fun submit_sponsored_transaction(
        fee_payer: &signer,
        user_eth_address: address,
        transaction_payload: vector<u8>,
        user_signature: vector<u8>
    ) acquires GasSponsor {
        // 1. Verify Ethereum signature
        verify_ethereum_signature(user_eth_address, transaction_payload, user_signature);

        // 2. Check sponsorship limits
        let sponsor = borrow_global_mut<GasSponsor>(@atomica);
        assert!(
            *table::borrow(&sponsor.user_usage, user_eth_address) < sponsor.daily_limit_per_user,
            E_DAILY_LIMIT_EXCEEDED
        );

        // 3. Execute transaction
        // Fee payer (Atomica protocol) pays gas
        // User account increments sequence number
        execute_user_transaction(user_eth_address, transaction_payload);

        // 4. Track usage
        let usage = table::borrow_mut(&mut sponsor.user_usage, user_eth_address);
        *usage = *usage + 1;
    }
}
```

**Transaction Structure** (BCS-encoded):
```rust
struct FeePayerTransaction {
    raw_transaction: RawTransaction,
    sender_signature: Signature,      // User's Ethereum signature
    fee_payer_address: AccountAddress, // Atomica protocol address
    fee_payer_signature: Signature    // Atomica's signature
}
```

**Signing Flow**:
1. User signs `RawTransaction` with MetaMask (ECDSA)
2. Transaction sent to Atomica sequencer
3. Atomica adds `fee_payer_address` (can be 0x0 pre-signing per AIP-53)
4. Atomica signs as fee payer
5. Transaction submitted to Atomica validators

**Gas Accounting**:
- User sequence number: ✅ Incremented
- User gas payment: ❌ Zero
- Fee payer gas payment: ✅ Deducted from sponsor
- Gas refund: → Fee payer account

**Spam Prevention**:
- Rate limiting per Ethereum address
- Daily transaction limits
- Minimum locked ETH requirement on Ethereum
- Signature freshness (timestamp checks)

### 5. Transaction Format

**Frontend Transaction Construction**:

```typescript
// Frontend (TypeScript with ethers.js)
import { ethers } from 'ethers';
import { AptosClient, BCS } from '@aptos-labs/ts-sdk';

async function createAtomicaTransaction(
  provider: ethers.Provider,
  aptosClient: AptosClient,
  userAddress: string,
  payload: any
) {
  // 1. Get user's Ethereum signer
  const signer = await provider.getSigner();

  // 2. Derive Atomica DAA address
  const ethereumPubkey = await signer.getPublicKey();
  const dappDomain = window.location.hostname;
  const atomicaAddress = deriveAtomicaAddress(ethereumPubkey, dappDomain);

  // 3. Construct Aptos transaction
  const rawTxn = {
    sender: atomicaAddress,
    sequence_number: await getSequenceNumber(atomicaAddress),
    max_gas_amount: 10000n,
    gas_unit_price: 100n,
    expiration_timestamp_secs: Math.floor(Date.now() / 1000) + 600,
    payload: payload,
    chain_id: 1 // Atomica chain ID
  };

  // 4. Serialize transaction for signing
  const txnHash = hashRawTransaction(rawTxn);

  // 5. Sign with Ethereum wallet (MetaMask)
  // User sees: "Sign transaction for Atomica"
  const signature = await signer.signMessage(txnHash);

  // 6. Send to Atomica sequencer
  const response = await fetch('https://atomica-rpc.example.com/submit', {
    method: 'POST',
    body: JSON.stringify({
      ethereum_address: userAddress,
      ethereum_signature: signature,
      raw_transaction: rawTxn,
      dapp_domain: dappDomain
    })
  });

  return response.json();
}

function deriveAtomicaAddress(pubkey: string, domain: string): string {
  // Implement AIP-113 derivation
  const accountIdentity = keccak256(pubkey + domain);
  const authFunctionId = computeAuthFunctionId('ethereum_daa', 'authenticate_ethereum');
  return sha3_256(authFunctionId + accountIdentity);
}
```

**Backend Transaction Processing**:

```rust
// Atomica Sequencer (Rust)
use aptos_types::transaction::{
    RawTransaction, SignedTransaction, TransactionAuthenticator,
    authenticator::FeePayer
};

async fn process_ethereum_transaction(
    request: EthereumTransactionRequest
) -> Result<Hash, Error> {
    // 1. Verify Ethereum signature
    let eth_address = verify_ethereum_signature(
        &request.ethereum_signature,
        &request.raw_transaction
    )?;

    // 2. Derive and ensure Atomica account exists
    let atomica_address = derive_atomica_address(
        &eth_address,
        &request.dapp_domain
    )?;

    ensure_account_exists(atomica_address).await?;

    // 3. Verify Ethereum state (locked ETH)
    let has_locked_eth = verify_ethereum_balance(
        &eth_address,
        LOCK_CONTRACT_ADDRESS,
        MINIMUM_LOCK_AMOUNT
    ).await?;

    require(has_locked_eth, "Insufficient locked ETH");

    // 4. Check rate limits
    check_rate_limits(&eth_address)?;

    // 5. Create fee payer authenticator
    let fee_payer_signature = sign_as_fee_payer(
        &request.raw_transaction,
        &ATOMICA_FEE_PAYER_KEY
    )?;

    let authenticator = TransactionAuthenticator::FeePayer {
        sender: convert_ethereum_signature(&request.ethereum_signature),
        secondary_signer_addresses: vec![],
        secondary_signers: vec![],
        fee_payer_address: ATOMICA_FEE_PAYER_ADDRESS,
        fee_payer_signer: fee_payer_signature
    };

    // 6. Create signed transaction
    let signed_txn = SignedTransaction::new(
        request.raw_transaction,
        authenticator
    );

    // 7. Submit to Aptos validators
    aptos_client.submit_transaction(signed_txn).await
}
```

## Implementation Roadmap

### Phase 1: Core Infrastructure (MVP)

**Week 1-2: Ethereum Signature Verification**
- [ ] Implement `ethereum_auth.move` module
- [ ] Test secp256k1::ecdsa_recover with MetaMask signatures
- [ ] Handle recovery_id conversion (v → recovery_id)
- [ ] Compute Ethereum addresses from public keys
- [ ] Unit tests with real MetaMask test vectors

**Week 3-4: Account Derivation (AIP-113)**
- [ ] Implement `ethereum_daa.move` module
- [ ] Create authentication function for Ethereum signatures
- [ ] Implement address derivation logic
- [ ] Automatic account creation on first transaction
- [ ] Frontend SDK for address derivation
- [ ] Test with multiple Ethereum addresses

**Week 5-6: Gas Sponsorship (AIP-39)**
- [ ] Implement `gas_sponsor.move` module
- [ ] Set up fee payer infrastructure
- [ ] Rate limiting and spam prevention
- [ ] Transaction submission endpoint
- [ ] Gas budget monitoring and alerts
- [ ] Simulate various attack scenarios

### Phase 2: Ethereum State Verification

**Week 7-10: ZK Light Client Integration**
- [ ] Deploy Argument Computer's Sphinx prover infrastructure
- [ ] Implement Plonk verifier in Move (use Argument's template)
- [ ] Set up automated proof generation pipeline
- [ ] Implement state root update mechanism
- [ ] Test with Ethereum mainnet data
- [ ] Monitoring and alerting for proof failures

**Week 11-12: Storage Proof Verification**
- [ ] Implement Merkle Patricia Trie verifier in Move
- [ ] Create locked ETH verification contract
- [ ] Frontend library for generating storage proofs
- [ ] Integration with Ethereum lock contract
- [ ] End-to-end testing with real Ethereum state

### Phase 3: Production Hardening

**Week 13-14: Security**
- [ ] Professional security audit of Move contracts
- [ ] Penetration testing of sequencer
- [ ] Rate limiting stress tests
- [ ] Economic attack simulations
- [ ] Bug bounty program launch

**Week 15-16: UX & Monitoring**
- [ ] Frontend SDK with MetaMask integration
- [ ] Transaction status tracking
- [ ] Gas sponsorship dashboard
- [ ] Prometheus metrics for all components
- [ ] Alerting for anomalies

**Week 17-18: Testnet Launch**
- [ ] Deploy to Atomica testnet
- [ ] Public testing period
- [ ] Documentation and guides
- [ ] Developer workshops

### Phase 4: Mainnet (Week 19-20)

- [ ] Gradual rollout with limits
- [ ] 24/7 monitoring
- [ ] Incident response procedures

## Cost Analysis

### Per-Transaction Costs (Atomica Gas)

| Component | Gas Cost | Notes |
|-----------|----------|-------|
| **Signature Verification** | ~5,000-10,000 | Native secp256k1 |
| **Account Creation** (first tx) | ~20,000-30,000 | One-time per user |
| **State Verification** | ~10,000-20,000 | MPT proof check |
| **Transaction Execution** | Variable | Depends on payload |
| **Total (typical)** | ~50,000-100,000 | ~$0.01-0.05 @ typical prices |

### Infrastructure Costs

| Component | Cost | Frequency |
|-----------|------|-----------|
| **ZK Proof Generation** | ~$1-5 | Per Ethereum block (~12s) |
| **Proof Verification** | ~250,000 gas (~$0.05) | Per proof submission |
| **Sequencer Operation** | ~$500-1000/mo | Hosting + monitoring |
| **Total Monthly** | ~$5,000-10,000 | For 1M txns/month |

### Break-Even Analysis

**Assumptions**:
- 1M transactions/month
- $0.02 average gas sponsorship per transaction
- $10,000 infrastructure costs

**Total Cost**: $30,000/month

**Revenue Options**:
1. Locked ETH generates yield (e.g., Lido stETH): 3-5% APR
   - $10M locked ETH → $300K-500K annual yield → $25K-42K monthly
2. Transaction fees on Atomica (subsidized): $0.005/txn
   - 1M txns × $0.005 = $5,000/month
3. Premium features or subscriptions

## Security Considerations

### Attack Vectors & Mitigations

**1. Signature Replay Attacks**
- **Risk**: Reuse of valid Ethereum signatures
- **Mitigation**:
  - Include nonce (Atomica sequence number) in signed message
  - Include expiration timestamp (max 10 minutes)
  - Track used signatures in Move storage

**2. Sybil Attacks (Gas Abuse)**
- **Risk**: Create many Ethereum addresses to drain gas sponsor
- **Mitigation**:
  - Require minimum locked ETH (~$10-50 worth)
  - Rate limit per Ethereum address (e.g., 10 txns/day)
  - Global rate limiting on sequencer
  - Increasing costs for burst transactions

**3. ZK Proof Manipulation**
- **Risk**: Submit invalid Ethereum state roots
- **Mitigation**:
  - Only accept proofs from trusted prover (initially)
  - Transition to permissionless proving with slashing
  - Multiple independent provers for redundancy
  - Challenge period for state root updates

**4. MEV / Front-running**
- **Risk**: Sequencer can reorder transactions
- **Mitigation**:
  - Commit-reveal schemes for sensitive operations
  - Fair sequencing protocols (e.g., Chainlink FSS)
  - Encrypted mempool (threshold encryption)
  - Transparent sequencer behavior

**5. Account Derivation Collisions**
- **Risk**: Two users derive same Atomica address
- **Mitigation**:
  - Use domain-scoped derivation (per-dApp addresses)
  - Include chain_id in derivation
  - Cryptographic hash collision resistance (SHA3-256)

**6. Lock Contract Exploits (Ethereum)**
- **Risk**: Fake balance in Ethereum lock contract
- **Mitigation**:
  - Audited, immutable lock contract
  - Verify contract bytecode in storage proofs
  - Multi-signature admin controls
  - Time-locked withdrawals

## Future Enhancements

### Phase 2+ Features

**1. Multi-Chain Support**
- Extend to other EVM chains (Polygon, Arbitrum, etc.)
- Non-EVM chains with ECDSA support (Solana, Cosmos)
- Unified balance across all chains

**2. Advanced Account Abstraction**
- Session keys (pre-approved operations)
- Social recovery (multi-sig with email/SMS)
- Spending limits per dApp
- Transaction batching (multicall)

**3. Cross-Chain Asset Bridging**
- Lock ETH on Ethereum, mint wrapped ETH on Atomica
- Trustless 2-way bridge using same ZK light client
- Support ERC-20 tokens
- NFT bridging

**4. Privacy Features**
- ZK proofs of balance (hide exact amount)
- Private transactions on Atomica
- Confidential locked amounts

**5. Decentralization**
- Permissionless ZK provers with slashing
- Distributed sequencer (Narwhal-Bullshark, Espresso)
- Governance for fee payer budget
- Community-run infrastructure

## Alternative Approaches Considered

### Option A: Require Ethereum Transaction Submission
**Pros**: Simple, secure
**Cons**: Expensive ($5-50 gas per txn), slow (12s blocks), poor UX
**Verdict**: ❌ Rejected (fails "no Ethereum gas" requirement)

### Option B: Trusted Oracle for Ethereum State
**Pros**: Fast, cheap
**Cons**: Centralized, trust assumptions, oracle attacks
**Verdict**: ❌ Rejected (not trustless)

### Option C: Optimistic Rollup Pattern
**Pros**: Lower costs than ZK
**Cons**: 7-day challenge periods, still requires fraud proofs
**Verdict**: ⚠️ Possible future optimization (hybrid approach)

### Option D: Require Atomica Native Keys
**Pros**: Simplest implementation
**Cons**: Poor UX, users must manage new keys, fails product goal
**Verdict**: ❌ Rejected (must use MetaMask)

## Selected Approach: Hybrid ZK + AA

**Pros**:
- ✅ Users sign with MetaMask (ECDSA)
- ✅ No Ethereum gas costs
- ✅ No pre-existing Atomica accounts needed
- ✅ Trustless Ethereum state verification (ZK)
- ✅ Native gas sponsorship (AIP-39)
- ✅ Deterministic address derivation (AIP-113)
- ✅ All required Aptos features are LIVE

**Cons**:
- Requires ZK prover infrastructure (~$5-10K/month)
- 12-15 minute latency for Ethereum state (~acceptable)
- Complex implementation (estimated 4-5 months)

**Verdict**: ✅ **RECOMMENDED** - Meets all requirements with production-ready technology

## Conclusion

This architecture is **technically feasible today** using production-ready Aptos features:

1. **AIP-49** (secp256k1 ECDSA): ✅ Live
2. **AIP-113** (Derivable AA): ✅ Passed Nov 1, 2025
3. **AIP-39** (Fee Payer): ✅ Live since 1.8
4. **Argument Computer ZK Light Client**: ✅ Open-source & production

The key innovation is combining these features to create a seamless Ethereum → Atomica bridge where:
- Users never leave MetaMask
- No Ethereum gas costs
- Trustless state verification
- Automatic account creation

**Next Steps**: Begin Phase 1 implementation with Ethereum signature verification and account derivation modules.
