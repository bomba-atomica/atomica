# Timelock Encryption for Sealed-Bid Blockchain Auctions

**⚠️ Important Update (2025-11-13)**

**The ZK proof requirements in this document have been REMOVED from the design.**

We have simplified the approach:
- ✅ **Kept:** drand timelock encryption (IBE) for sealed bids
- ❌ **Removed:** ZK proofs of bid validity (balance, solvency)
- ✅ **Added:** Post-decryption validation with economic deposits

**See:** [Bid Validity Simplification Decision](../decisions/bid-validity-simplification.md) for full rationale.

**Document status:** Sections describing ZK proofs are retained for historical reference but marked as deprecated. The core timelock encryption mechanism remains unchanged.

---

## Overview

This document describes a practical approach to implementing sealed-bid auctions on a blockchain using time-based decryption. The solution ensures bid prices remain secret until the auction ends, while avoiding the griefing vulnerabilities of traditional commit-reveal schemes.

### Problem Statement

We need a blockchain auction system with the following properties:
- **Bid privacy**: Prices must be secret until the auction concludes
- **Temporary secrecy**: Bids don't need to remain encrypted forever
- **One-shot bidding**: No reveal phase that attackers can sabotage
- **Non-interactive**: Decryption happens automatically based on time
- **Minimal trust**: No single party should hold decryption keys

Traditional commit-reveal schemes fail because users can grief the auction by committing but not revealing their bids, potentially invalidating the entire auction.

## Requirements

### Functional Requirements

1. **Sealed Bidding**: Bid amounts must be cryptographically hidden during the auction period
2. **Automatic Decryption**: Bids become readable after a predetermined time without user interaction
3. **Non-Revocable**: Once submitted, encrypted bids cannot be withdrawn or modified
4. **Grief-Resistant**: No single participant can prevent the auction from concluding
5. **Verifiable**: All participants can verify that decryption happens at the correct time

### Non-Functional Requirements

1. **Practical Performance**: Encryption/decryption should be fast enough for real-world use
2. **Minimal Trust Assumptions**: Avoid single points of failure or centralized key holders
3. **Reasonable Complexity**: Should be implementable without exotic cryptographic schemes
4. **Short-Term Privacy**: Security guarantees need only hold for auction duration (hours/days)

### Explicit Non-Requirements

- Long-term privacy (decades)
- Quantum resistance (5-10 year horizon acceptable)
- Zero trust (distributed trust among multiple parties acceptable)
- Privacy after auction ends (bid prices become public knowledge)

## Zero-Knowledge Proof Requirements **[DEPRECATED - REMOVED FROM DESIGN]**

**⚠️ This section has been superseded. ZK proofs for bid validity are NO LONGER required.**
**See:** [Bid Validity Simplification Decision](../decisions/bid-validity-simplification.md)

**Original approach (deprecated):**
To prevent invalid bids and ensure capital efficiency, each bid submission must include a **zero-knowledge proof** that guarantees validity without revealing sensitive information.

### Implementation Architecture

The ZKP system is split into two components:

1. **Client-Side Proof Generator** (Rust CLI/Library)
   - Generates ZK proofs off-chain
   - Contains full circuit implementation + proving key (~50MB)
   - Heavy cryptographic operations (100-500ms per proof)
   - Produces encrypted bid + proof (~192 bytes for Groth16)

2. **Blockchain Native Verifier** (MoveVM Native Function)
   - Verifies proofs on-chain
   - Contains only verification key (~1KB)
   - Lightweight verification (1-2ms, ~150K gas)
   - Called from Move smart contracts

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT SIDE (Rust)                        │
│                                                               │
│  Client generates:                                           │
│  - Encrypted Move Bid object (ciphertext of serialized      │
│    struct produced by circuit)                               │
│  - ZK Proof (~192 bytes)                                     │
│  - Public inputs                                             │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ Submit to blockchain
                        ↓
┌─────────────────────────────────────────────────────────────┐
│              BLOCKCHAIN (MoveVM Native Function)             │
│                                                               │
│  1. Verify ZK proof: native fun verify_bid_proof(...): bool │
│     - Verifies proof in 1-2ms                                │
│     - Returns true if all constraints satisfied              │
│                                                               │
│  2. Store encrypted Bid object on-chain                      │
│                                                               │
│  3. After auction ends (tlock secret revealed):              │
│     - Decrypt ciphertext → serialized bytes                  │
│     - Deserialize bytes → Move Bid struct                    │
│     - Store Bid in user's account resource                   │
│     - Execute bid logic with instantiated object             │
└─────────────────────────────────────────────────────────────┘
```

**Critical Design Point**: The ZK circuit produces an encrypted **serialized Move object**. The circuit takes the plaintext Bid struct fields as private inputs, serializes to BCS format, performs ZK-friendly encryption (Poseidon-based), and outputs the ciphertext. This ensures:
1. The ciphertext is cryptographically bound to the proof
2. The encrypted data is a valid Move object that can be deserialized on-chain
3. After decryption, the Move contract can instantiate the Bid struct and execute bid logic
4. The bidder cannot manipulate the encrypted object without invalidating the proof

### Problem Statement

Without ZKP verification, attackers can:
1. **Submit invalid ciphertexts** that cannot be decrypted, wasting gas and potentially invalidating auctions
2. **Bid more than their balance**, creating fake competition and griefing legitimate bidders
3. **Submit malformed data** that causes decryption to fail during finalization

### ZKP Guarantees for Each Bid

Each bid submission must include a zero-knowledge proof with the following structure:

#### Private Inputs (Witness)

1. **Bid object fields** - Complete Move struct to be encrypted:
   - Bid amount `b` - The actual bid price (secret)
   - Bidder address
   - Any additional bid metadata
2. **User balance** `B` - Proven via Merkle proof from Aptos ledger state
3. **Balance Merkle proof** - Path proving account balance in state tree
4. **Encryption randomness** `r` - Randomness used in bid encryption (for ZK-friendly schemes)

#### Public Inputs

1. **Encrypted bid object** `c` - Ciphertext of serialized Move `Bid` struct submitted on-chain
2. **Drand-derived encryption key** - `key = H(R_n || auctionId)` where `R_n` is the target drand round
3. **Ledger Merkle root** - Root hash of the account state at a specific version
4. **Auction metadata** - `auctionId`, coin type
5. **Commitment to bid object** - Hash commitment for verification after decryption

#### Proof Assertions

The zero-knowledge proof must assert:

**1. Balance Verification**
```
The Merkle proof correctly proves that the user has balance B
in the ledger at version v with root hash R.

MerkleVerify(R, account_path, B) = true
```

**2. Bid Solvency**
```
The bid does not exceed the available balance:

b ≤ B
```

**3. Encrypted Bid Object Correctness**
```
The circuit produces the ciphertext c by encrypting a serialized
Move Bid struct using ZK-friendly encryption:

bid_object = Bid { amount: b, bidder: addr, ... }
serialized = bcs::serialize(bid_object)
c = Enc_key(serialized, r)

where:
- bid_object is the complete Move struct with private fields
- serialized is the BCS-encoded byte representation
- r is the private randomness input
- c is the public output (encrypted serialized object)
- Enc is a ZK-friendly encryption function (Poseidon-based)

The circuit computes the encryption and outputs c as a public value,
cryptographically binding the ciphertext to the proof.

After decryption on-chain, the Move contract can:
1. Decrypt c with the revealed tlock secret
2. Deserialize to recover the Bid struct
3. Store the Bid object in user's account state
4. Execute bid logic using the instantiated object
```

**4. Range Validity**
```
The bid amount is within valid range:

min_bid ≤ b ≤ max_bid

(Prevents overflow attacks and ensures reasonable bid amounts)
```

### ZK-Friendly Encryption Requirement

**Critical Constraint**: Standard AES-based encryption (used in tlock) **cannot be efficiently proven in zero-knowledge circuits**.

**Required Approach**: Use **ZK-friendly encryption** schemes:

#### Option 1: Hash-Based Encryption with Poseidon

```
Encrypt(bid_object, key):
    // Serialize Move struct to bytes
    serialized = bcs::serialize(bid_object)

    // Convert bytes to field elements (chunking if needed)
    message_fields = bytes_to_fields(serialized)

    // Encrypt each field element
    r ← random scalar
    ciphertext = []
    for each m in message_fields:
        k = Poseidon(key || r || index)
        c = m + k  (mod p)
        ciphertext.append(c)

    return (r, ciphertext)

Decrypt(ciphertext, key):
    (r, c_array) = ciphertext
    message_fields = []
    for each (c, index) in c_array:
        k = Poseidon(key || r || index)
        m = c - k  (mod p)
        message_fields.append(m)

    // Convert field elements back to bytes
    serialized_bytes = fields_to_bytes(message_fields)

    // Deserialize to Move struct
    bid_object = bcs::deserialize(serialized_bytes)
    return bid_object
```

**Advantages**:
- Very efficient in ZK circuits (10-100x faster than AES)
- Poseidon designed specifically for ZK-SNARKs
- Can prove encryption correctness with ~1000 constraints
- Works with arbitrary byte arrays (serialized Move objects)
- On-chain decryption produces valid Move struct

#### Option 2: MiMC-Based Encryption

Similar to Poseidon but uses MiMC hash function (also ZK-friendly).

#### Option 3: Pedersen Commitment + Hash Encryption

```
Commit: C = Commit(b, r) = b·G + r·H
Encrypt: c = (C, E) where E = b + Poseidon(key || nonce)
```

### Hybrid Approach: Two-Layer Encryption

To maintain compatibility with drand timelock while adding ZK proofs:

**Layer 1 (ZK-Friendly)**: Poseidon-based encryption of serialized Move object, proven in ZK
```
bid_object = Bid { amount: b, bidder: addr, ... }
serialized = bcs::serialize(bid_object)
c_inner = PoseidonEncrypt(serialized, H(drand_round || auctionId), r)
```

**Layer 2 (Timelock)**: Optional standard tlock encryption for additional privacy
```
c_outer = tlock.encrypt(c_inner, drand_round)
```

**Verification Flow**:
1. User submits `c_inner` (or `c_outer` if using double encryption) + ZK proof
2. Chain verifies ZK proof before accepting bid
3. After auction ends and drand secret revealed:
   - If double-encrypted: decrypt `c_outer` with drand → get `c_inner`
   - Decrypt `c_inner` with Poseidon using drand-derived key
   - Get `serialized` bytes
4. Deserialize to Move `Bid` struct: `bid = bcs::deserialize(serialized)`
5. Store `Bid` in user's account resource
6. Execute bid logic using the instantiated object

### One-Shot Settlement Property

The ZKP ensures that once the drand randomness `R_n` is revealed:
- All ciphertexts can be decrypted trustlessly to valid Move objects
- All bids are guaranteed to be valid (proven at submission time)
- No additional trust or reveal phase needed
- Capital efficiency is guaranteed (all bids are solvent)
- Decrypted Move objects can be directly instantiated and stored in account state
- Bid execution happens seamlessly using the recovered struct

### Privacy Guarantees

The zero-knowledge proof reveals:
- ✅ That the bid is valid and solvent
- ✅ That the ciphertext is correctly formed
- ❌ **Does NOT reveal**: The bid amount `b`
- ❌ **Does NOT reveal**: The user's balance `B`
- ❌ **Does NOT reveal**: Which balance is theirs (privacy via Merkle proof)

### Proof System Considerations

**Recommended**: Groth16 or Plonk for production

**Groth16**:
- Fastest verification (~1-2ms)
- Smallest proofs (~192 bytes)
- Requires trusted setup per circuit
- Well-supported in Move/Aptos ecosystem

**Plonk/Plonky2**:
- Universal trusted setup (one-time)
- Larger proofs (~400-800 bytes)
- Slightly slower verification (~5-10ms)
- More flexible (easier to update circuit)

**Circuit Complexity Estimate**:
- Merkle proof verification: ~300 constraints per level
- Balance comparison: ~250 constraints
- Poseidon encryption: ~1000 constraints
- Range checks: ~256 constraints per check
- **Total**: ~3000-5000 constraints (very practical)

### Gas Cost Impact

**Without ZKP**:
- Bid submission: ~50,000 gas
- Risk of invalid bids causing grief

**With ZKP**:
- Bid submission: ~150,000 gas (includes proof verification)
- Guaranteed valid bids
- No wasted gas on invalid decryptions
- **Net benefit**: More expensive per bid, but eliminates grief attacks

### Implementation Details

#### Client-Side Proof Generator

**Project Structure**:
```
bid-prover/
├── Cargo.toml
├── src/
│   ├── circuit.rs           # ZK circuit definition
│   ├── encryption.rs        # Poseidon encryption
│   ├── merkle.rs           # Merkle proof handling
│   ├── prover.rs           # Proof generation
│   └── main.rs             # CLI interface
├── keys/
│   ├── proving.key         # Proving key (~50MB)
│   └── verifying.key       # Verification key (~1KB)
└── README.md
```

**Dependencies** (client-side):
```toml
[dependencies]
ark-groth16 = "0.4"                    # Full prover
ark-bls12-381 = "0.4"                  # Pairing curve
ark-r1cs-std = "0.4"                   # Circuit gadgets
ark-crypto-primitives = "0.4"          # Merkle, Poseidon
ark-relations = "0.4"                  # Constraint systems
poseidon-ark = "0.1"                   # Poseidon hash
clap = "4.0"                           # CLI
serde = "1.0"                          # Serialization
```

**Key Operations**:
1. **Witness Generation**: Construct circuit with private inputs (bid, balance, Merkle proof)
2. **Encryption**: Circuit computes Poseidon encryption internally
3. **Proof Generation**: Generate Groth16 proof using proving key (100-500ms)
4. **Serialization**: Output proof (~192 bytes) + public inputs

**CLI Usage Example**:
```bash
bid-prover generate \
  --bid-amount 1000 \
  --balance 5000 \
  --merkle-proof proof.json \
  --auction-id 42 \
  --output bid.json
```

**Output Format**:
```json
{
  "encrypted_bid": "0x1234...",
  "proof": "0xabcd...",
  "public_inputs": {
    "merkle_root": "0x5678...",
    "auction_id": 42,
    "ciphertext": "0x1234..."
  }
}
```

#### Blockchain Native Verifier

**Location**: `/aptos-move/framework/aptos-natives/src/cryptography/bid_proof.rs`

**Dependencies** (on-chain):
```toml
[dependencies]
# Use verify-only feature for minimal size
ark-groth16 = { version = "0.4", default-features = false, features = ["verify-only"] }
ark-bls12-381 = { version = "0.4", default-features = false }
ark-serialize = "0.4"
```

**Native Function Signature**:
```rust
#[native_function]
pub fn verify_bid_proof(
    encrypted_bid: Vec<u8>,
    proof_bytes: Vec<u8>,
    public_inputs_bytes: Vec<u8>,
) -> Result<bool, NativeError>
```

**Move Declaration**:
```move
module auction {
    native public fun verify_bid_proof(
        encrypted_bid: vector<u8>,
        proof: vector<u8>,
        public_inputs: vector<u8>
    ): bool;
}
```

**Verification Flow**:
1. Deserialize proof (~192 bytes)
2. Deserialize public inputs
3. Verify Groth16 proof with embedded verification key
4. Return true/false

**Performance**:
- Verification time: 1-2ms
- Gas cost: ~150K
- Verification key size: ~1KB (embedded in native function)

#### Circuit Design

The ZK circuit implements the following constraints:

```rust
pub struct BidValidityCircuit {
    // Private inputs (witness)
    bid_object_fields: Option<BidFields>,  // All Move struct fields
    user_balance: Option<u64>,
    merkle_proof: Option<MerkleProof>,
    encryption_randomness: Option<Fr>,

    // Public inputs
    encrypted_bid_object: Vec<u8>,  // Encrypted serialized Move struct
    merkle_root: [u8; 32],
    auction_id: u64,
}

pub struct BidFields {
    amount: u64,
    bidder: Address,
    // ... other Move Bid struct fields
}

impl ConstraintSynthesizer<Fr> for BidValidityCircuit {
    fn generate_constraints(self, cs: ConstraintSystemRef<Fr>) -> Result<(), SynthesisError> {
        let bid_fields = self.bid_object_fields.unwrap();

        // 1. Merkle proof verification (~300 constraints per level)
        verify_merkle_proof(cs, merkle_proof, merkle_root, user_balance)?;

        // 2. Balance comparison (~250 constraints)
        enforce_less_than_or_equal(cs, bid_fields.amount, user_balance)?;

        // 3. Range checks (~256 constraints each)
        enforce_range(cs, bid_fields.amount, min_bid, max_bid)?;

        // 4. BCS serialization of Bid struct in circuit
        //    Serialize the Move object fields to bytes
        let serialized_bid = bcs_serialize_in_circuit(cs, bid_fields)?;

        // 5. Poseidon encryption of serialized bytes (~1000 constraints)
        let computed_ciphertext = poseidon_encrypt_bytes(
            cs,
            serialized_bid,
            encryption_randomness
        )?;

        // 6. Public output constraint - verify computed matches submitted
        enforce_equal(cs, computed_ciphertext, encrypted_bid_object)?;

        Ok(())
    }
}
```

**Critical Properties**:
1. The circuit serializes the Move `Bid` struct to BCS format
2. The circuit encrypts the serialized bytes using Poseidon
3. The `encrypted_bid_object` output is cryptographically bound to the proof
4. Users cannot submit a different ciphertext without invalidating the proof
5. After decryption on-chain, bytes can be deserialized to a valid Move struct
6. The Move contract can instantiate the `Bid` object and execute bid logic

#### Trusted Setup

**Phase 1: Powers of Tau** (universal, one-time)
- Can use existing ceremony (e.g., Zcash Powers of Tau)
- Supports circuits up to a certain size

**Phase 2: Circuit-Specific Setup**
- Generate proving key and verification key
- Proving key stays client-side
- Verification key embedded in blockchain

**Setup Command**:
```bash
bid-prover setup --output keys/
# Generates: proving.key, verifying.key
```

### Implementation Notes

1. **Merkle Proof Source**: Use Aptos ledger state Merkle tree
2. **Balance Snapshot**: Proof references a specific ledger version
3. **Time-Window**: Balance proof valid for N blocks (prevents stale proofs)
4. **Escrow Mechanism**: After proof verification, balance could be locked in escrow
5. **Multi-Asset Support**: Proof circuit parameterized by coin type
6. **Key Distribution**: Verification key embedded in native function, proving key distributed to clients
7. **Circuit Upgrades**: Changing circuit requires new trusted setup and native function update

## Cryptographic Background

### Time-Lock Encryption

Time-lock encryption allows data to be encrypted such that it can only be decrypted after a specific time has elapsed. Two main approaches exist:

#### 1. Time-Lock Puzzles (Computational)

Based on sequential computation that cannot be parallelized:
- Encryptor defines a computation requiring time T
- Decryptor must perform T sequential steps
- Security relies on difficulty of parallelization

**Examples**: RSA time-lock puzzles, Verifiable Delay Functions (VDFs)

**Pros**: Truly trustless
**Cons**: Computationally expensive, decryption time uncertain

#### 2. Threshold Beacon-Based (External Clock)

Uses a decentralized network as a "reference clock":
- Encrypt to a future time/round number
- Network releases decryption key at that time
- Security relies on honest majority of network participants

**Examples**: drand, threshold cryptography networks

**Pros**: Fast, predictable timing
**Cons**: Small trust assumption in the beacon network

### Identity-Based Encryption (IBE)

IBE allows encryption using an arbitrary string (the "identity") as a public key:
- Public key = H(identity), e.g., H("round_12345")
- Private key = extracted by trusted authority for that identity
- Uses pairing-based cryptography (typically BLS12-381)

**Key Property**: Can encrypt to a future identity before the private key exists.

### Threshold Cryptography

Distributes cryptographic operations across n parties where t < n are needed:
- **Threshold Signatures**: t-of-n parties can produce a valid signature
- **Secret Sharing**: Secret split so any t shares can reconstruct it
- **Distributed Key Generation (DKG)**: Collectively generate keys without trusted dealer

**For auctions**: Validators collectively hold decryption capability, no single party can decrypt early.

## Solution Approaches Considered

### Option 1: Verifiable Delay Functions (VDFs)

**Mechanism**: Sequential computation time-lock puzzles

```
Encrypt(bid, T) → ciphertext requiring T sequential steps to decrypt
Decrypt(ciphertext) → performs T computations → bid
```

**Advantages**:
- ✅ Truly trustless
- ✅ No external dependencies
- ✅ Cryptographically sound

**Disadvantages**:
- ❌ Computationally expensive for decryptor
- ❌ Timing uncertainty (depends on hardware)
- ❌ Multiple bids = multiple expensive computations
- ❌ Still research-stage for many applications

**Verdict**: Too impractical for auctions with many bids.

### Option 2: Witness Encryption

**Mechanism**: Encrypt to a statement that becomes true (e.g., "block height > 1000")

**Advantages**:
- ✅ Theoretically elegant
- ✅ No reveal phase needed

**Disadvantages**:
- ❌ Mostly theoretical, no production implementations
- ❌ Very new cryptographic primitive
- ❌ Security proofs still being developed

**Verdict**: Not ready for production use.

### Option 3: drand + Timelock Encryption ⭐

**Mechanism**: Use drand's decentralized randomness beacon as reference clock

```
Encrypt(bid, drand_round_N) → ciphertext
// After round N is published
Decrypt(ciphertext, drand_round_N_signature) → bid
```

**Advantages**:
- ✅ Production-ready (used by Filecoin, Protocol Labs)
- ✅ Fast encryption (<6ms)
- ✅ Predictable timing (3-second rounds)
- ✅ No reveal phase needed
- ✅ Multiple implementations (Go, JS, Rust)
- ✅ Decentralized (League of Entropy: 18+ organizations, 22+ nodes)

**Disadvantages**:
- ⚠️ Trust in League of Entropy (distributed, but not zero-trust)
- ⚠️ Liveness dependency (if drand permanently shuts down, future ciphertexts undecryptable)
- ⚠️ Not quantum-resistant (~5-10 year horizon)
- ⚠️ Threshold vulnerability (if attackers control enough nodes)

**Verdict**: Best practical solution for near-term deployment. ✅

## MoveVM Native Functions: Implementation Strategy

### Overview

**Critical architectural capability**: This fork of Aptos supports adding custom **native functions** to the MoveVM runtime. Native functions are implemented in Rust at the VM level and exposed to Move smart contracts, enabling:

- High-performance cryptographic operations
- Access to arbitrary Rust libraries
- Complex computations that would be impractical in pure Move
- Direct integration with external systems

This capability **fundamentally changes the engineering approach** for both Phase 1 and Phase 2, making implementation significantly more practical and performant.

### What Are Native Functions?

Native functions bridge Move smart contracts with Rust implementations:

```rust
// In Rust (native function implementation)
#[native_function]
pub fn ibe_decrypt(
    ciphertext: Vec<u8>,
    decryption_key: Vec<u8>,
) -> Result<Vec<u8>, NativeError> {
    // High-performance Rust IBE implementation
    let plaintext = boneh_franklin_decrypt(&ciphertext, &decryption_key)?;
    Ok(plaintext)
}
```

```move
// In Move smart contract
module auction {
    use std::bcs;

    struct Bid has key, store {
        amount: u64,
        bidder: address,
        timestamp: u64,
    }

    // Declare native function
    native fun ibe_decrypt(ciphertext: vector<u8>, key: vector<u8>): vector<u8>;

    public fun finalize_auction(auction_id: u64) acquires Auction {
        let auction = borrow_global_mut<Auction>(auction_id);
        let decryption_key = get_threshold_signature(auction_id);

        // Get encrypted bid object
        let encrypted_bid = vector::borrow(&auction.encrypted_bids, 0);

        // Decrypt to get serialized bytes
        let serialized_bid = ibe_decrypt(encrypted_bid.ciphertext, decryption_key);

        // Deserialize to Move Bid struct
        let bid: Bid = bcs::from_bytes(&serialized_bid);

        // Store Bid in user's account
        move_to(&bid.bidder, bid);

        // Execute bid logic with the instantiated object
        process_bid(auction, &bid);
    }
}
```

### How Native Functions Are Added

**Process** (for Aptos fork):

1. **Implement in Rust**: Write function in `/aptos-move/framework/aptos-natives/src/`
2. **Register with VM**: Add to native function table in VM runtime
3. **Declare in Move**: Add `native fun` declaration in Move module
4. **Deploy**: Update framework and deploy to chain

**Example File Structure**:
```
aptos-move/framework/aptos-natives/src/
├── cryptography/
│   ├── bls12381.rs       (existing)
│   ├── ibe.rs            (new - Boneh-Franklin IBE)
│   └── timelock.rs       (new - drand verification)
└── lib.rs
```

### Impact on Implementation Strategy

#### Phase 1: drand with Native Functions

**Without native functions**:
- Client encrypts with tlock (off-chain)
- Client decrypts with drand beacon (off-chain)
- Blockchain only stores encrypted bids
- No on-chain verification of decryption

**With native functions**:
```rust
// Add native drand verification
#[native_function]
pub fn verify_drand_beacon(
    round: u64,
    signature: Vec<u8>,
    previous_signature: Vec<u8>,
) -> Result<bool, NativeError> {
    // Verify BLS signature from drand network
    drand_verify(&signature, round, &previous_signature)
}

#[native_function]
pub fn tlock_decrypt(
    ciphertext: Vec<u8>,
    drand_signature: Vec<u8>,
) -> Result<Vec<u8>, NativeError> {
    // Use tlock Rust library directly
    tlock::decrypt(&ciphertext, &drand_signature)
        .map_err(|e| NativeError::Decryption(e))
}
```

**Benefits**:
- ✅ On-chain verification of drand beacons
- ✅ Trustless finalization (anyone can submit, chain verifies)
- ✅ No need for off-chain decryption oracle
- ✅ Immediate verification of winning bid

### Permissionless Decryption Key Submission

A critical design feature is that **anyone** can submit the decryption key to finalize an auction. This provides:

**Decentralization Benefits**:
- No dependency on a specific party to finalize
- Market participants, volunteers, or bots can submit
- First submitter can be rewarded (optional incentive mechanism)
- Auction cannot be "stuck" waiting for a specific actor

**Security Guarantees** (enforced by smart contract):
1. **Time lock**: `timestamp::now_seconds() >= auction.end_time`
2. **Key validity**: `verify_drand_beacon()` validates the drand signature
3. **Decryption validation**: Test decryption on a sample bid to ensure key works
4. **Single submission**: Key can only be submitted once (idempotent)

**Two-Phase Finalization**:
1. **Phase 1 - Key Submission**: Anyone submits valid drand signature
   - Contract validates time, signature, and decryption capability
   - Key stored in auction state
   - Submitter optionally rewarded

2. **Phase 2 - Auction Finalization**: Anyone triggers finalization
   - Uses stored decryption key
   - Decrypts all bids
   - Determines winner
   - Stores Bid objects in user accounts

This separation allows for gas optimization (key submission is cheap, decryption can be batched/delayed).

**Move Contract Example with Permissionless Decryption**:
```move
module auction {
    use std::bcs;
    use aptos_framework::timestamp;

    struct Bid has key, store {
        amount: u64,
        bidder: address,
        timestamp: u64,
    }

    struct Auction has key {
        id: u64,
        end_time: u64,
        target_round: u64,
        encrypted_bids: vector<EncryptedBid>,
        decryption_key: Option<vector<u8>>,  // Stored once submitted
        state: AuctionState,
        winner: Option<address>,
        winning_bid: u64,
    }

    struct EncryptedBid has store {
        ciphertext: vector<u8>,
        bidder: address,
    }

    const AUCTION_ACTIVE: u8 = 0;
    const AUCTION_DECRYPTION_KEY_SUBMITTED: u8 = 1;
    const AUCTION_FINALIZED: u8 = 2;

    const ERROR_AUCTION_NOT_ENDED: u64 = 1;
    const ERROR_INVALID_BEACON: u64 = 2;
    const ERROR_DECRYPTION_FAILED: u64 = 3;
    const ERROR_KEY_ALREADY_SUBMITTED: u64 = 4;
    const ERROR_NO_DECRYPTION_KEY: u64 = 5;

    native fun verify_drand_beacon(round: u64, sig: vector<u8>, prev: vector<u8>): bool;
    native fun tlock_decrypt(ciphertext: vector<u8>, beacon: vector<u8>): vector<u8>;

    /// Permissionless function - anyone can submit the decryption key
    /// Incentivize by rewarding the first submitter
    public entry fun submit_decryption_key(
        submitter: &signer,
        auction_id: u64,
        drand_signature: vector<u8>,
        previous_signature: vector<u8>,
    ) acquires Auction {
        let auction = borrow_global_mut<Auction>(auction_id);

        // 1. Check auction has ended according to chain wall clock
        let current_time = timestamp::now_seconds();
        assert!(current_time >= auction.end_time, ERROR_AUCTION_NOT_ENDED);

        // 2. Check key not already submitted
        assert!(option::is_none(&auction.decryption_key), ERROR_KEY_ALREADY_SUBMITTED);

        // 3. Verify the drand beacon signature is valid
        assert!(
            verify_drand_beacon(auction.target_round, drand_signature, previous_signature),
            ERROR_INVALID_BEACON
        );

        // 4. Test that key can decrypt at least one bid (validation)
        if (vector::length(&auction.encrypted_bids) > 0) {
            let test_bid = vector::borrow(&auction.encrypted_bids, 0);
            // This will abort if decryption fails
            let _ = tlock_decrypt(test_bid.ciphertext, drand_signature);
        };

        // Store the valid decryption key
        auction.decryption_key = option::some(drand_signature);
        auction.state = AUCTION_DECRYPTION_KEY_SUBMITTED;

        // Optional: Reward the submitter
        // reward_key_submitter(submitter, auction_id);

        emit_event(DecryptionKeySubmitted {
            auction_id,
            submitter: signer::address_of(submitter),
            timestamp: current_time,
        });
    }

    /// Finalize auction using the stored decryption key
    /// Can be called by anyone after key is submitted
    public entry fun finalize_auction(
        auction_id: u64,
    ) acquires Auction {
        let auction = borrow_global_mut<Auction>(auction_id);

        // Require decryption key to be submitted first
        assert!(option::is_some(&auction.decryption_key), ERROR_NO_DECRYPTION_KEY);

        let drand_signature = *option::borrow(&auction.decryption_key);

        // Decrypt all bid objects on-chain and store them
        let highest_bid = 0u64;
        let winner = option::none<address>();

        vector::for_each_ref(&auction.encrypted_bids, |encrypted_bid| {
            // Decrypt to get serialized Move Bid struct
            let serialized_bid = tlock_decrypt(encrypted_bid.ciphertext, drand_signature);

            // Deserialize to Move Bid object
            let bid: Bid = bcs::from_bytes(&serialized_bid);

            // Compare bid amounts
            if (bid.amount > highest_bid) {
                highest_bid = bid.amount;
                winner = option::some(bid.bidder);
            }

            // Store Bid object in user's account resource
            move_to(&bid.bidder, bid);
        });

        auction.winner = winner;
        auction.winning_bid = highest_bid;
        auction.state = AUCTION_FINALIZED;
    }
}
```

#### Phase 2: Native IBE with Threshold BLS

**Without native functions**:
- Would need to implement IBE in pure Move
- Pairing operations available but complex to use
- Performance would be poor
- Gas costs would be very high

**With native functions**:
```rust
// Implement complete IBE in Rust
#[native_function]
pub fn ibe_encrypt(
    plaintext: Vec<u8>,
    master_pubkey: Vec<u8>,
    identity: Vec<u8>, // e.g., block_number
) -> Result<Vec<u8>, NativeError> {
    let mpk = MasterPublicKey::from_bytes(&master_pubkey)?;
    let id = hash_to_g1(&identity);

    // Boneh-Franklin encryption
    let ciphertext = boneh_franklin_encrypt(&plaintext, &mpk, &id)?;
    Ok(ciphertext.to_bytes())
}

#[native_function]
pub fn ibe_decrypt(
    ciphertext: Vec<u8>,
    decryption_key: Vec<u8>, // threshold signature
) -> Result<Vec<u8>, NativeError> {
    let ct = Ciphertext::from_bytes(&ciphertext)?;
    let sk = SecretKey::from_bytes(&decryption_key)?;

    // Boneh-Franklin decryption
    let plaintext = boneh_franklin_decrypt(&ct, &sk)?;
    Ok(plaintext)
}

#[native_function]
pub fn ibe_verify_ciphertext(
    ciphertext: Vec<u8>,
) -> Result<bool, NativeError> {
    // Validate ciphertext structure
    Ciphertext::from_bytes(&ciphertext)
        .map(|_| true)
        .or(Ok(false))
}
```

**Benefits**:
- ✅ Full IBE implementation in performant Rust
- ✅ Leverage existing cryptography crates (arkworks, blst, etc.)
- ✅ On-chain encryption verification
- ✅ On-chain decryption with threshold signature
- ✅ Dramatically lower gas costs vs. pure Move
- ✅ Much faster execution

**Move Contract Example with Permissionless Threshold Signature Submission**:
```move
module auction {
    use std::bcs;
    use aptos_framework::timestamp;
    use aptos_framework::block;

    struct Bid has key, store {
        amount: u64,
        bidder: address,
        timestamp: u64,
    }

    struct Auction has key {
        id: u64,
        epoch: u64,
        end_block: u64,
        end_time: u64,
        encrypted_bids: vector<EncryptedBid>,
        threshold_signature: Option<vector<u8>>,  // IBE decryption key
        state: u8,
        winner: Option<address>,
        winning_bid: u64,
    }

    native fun ibe_decrypt(ciphertext: vector<u8>, key: vector<u8>): vector<u8>;
    native fun ibe_verify_ciphertext(ciphertext: vector<u8>): bool;
    native fun verify_threshold_signature(
        epoch: u64,
        block_number: u64,
        signature: vector<u8>
    ): bool;

    public entry fun submit_bid(
        bidder: &signer,
        auction_id: u64,
        encrypted_bid: vector<u8>,
    ) acquires Auction {
        // Verify ciphertext is valid
        assert!(ibe_verify_ciphertext(encrypted_bid), ERROR_INVALID_CIPHERTEXT);

        let auction = borrow_global_mut<Auction>(auction_id);

        // Store encrypted bid object
        vector::push_back(&mut auction.encrypted_bids, EncryptedBid {
            ciphertext: encrypted_bid,
            bidder: signer::address_of(bidder),
        });
    }

    /// Permissionless - anyone can submit the threshold signature
    public entry fun submit_threshold_signature(
        submitter: &signer,
        auction_id: u64,
        threshold_signature: vector<u8>,
    ) acquires Auction {
        let auction = borrow_global_mut<Auction>(auction_id);

        // 1. Check auction has ended (time and block height)
        let current_time = timestamp::now_seconds();
        let current_block = block::get_current_block_height();
        assert!(current_time >= auction.end_time, ERROR_AUCTION_NOT_ENDED);
        assert!(current_block >= auction.end_block, ERROR_BLOCK_NOT_REACHED);

        // 2. Check signature not already submitted
        assert!(option::is_none(&auction.threshold_signature), ERROR_KEY_ALREADY_SUBMITTED);

        // 3. Verify the threshold signature is valid for this epoch/block
        assert!(
            verify_threshold_signature(auction.epoch, auction.end_block, threshold_signature),
            ERROR_INVALID_SIGNATURE
        );

        // 4. Test that signature can decrypt at least one bid
        if (vector::length(&auction.encrypted_bids) > 0) {
            let test_bid = vector::borrow(&auction.encrypted_bids, 0);
            let _ = ibe_decrypt(test_bid.ciphertext, threshold_signature);
        };

        // Store the valid threshold signature (IBE decryption key)
        auction.threshold_signature = option::some(threshold_signature);
        auction.state = AUCTION_SIGNATURE_SUBMITTED;

        // Optional: Reward submitter
        // reward_signature_submitter(submitter, auction_id);

        emit_event(ThresholdSignatureSubmitted {
            auction_id,
            submitter: signer::address_of(submitter),
            epoch: auction.epoch,
        });
    }

    /// Finalize auction using stored threshold signature
    public entry fun finalize_auction(auction_id: u64) acquires Auction {
        let auction = borrow_global_mut<Auction>(auction_id);

        // Require threshold signature to be submitted first
        assert!(option::is_some(&auction.threshold_signature), ERROR_NO_SIGNATURE);

        let decryption_key = *option::borrow(&auction.threshold_signature);

        // Decrypt all bid objects on-chain
        let highest_bid = 0u64;
        let winner = option::none<address>();

        vector::for_each_ref(&auction.encrypted_bids, |encrypted_bid| {
            // Decrypt to get serialized Move Bid struct
            let serialized_bid = ibe_decrypt(encrypted_bid.ciphertext, decryption_key);

            // Deserialize to Move Bid object
            let bid: Bid = bcs::from_bytes(&serialized_bid);

            if (bid.amount > highest_bid) {
                highest_bid = bid.amount;
                winner = option::some(bid.bidder);
            }

            // Store Bid object in user's account
            move_to(&bid.bidder, bid);
        });

        auction.winner = winner;
        auction.winning_bid = highest_bid;
        auction.state = AUCTION_FINALIZED;
    }
}
```

### Performance Comparison

#### Without Native Functions (Pure Move)

**IBE Decryption**:
- Would require: ~10-15 Move instructions per pairing operation
- Gas cost: ~100,000+ gas units per bid
- Execution time: ~500ms+ per bid
- Practical limit: ~10-20 bids per auction

#### With Native Functions (Rust Implementation)

**IBE Decryption**:
- Native call overhead: ~1,000 gas units
- Rust execution: ~5-20ms per bid
- Gas cost: ~5,000-10,000 gas units per bid
- Practical limit: 100s of bids per auction

**Cost Reduction**: ~10-20x lower gas costs, ~25-100x faster execution

### Rust Libraries Available

With native functions, you can leverage the entire Rust cryptography ecosystem:

```toml
[dependencies]
# IBE implementation
ark-bls12-381 = "0.4"
ark-ec = "0.4"
ark-ff = "0.4"
ark-serialize = "0.4"

# BLS signatures
blst = "0.3"
blstrs = "0.7"

# drand integration
tlock = "0.1"
drand-client = "0.2"

# Pairings
pairing = "0.23"

# Symmetric crypto
aes-gcm = "0.10"
chacha20poly1305 = "0.10"
```

### Security Considerations

**Native Function Security**:
- ⚠️ Bugs in native code can crash the VM
- ⚠️ Must be thoroughly tested and audited
- ⚠️ No automatic Move safety guarantees
- ✅ Can leverage battle-tested Rust crypto libraries
- ✅ Easier to audit than complex Move code
- ✅ Can include comprehensive unit tests

**Best Practices**:
1. Use well-audited cryptography crates
2. Extensive unit testing with test vectors
3. Fuzzing for edge cases
4. Independent security review
5. Gradual rollout with monitoring

### Testing Strategy

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ibe_roundtrip() {
        let plaintext = b"1000"; // bid amount
        let master_keypair = generate_master_keypair();
        let identity = b"block_12345";

        // Encrypt
        let ciphertext = ibe_encrypt(
            plaintext.to_vec(),
            master_keypair.public_key.to_bytes(),
            identity.to_vec(),
        ).unwrap();

        // Generate private key for identity
        let secret_key = extract_private_key(
            &master_keypair.secret_key,
            identity,
        );

        // Decrypt
        let decrypted = ibe_decrypt(
            ciphertext,
            secret_key.to_bytes(),
        ).unwrap();

        assert_eq!(plaintext.to_vec(), decrypted);
    }

    #[test]
    fn test_drand_beacon_verification() {
        // Use known drand test vectors
        let round = 1000u64;
        let signature = hex::decode("...").unwrap();
        let previous = hex::decode("...").unwrap();

        assert!(verify_drand_beacon(round, signature, previous).unwrap());
    }

    #[test]
    fn test_invalid_ciphertext_handling() {
        let invalid = vec![0u8; 32]; // Garbage data
        let key = vec![0u8; 48];

        let result = ibe_decrypt(invalid, key);
        assert!(result.is_err());
    }
}
```

### Revised Approach Summary

**Phase 1 with Native Functions**:
1. Implement `tlock_decrypt` and `verify_drand_beacon` as native functions
2. Move contracts call native functions for verification
3. On-chain decryption and finalization
4. No off-chain oracle needed

**Phase 2 with Native Functions**:
1. Implement complete Boneh-Franklin IBE in Rust
2. Expose `ibe_encrypt`, `ibe_decrypt`, `ibe_verify_ciphertext` as native functions
3. Move contracts use native functions for all crypto operations
4. High performance, low gas costs

**Key Advantage**: Both phases benefit from high-performance Rust implementations while maintaining Move's safety for business logic.

## Phase 1: drand Prototype Implementation

> **Note**: With MoveVM native functions support, Phase 1 implements **on-chain decryption and verification** using native Rust functions. This provides trustless finalization without off-chain oracles. The architecture below shows the enhanced approach.

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                      Blockchain Layer                        │
│  ┌────────────┐  ┌────────────┐  ┌─────────────────────┐   │
│  │  Auction   │  │ Encrypted  │  │   Auction State     │   │
│  │ Contract   │→ │   Bids     │→ │  (Active/Ended)     │   │
│  └────────────┘  └────────────┘  └─────────────────────┘   │
└────────────────────────┬──────────────────────────────────────┘
                         │
                         ↓
              ┌─────────────────────┐
              │   drand Network     │
              │  (League of Entropy)│
              │  Round every 3sec   │
              └─────────────────────┘
                         │
                         ↓ After auction ends
              ┌─────────────────────┐
              │  Decryption Key     │
              │  (Public Beacon)    │
              └─────────────────────┘
```

### drand Technical Details

**Network**: Mainnet (production)
- **Endpoint**: `api.drand.sh`
- **Chain Hash**: `52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971`
- **Round Interval**: 3 seconds
- **Scheme**: "unchained" (quicknet) with Identity-Based Encryption
- **Curve**: BLS12-381

**How It Works**:
1. Each round number maps to a specific timestamp
2. Encrypt using future round number as IBE identity
3. drand network publishes BLS signature for each round
4. Signature serves as IBE decryption key for that round
5. Anyone can decrypt once the round is published

### Implementation Steps

#### 1. Client-Side Bid Encryption

```rust
use tlock::{encrypt, decrypt};
use drand_client::DrandClient;

// Create bid encryption
fn create_encrypted_bid(
    bid_price: u64,
    auction_end_time: DateTime,
) -> Result<EncryptedBid, Error> {
    // Calculate drand round for auction end time
    // drand mainnet: round 1 at genesis, 3-second intervals
    let target_round = calculate_drand_round(auction_end_time);

    // Encrypt bid price to future drand round
    let ciphertext = encrypt(
        &bid_price.to_le_bytes(),
        target_round,
        &DRAND_CHAIN_INFO,
    )?;

    Ok(EncryptedBid {
        ciphertext,
        target_round,
        bidder: get_current_address(),
    })
}

fn calculate_drand_round(target_time: DateTime) -> u64 {
    const DRAND_GENESIS_TIMESTAMP: i64 = 1692803367; // mainnet genesis
    const DRAND_PERIOD_SECONDS: i64 = 3;

    let seconds_since_genesis = target_time.timestamp() - DRAND_GENESIS_TIMESTAMP;
    let round = (seconds_since_genesis / DRAND_PERIOD_SECONDS) as u64;

    // Add buffer to ensure round has been published
    round + 1
}
```

#### 2. On-Chain Auction Contract

```rust
// Blockchain state
pub struct Auction {
    pub id: AuctionId,
    pub end_time: Timestamp,
    pub target_drand_round: u64,
    pub bids: Vec<EncryptedBid>,
    pub state: AuctionState,
    pub winner: Option<Address>,
}

pub struct EncryptedBid {
    pub ciphertext: Vec<u8>,      // tlock encrypted price
    pub target_round: u64,         // drand round for decryption
    pub bidder: Address,
    pub commitment: Hash,          // Hash of plaintext for verification
}

pub enum AuctionState {
    Active,
    Ended,
    Finalized,
}

// Submit encrypted bid
pub fn submit_bid(
    auction_id: AuctionId,
    encrypted_bid: EncryptedBid,
) -> Result<(), Error> {
    let auction = get_auction(auction_id)?;

    require!(
        auction.state == AuctionState::Active,
        "Auction not active"
    );

    require!(
        current_time() < auction.end_time,
        "Auction already ended"
    );

    // Verify bid is encrypted to correct round
    require!(
        encrypted_bid.target_round == auction.target_drand_round,
        "Incorrect target round"
    );

    // Store encrypted bid
    auction.bids.push(encrypted_bid);

    Ok(())
}

// End auction (anyone can call after end_time)
pub fn end_auction(auction_id: AuctionId) -> Result<(), Error> {
    let mut auction = get_auction(auction_id)?;

    require!(
        current_time() >= auction.end_time,
        "Auction not yet ended"
    );

    require!(
        auction.state == AuctionState::Active,
        "Auction already ended"
    );

    auction.state = AuctionState::Ended;
    save_auction(auction);

    emit_event(AuctionEnded { auction_id });

    Ok(())
}
```

#### 3. Off-Chain Decryption and Finalization

```rust
use drand_client::DrandClient;

// After auction ends, anyone can decrypt and finalize
async fn finalize_auction_with_winner(
    auction_id: AuctionId,
) -> Result<Address, Error> {
    let auction = get_auction(auction_id)?;

    require!(
        auction.state == AuctionState::Ended,
        "Auction not ended"
    );

    // Fetch drand beacon for target round
    let drand = DrandClient::new();
    let beacon = drand.get_beacon(auction.target_drand_round).await?;

    // Decrypt all bids
    let mut highest_bid = 0u64;
    let mut winner = None;

    for encrypted_bid in &auction.bids {
        // Decrypt using drand signature
        let plaintext = decrypt(
            &encrypted_bid.ciphertext,
            &beacon.signature,
        )?;

        let bid_price = u64::from_le_bytes(
            plaintext.try_into()
                .map_err(|_| Error::InvalidBidFormat)?
        );

        // Verify commitment (optional additional security)
        let commitment = hash(&plaintext);
        require!(
            commitment == encrypted_bid.commitment,
            "Bid commitment mismatch"
        );

        if bid_price > highest_bid {
            highest_bid = bid_price;
            winner = Some(encrypted_bid.bidder);
        }
    }

    let winner = winner.ok_or(Error::NoBids)?;

    // Submit winner to blockchain
    submit_winner(auction_id, winner, highest_bid)?;

    Ok(winner)
}

// On-chain finalization
pub fn finalize_auction(
    auction_id: AuctionId,
    winner: Address,
    winning_bid: u64,
    proof: DecryptionProof,
) -> Result<(), Error> {
    let mut auction = get_auction(auction_id)?;

    require!(
        auction.state == AuctionState::Ended,
        "Auction not ended"
    );

    // Verify decryption proof (optional)
    verify_decryption_proof(&auction, winner, winning_bid, proof)?;

    auction.winner = Some(winner);
    auction.state = AuctionState::Finalized;
    save_auction(auction);

    emit_event(AuctionFinalized { auction_id, winner, winning_bid });

    Ok(())
}
```

#### 4. Integration Libraries

**Rust (Primary)**:
```toml
[dependencies]
tlock = "0.1"  # Timelock encryption with drand (check latest version)
drand-client = "0.2"  # drand API client
```

**Alternative: `dee` by Cloudflare**:
```bash
cargo install dee
# CLI tool for drand timelock encryption
```

**JavaScript (for frontend)**:
```json
{
  "dependencies": {
    "tlock-js": "^0.2.0"
  }
}
```

### Deployment Considerations

**1. Round Selection Buffer**:
- Always add 1-2 rounds buffer to account for clock skew
- Ensure round will definitely be published before anyone attempts decryption

**2. Drand Network Liveness**:
- Monitor drand beacon health: https://api.drand.sh/chains
- Implement fallback if beacon is unreachable
- Consider caching recent beacons for verification

**3. Finalization Incentives**:
- Anyone can decrypt and submit winner
- Consider reward for first valid finalization submission
- Prevents auction from remaining in "Ended" state indefinitely

**4. Commitment Scheme** (Optional Enhancement):
```rust
pub struct EncryptedBid {
    pub ciphertext: Vec<u8>,
    pub commitment: Hash,  // Hash(plaintext || nonce)
    // ...
}
```
- Bidder commits to plaintext before encryption
- Prevents dishonest finalization submissions
- On-chain contract verifies commitment matches decrypted value

### Prototype Limitations

**Trust Assumptions**:
- League of Entropy operates honestly
- Majority of drand nodes not compromised
- drand network remains operational

**Performance**:
- Encryption: <6ms per bid (very fast)
- Decryption: <10ms per bid (after beacon fetch)
- Network latency: ~100-500ms to fetch beacon

**Security Horizon**:
- ~5-10 years before quantum computers threaten BLS12-381
- Acceptable for auction scenarios (hours/days duration)

## Phase 2: Native Blockchain Implementation

> **Note**: With MoveVM native functions, IBE implementation is done entirely in **high-performance Rust** and exposed to Move contracts. This enables on-chain encryption validation, on-chain decryption, and dramatically lower gas costs compared to pure Move implementation.

### Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    Blockchain Layer                           │
│                                                               │
│  ┌─────────────┐      ┌──────────────┐      ┌─────────────┐ │
│  │   Auction   │      │  Encrypted   │      │   Winner    │ │
│  │  Contract   │─────→│    Bids      │─────→│ Finalized   │ │
│  └─────────────┘      └──────────────┘      └─────────────┘ │
│         │                     │                              │
│         │                     │                              │
│         ↓                     ↓                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │         Validator Set (Threshold BLS)                │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐           │   │
│  │  │ Validator│  │ Validator│  │ Validator│  ...      │   │
│  │  │    1     │  │    2     │  │    3     │           │   │
│  │  └──────────┘  └──────────┘  └──────────┘           │   │
│  │                                                       │   │
│  │  Collectively sign block numbers → IBE decryption    │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

### Prerequisites

**Existing Infrastructure**:
- ✅ Threshold BLS signature scheme for block production
- ✅ Validator set with rotating membership
- ✅ Epoch-based validator transitions
- ⚠️ Need to add: Identity-Based Encryption (IBE) layer

### Epoch-Scoped Auction Design

Since validators change daily, auctions must complete within a single epoch.

#### Epoch Management

```rust
pub struct Epoch {
    pub id: u64,
    pub bls_master_pubkey: PublicKey,  // Existing threshold BLS public key
    pub validators: Vec<ValidatorInfo>,
    pub start_block: u64,
    pub end_block: u64,
    pub start_time: Timestamp,
    pub end_time: Timestamp,
}

pub struct ValidatorInfo {
    pub address: Address,
    pub stake: u64,
    pub bls_pubkey: PublicKey,
}

// Get current epoch
pub fn get_current_epoch() -> Epoch {
    // Your existing epoch management
    state::get_epoch(state::get_current_epoch_id())
}
```

#### Auction Creation with Epoch Validation

```rust
pub struct Auction {
    pub id: AuctionId,
    pub epoch: u64,                    // Must complete within this epoch
    pub end_block: u64,                // Target block for decryption
    pub bids: Vec<EncryptedBid>,
    pub state: AuctionState,
    pub winner: Option<Address>,
}

pub struct EncryptedBid {
    pub ciphertext: Vec<u8>,           // IBE encrypted price
    pub target_epoch: u64,             // Which epoch's keys decrypt this
    pub target_block: u64,             // Specific block number
    pub bidder: Address,
}

// Create auction
pub fn create_auction(
    duration_blocks: u64,
) -> Result<AuctionId, Error> {
    let current_block = get_current_block();
    let end_block = current_block + duration_blocks;
    let current_epoch = get_current_epoch();

    // CRITICAL: Ensure auction doesn't span epochs
    require!(
        end_block <= current_epoch.end_block,
        "Auction duration exceeds current epoch. Max duration: {} blocks",
        current_epoch.end_block - current_block
    );

    let auction = Auction {
        id: generate_auction_id(),
        epoch: current_epoch.id,
        end_block,
        bids: vec![],
        state: AuctionState::Active,
        winner: None,
    };

    store_auction(auction.clone());

    emit_event(AuctionCreated {
        auction_id: auction.id,
        end_block: auction.end_block,
        epoch: auction.epoch,
    });

    Ok(auction.id)
}
```

#### Client-Side Bid Encryption (IBE)

```rust
use ibe::{BonehFranklin, IdentityBasedEncryption};
use bls12_381::{G1Projective, G2Projective, Scalar};

// Encrypt bid using IBE
pub fn encrypt_bid(
    auction: &Auction,
    bid_price: u64,
) -> Result<EncryptedBid, Error> {
    let epoch = get_epoch(auction.epoch)?;

    // Derive IBE public key from epoch's BLS master key and target block
    let ibe_pubkey = derive_ibe_public_key(
        &epoch.bls_master_pubkey,
        auction.end_block,
    );

    // Encrypt bid price
    let plaintext = bid_price.to_le_bytes();
    let ciphertext = ibe_encrypt(&plaintext, &ibe_pubkey)?;

    Ok(EncryptedBid {
        ciphertext,
        target_epoch: auction.epoch,
        target_block: auction.end_block,
        bidder: get_my_address(),
    })
}

// Derive IBE public key from master key and identity (block number)
fn derive_ibe_public_key(
    master_pubkey: &PublicKey,
    block_number: u64,
) -> IbePublicKey {
    // Hash block number to a point on the curve (identity)
    let identity = hash_to_g1(&block_number.to_le_bytes());

    // IBE public key combines master key with identity
    // Implementation depends on specific IBE scheme (e.g., Boneh-Franklin)
    IbePublicKey {
        master_pubkey: master_pubkey.clone(),
        identity,
        block_number,
    }
}

// IBE encryption (Boneh-Franklin scheme)
fn ibe_encrypt(plaintext: &[u8], pubkey: &IbePublicKey) -> Result<Vec<u8>, Error> {
    // 1. Generate random r
    let r = Scalar::random(&mut rand::thread_rng());

    // 2. Compute pairing: g_id = e(identity, master_pubkey)^r
    let g_id = pairing(&pubkey.identity, &pubkey.master_pubkey.0).pow(r);

    // 3. Symmetric key from pairing result
    let symmetric_key = hash_gt_to_key(&g_id);

    // 4. Encrypt plaintext with symmetric key
    let ciphertext = aes_encrypt(plaintext, &symmetric_key);

    // 5. Compute U = G^r (where G is generator)
    let u = G1Projective::generator() * r;

    // 6. Return (U, ciphertext)
    Ok(serialize_ibe_ciphertext(&u, &ciphertext))
}
```

#### Threshold Signature for Decryption

```rust
// After auction ends, validators sign the target block number
// This signature IS the IBE decryption key

pub fn request_auction_decryption(
    auction_id: AuctionId,
) -> Result<(), Error> {
    let auction = get_auction(auction_id)?;
    let current_block = get_current_block();

    require!(
        current_block >= auction.end_block,
        "Auction not yet ended"
    );

    require!(
        auction.state == AuctionState::Active,
        "Auction already ended"
    );

    // Request validators to threshold sign the target block number
    let message = auction.end_block.to_le_bytes();
    let signature_request = ThresholdSignatureRequest {
        message,
        epoch: auction.epoch,
        purpose: SignaturePurpose::AuctionDecryption(auction_id),
    };

    request_threshold_signature(signature_request)?;

    Ok(())
}

// Validators collectively produce threshold signature
// (This uses your existing threshold BLS infrastructure)
pub fn on_threshold_signature_ready(
    auction_id: AuctionId,
    signature: ThresholdSignature,
) -> Result<(), Error> {
    let mut auction = get_auction(auction_id)?;

    // Store the IBE decryption key
    store_decryption_key(auction_id, signature.clone());

    auction.state = AuctionState::ReadyForDecryption;
    save_auction(auction);

    emit_event(DecryptionKeyAvailable {
        auction_id,
        signature,
    });

    Ok(())
}
```

#### Bid Decryption with IBE

```rust
// Decrypt bid using threshold signature as IBE private key
pub fn decrypt_bid(
    encrypted_bid: &EncryptedBid,
    threshold_signature: &ThresholdSignature,
) -> Result<u64, Error> {
    // Parse IBE ciphertext
    let (u, ciphertext) = parse_ibe_ciphertext(&encrypted_bid.ciphertext)?;

    // Compute pairing: e(U, private_key)
    // private_key = threshold_signature on block_number
    let g_id = pairing(&u, &threshold_signature.signature);

    // Derive symmetric key
    let symmetric_key = hash_gt_to_key(&g_id);

    // Decrypt
    let plaintext = aes_decrypt(&ciphertext, &symmetric_key)?;

    // Parse bid price
    let bid_price = u64::from_le_bytes(
        plaintext.try_into()
            .map_err(|_| Error::InvalidBidFormat)?
    );

    Ok(bid_price)
}

// Finalize auction
pub fn finalize_auction(auction_id: AuctionId) -> Result<(), Error> {
    let mut auction = get_auction(auction_id)?;

    require!(
        auction.state == AuctionState::ReadyForDecryption,
        "Decryption key not available"
    );

    let decryption_key = get_decryption_key(auction_id)?;

    // Decrypt all bids
    let mut highest_bid = 0u64;
    let mut winner = None;

    for encrypted_bid in &auction.bids {
        let bid_price = decrypt_bid(encrypted_bid, &decryption_key)?;

        if bid_price > highest_bid {
            highest_bid = bid_price;
            winner = Some(encrypted_bid.bidder);
        }
    }

    let winner = winner.ok_or(Error::NoBids)?;

    auction.winner = Some(winner);
    auction.state = AuctionState::Finalized;
    save_auction(auction);

    emit_event(AuctionFinalized {
        auction_id,
        winner,
        winning_bid: highest_bid,
    });

    Ok(())
}
```

### IBE Implementation Options

#### Option 1: Boneh-Franklin IBE

**Paper**: "Identity-Based Encryption from the Weil Pairing" (Boneh, Franklin, 2001)

**Cryptographic Components**:
- Bilinear pairing: e: G1 × G2 → GT
- Hash functions: H1: {0,1}* → G1, H2: GT → {0,1}^n

**Setup**:
- Master secret key: s ∈ Zp (random scalar)
- Master public key: P_pub = s · P (where P is G2 generator)

**Key Extraction** (performed by threshold validators):
- Identity ID = H1(block_number)
- Private key = s · ID (threshold signature on block_number)

**Encryption**:
- Choose random r
- Compute g_id = e(H1(block_number), P_pub)
- Ciphertext = (r·P, M ⊕ H2(g_id^r))

**Decryption**:
- Given private key d_ID and ciphertext (U, V)
- Compute M = V ⊕ H2(e(d_ID, U))

#### Option 2: Sakai-Kasahara IBE

**Advantages**:
- Simpler decryption (no pairing in decryption)
- Slightly better performance

**Disadvantages**:
- More complex key extraction
- Less standard than Boneh-Franklin

**Recommendation**: Start with Boneh-Franklin (more standard, better understood).

### Rust Cryptography Libraries

```toml
[dependencies]
# BLS12-381 pairing-friendly curve
bls12_381 = "0.8"
group = "0.13"
ff = "0.13"
pairing = "0.23"

# Or use arkworks ecosystem
ark-bls12-381 = "0.4"
ark-ec = "0.4"
ark-ff = "0.4"
ark-std = "0.4"

# For IBE implementation
# (You may need to implement IBE yourself using above primitives)

# Symmetric encryption
aes-gcm = "0.10"
sha2 = "0.10"
```

### Key Implementation Tasks

**1. IBE Module**:
- Implement Boneh-Franklin encryption/decryption
- Hash-to-curve for identity derivation
- Pairing operations for key derivation

**2. Integration with Threshold BLS**:
- Adapt existing threshold signature mechanism
- Sign block numbers on request
- Return signatures to requesting contracts

**3. Epoch Management**:
- Enforce auction duration limits
- Validate bid epochs
- Handle epoch transitions cleanly

**4. Smart Contract Logic**:
- Auction creation with epoch validation
- Bid submission with encryption verification
- Decryption key request/storage
- Winner finalization

### Validator Set Changes: Two Approaches

#### Approach A: Epoch-Scoped Keys (Recommended for Phase 2)

Each epoch has its own BLS master key:

**Pros**:
- ✅ Simpler implementation
- ✅ Uses existing key rotation mechanism
- ✅ No complex DKG resharing needed

**Cons**:
- ❌ Auctions must complete within one epoch
- ❌ Cannot span validator set changes

**Maximum Auction Duration**:
- Depends on epoch length (e.g., 1 day = max ~1 day auction)
- Practical for most auction scenarios

#### Approach B: DKG Resharing (Future Enhancement)

Maintain single master key across epochs:

**Mechanism**:
1. Epoch N validators hold shares of master secret key
2. At epoch transition, run DKG resharing protocol
3. Epoch N+1 validators receive shares of same master key
4. Master public key remains constant

**Pros**:
- ✅ Auctions can span multiple epochs
- ✅ Longer auction durations possible

**Cons**:
- ❌ Complex DKG protocol required
- ❌ Additional coordination at epoch boundaries
- ❌ Increased implementation complexity

**Recommendation**: Start with Approach A, upgrade to B only if long auctions are critical.

## Case Study: Aptos Blockchain Architecture

As part of our research, we investigated Aptos blockchain's cryptographic infrastructure to understand production patterns.

### Aptos Cryptographic Stack

**Repository**: `aptos-labs/aptos-core`

#### BLS Implementation

**Location**: `/crates/aptos-crypto/src/bls12381/`

**Library**: `blst` (Supranational) + `blstrs` + `arkworks`

**Curve**: BLS12-381 (MinPK variant)
- Public keys in G1 (48 bytes)
- Signatures in G2 (96 bytes)

**Key Operations**:
- Key generation with Proof of Possession (PoP)
- Public key aggregation
- Signature aggregation
- Multi-signature verification

**Critical Finding**: Aptos uses **aggregate signatures**, not true threshold signatures.

```rust
// Aptos approach: BTreeMap of individual signatures
BTreeMap<AccountAddress, bls12381::Signature>

// Requires 2/3+ validators to sign individually
// Then aggregates all signatures together
```

From Aptos GitHub Issue #499:
> "We explored BLS in the past but not implemented in production because it's not standardized at the moment and the aggregation part is expensive."

**Implication**: Aptos's current implementation would not directly support IBE-based timelock encryption, as it lacks true threshold signatures.

#### Validator Key Management

**Epoch Duration**: 2 hours (configurable)

**Key Rotation Process**:
1. Generate new consensus key with PoP
2. Configure node with both old and new keys
3. Register new key on-chain: `0x1::stake::rotate_consensus_key()`
4. New key takes effect at next epoch boundary
5. Zero-downtime transition

**Location**: `/aptos-move/framework/aptos-framework/sources/stake.move`

#### DKG Implementation

**Location**: `/crates/aptos-dkg/`

**Purpose**: On-chain randomness generation (AIP-79), not for timelock encryption

**Cryptographic Schemes**:
- Das PVSS (Publicly Verifiable Secret Sharing)
- Pinkas Weighted VUF (Verifiable Unpredictable Function)
- KZG polynomial commitment scheme

**Process**:
1. DKG at epoch boundaries establishes shared secret
2. Validators use key shares for weighted VUF
3. Generates unpredictable randomness per block
4. Available to smart contracts via Move API

**Key Insight**: Aptos has DKG infrastructure, but designed for randomness, not timelock encryption.

#### IBE Status on Aptos

**Current Implementation**: ❌ Does not exist

**Research in Progress**: ✅ Active

**Paper**: "Efficiently-Thresholdizable Batched Identity Based Encryption, with Applications"
- Authors: Amit Agarwal (UIUC), Rex Fernando (Aptos Labs), Benny Pinkas (Aptos Labs, Bar-Ilan University)
- Published: 2024, IACR ePrint 2024/1575
- Use cases: Mempool privacy, sealed-bid auctions, privacy-preserving options trading

**October 2025 Announcement**:
- Encrypted mempool feature (pending governance approval)
- Uses batched threshold encryption
- Transactions encrypted in <6ms
- Not yet in public repository

**Conclusion**: Aptos Labs is actively developing similar cryptography for similar use cases.

#### Available Cryptographic Primitives for Developers

**Move Framework Location**: `/aptos-move/framework/aptos-stdlib/sources/cryptography/`

**BLS12-381 Algebra** (`bls12381_algebra.move`):
- G1, G2, Gt group operations
- Pairing operations: `pairing<G1, G2, Gt>()`
- Hash-to-curve functions
- Multi-scalar multiplication

**Generic Crypto Algebra** (`crypto_algebra.move`):
- Field operations (add, mul, inv, etc.)
- Group operations (scalar multiplication, multi-scalar)
- Serialization/deserialization

**ElGamal Encryption** (`ristretto255_elgamal.move`):
- Homomorphic encryption on Ristretto255
- Ciphertext addition/subtraction
- Public key encryption

**Other Primitives**:
- Pedersen commitments
- Bulletproofs range proofs
- Multiple signature schemes (Ed25519, ECDSA, BLS)

**Key Takeaway**: Building blocks for IBE exist (pairings, hash-to-curve, BLS12-381), but no pre-built IBE module.

### Lessons from Aptos

**1. Aggregate vs. Threshold Signatures**:
- Aptos chose aggregate signatures for simplicity
- Threshold signatures add complexity but enable IBE
- Consider trade-offs for your chain

**2. DKG Infrastructure is Complex**:
- Aptos has full DKG implementation for randomness
- Could potentially be adapted for key resharing
- Significant engineering investment required

**3. IBE is Still Emerging**:
- No major L1 has production IBE yet
- Aptos research indicates growing interest
- Encrypted mempool feature suggests near-term deployment

**4. Epoch-Based Key Management Works**:
- Aptos 2-hour epochs with key rotation
- Zero-downtime transitions
- Practical for most applications

**5. Start with drand, Migrate Later**:
- Even advanced chains use external primitives initially
- drand is production-ready today
- Native implementation can come in Phase 2

## Implementation Roadmap

> **Updated for Native Functions**: This roadmap assumes the ability to add native Rust functions to the MoveVM, which significantly streamlines implementation and improves performance.

### Phase 1: drand with Native Functions + ZKP

**ZK Circuit Design and Setup**
- [ ] Design ZK circuit for bid validity (Groth16)
  - Merkle proof verification constraints
  - Balance comparison constraints
  - Poseidon encryption constraints
  - Range check constraints
- [ ] Set up circuit development environment
- [ ] Implement circuit in `ark-r1cs-std`
- [ ] Perform trusted setup ceremony
  - Generate proving key (~50MB)
  - Generate verification key (~1KB)

**Client-Side Proof Generator**
- [ ] Create `bid-prover` Rust project
- [ ] Implement circuit witness generation
- [ ] Implement Poseidon encryption module
- [ ] Implement proof generation logic
- [ ] Build CLI interface for proof generation
- [ ] Test proof generation with sample inputs
- [ ] Benchmark performance (target: <500ms per proof)

**Blockchain ZKP Verifier Native Function**
- [ ] Implement `verify_bid_proof()` native function
  - Location: `/aptos-move/framework/aptos-natives/src/cryptography/bid_proof.rs`
  - Embed verification key (~1KB)
  - Deserialize and verify Groth16 proofs
  - Add error handling for invalid proofs
- [ ] Implement `tlock_decrypt()` native function
  - Location: `/aptos-move/framework/aptos-natives/src/cryptography/timelock.rs`
  - Integrate tlock crate for decryption
  - Add error handling for invalid ciphertexts
- [ ] Implement `verify_drand_beacon()` native function
  - BLS signature verification for drand beacons
  - Chain verification (signature links to previous round)
- [ ] Write comprehensive Rust unit tests
- [ ] Register all native functions with MoveVM runtime

**Move Smart Contract Development**
- [ ] Declare native functions in Move module
  - `verify_bid_proof()` - ZKP verification
  - `tlock_decrypt()` - drand decryption
  - `verify_drand_beacon()` - beacon verification
- [ ] Implement auction contract (creation, bidding, ending)
  - Integrate ZKP verification in `submit_bid()`
  - Store encrypted bids with proofs
  - Add auction state management with `Option<vector<u8>>` for decryption key
- [ ] Implement permissionless decryption key submission
  - `submit_decryption_key()` - Anyone can submit drand signature
  - Verify wall clock time has passed (`timestamp::now_seconds()`)
  - Verify drand beacon validity
  - Test decryption on sample bid
  - Store key immutably in auction state (once-only)
  - Optional: reward mechanism for first submitter
- [ ] Add two-phase finalization
  - Phase 1: Key submission (separate from decryption)
  - Phase 2: Auction finalization using stored key
- [ ] Write Move contract unit tests

**Client Integration and Tooling**
- [ ] Build complete bid submission workflow
  - Generate Merkle proof from ledger state
  - Generate ZKP using `bid-prover`
  - Encrypt with Poseidon (inside circuit)
  - Optional: outer tlock layer for double encryption
- [ ] Implement round calculation utilities for drand
- [ ] Create finalization client (fetches drand beacon, submits to chain)
- [ ] Package `bid-prover` for distribution
- [ ] Write client documentation and examples

**Testing and Security**
- [ ] Integration testing on local devnet
  - Test full bid submission + verification flow
  - Test invalid proof rejection
  - Test balance verification via Merkle proof
- [ ] End-to-end testing on testnet
- [ ] Load testing with multiple concurrent auctions
- [ ] Gas cost analysis and optimization
- [ ] Security audit of:
  - ZK circuit constraints
  - Native verification function
  - Move contracts
  - Proof generation code

**Deployment**
- [ ] Deploy updated MoveVM with native functions to testnet
- [ ] Deploy auction contracts
- [ ] Distribute `bid-prover` tool and proving key
- [ ] Monitor for bugs and performance issues
- [ ] Mainnet deployment with gradual rollout

**Phase 1 Deliverables**:
- ✅ Working sealed-bid auction system with ZKP
- ✅ Client-side proof generator tool
- ✅ On-chain ZKP verification (1-2ms, ~150K gas)
- ✅ Balance verification via Merkle proofs
- ✅ Bid amount encrypted by circuit (Poseidon)
- ✅ On-chain drand verification and decryption
- ✅ No off-chain oracle required
- ✅ Grief-resistant (invalid bids rejected at submission)
- ✅ Capital efficient (balance verified cryptographically)
- ✅ Documentation and examples

### Phase 2: Native IBE Implementation

**IBE Native Function Development**
- [ ] Research and select IBE scheme (Boneh-Franklin recommended)
- [ ] Implement Boneh-Franklin IBE in Rust
  - `ibe_encrypt()` - Encrypt with master pubkey and identity
  - `ibe_decrypt()` - Decrypt with threshold signature
  - `ibe_verify_ciphertext()` - Validate ciphertext structure
  - `ibe_derive_public_key()` - Derive IBE pubkey from block number
- [ ] Integrate with arkworks/blst for BLS12-381 operations
- [ ] Location: `/aptos-move/framework/aptos-natives/src/cryptography/ibe.rs`
- [ ] Comprehensive unit tests with cryptographic test vectors
- [ ] Benchmark performance (aim for <10ms per operation)

**Validator Integration**
- [ ] Adapt threshold BLS signature mechanism for IBE
  - Validators sign block numbers on request
  - Signatures serve as IBE private keys
- [ ] Implement epoch-scoped key management
  - Each epoch has master BLS keypair
  - Auctions must complete within epoch
- [ ] Add validator signature request mechanism (on-chain or P2P)
- [ ] Test signature generation with validator set

**Move Smart Contract Development**
- [ ] Declare IBE native functions in Move module
  - `ibe_decrypt()` - IBE decryption
  - `verify_threshold_signature()` - Validate threshold BLS signature
- [ ] Implement epoch-scoped auction contracts
  - Validate auction duration doesn't exceed epoch
  - Store encrypted bids with epoch information
  - Add `Option<vector<u8>>` for threshold signature storage
- [ ] Implement permissionless threshold signature submission
  - `submit_threshold_signature()` - Anyone can submit validator signature
  - Verify time and block height reached
  - Verify threshold signature validity for epoch/block
  - Test decryption on sample bid
  - Store signature immutably in auction state (once-only)
  - Optional: reward mechanism for first submitter
- [ ] Add two-phase finalization with stored signature
- [ ] Implement winner determination logic
- [ ] Write comprehensive Move unit tests

**Testing and Optimization**
- [ ] Integration testing with validator set
- [ ] Test epoch transitions and edge cases
- [ ] Performance optimization
  - Batch decryption if possible
  - Precomputation of pairing values
  - Gas cost optimization
- [ ] Load testing with 100+ bids per auction
- [ ] Security testing (invalid ciphertexts, griefing attempts, etc.)

**Migration, Audit, and Deployment**
- [ ] Create migration path from Phase 1 (drand) to Phase 2 (native IBE)
- [ ] Comprehensive security audit (native functions + contracts)
- [ ] Testnet deployment with monitoring
- [ ] Stress testing and bug fixes
- [ ] Documentation and developer guides
- [ ] Mainnet deployment with phased rollout

**Phase 2 Deliverables**:
- ✅ Production-ready IBE implementation as native functions
- ✅ Epoch-scoped sealed-bid auctions
- ✅ No external dependencies (uses chain's own validators)
- ✅ High performance (<10ms crypto operations)
- ✅ Low gas costs (~10-20x better than pure Move)
- ✅ ZKP system from Phase 1 (can be reused with IBE encryption)
- ✅ Fully audited and tested system

### Future Enhancements

**DKG Resharing** (if needed for long auctions):
- [ ] Implement DKG resharing protocol
- [ ] Test key continuity across epochs
- [ ] Enable multi-epoch auctions

**Optimizations**:
- [ ] Batch decryption for multiple auctions
- [ ] Precomputed pairing values for faster encryption
- [ ] Client-side caching of epoch public keys

**Advanced Features**:
- [ ] Second-price (Vickrey) auctions
- [ ] Multi-item auctions
- [ ] Reserve price mechanisms
- [ ] Partial decryption for early winner revelation

## Security Considerations

### Threat Model

**Adversary Capabilities**:
- Can observe all blockchain state (encrypted bids)
- Can attempt to decrypt bids before auction ends
- Can submit invalid bids
- Can attempt to prevent decryption
- Can collude with other bidders

**Security Goals**:
- **Confidentiality**: Bid prices remain secret until auction ends
- **Integrity**: Winning bid is correctly determined
- **Availability**: Auction cannot be griefed or prevented from concluding
- **Verifiability**: All participants can verify correct decryption

### Phase 1 Security Analysis (drand)

**Threat: drand Network Compromise**

*Scenario*: Attacker controls threshold of drand nodes

*Impact*: Could decrypt bids early, breaking auction privacy

*Likelihood*: Low (League of Entropy has 18+ independent organizations)

*Mitigation*: Accept distributed trust model; monitor drand beacon health

**Threat: drand Network Failure**

*Scenario*: drand stops producing beacons

*Impact*: Cannot decrypt bids, auction stuck

*Likelihood*: Very low (high-availability network, 99.9%+ uptime historically)

*Mitigation*:
- Wait for network recovery
- Implement emergency decryption with on-chain governance
- Use beacon caching for recent rounds

**Threat: Quantum Computers**

*Scenario*: Quantum computer breaks BLS12-381

*Impact*: Could decrypt historical auction data

*Likelihood*: Low within 5-10 year horizon

*Mitigation*:
- Acceptable for short-lived auctions (hours/days)
- Bids don't need eternal privacy
- Can migrate to post-quantum crypto if threat materializes

**Threat: Timing Attacks**

*Scenario*: Bidder submits bid just before auction ends, sees earlier bids decrypt slightly early

*Impact*: Could gain unfair advantage

*Likelihood*: Very low (3-second drand rounds, attacker cannot predict exact timing)

*Mitigation*:
- Add buffer rounds to ensure decryption only after auction end
- Enforce minimum time between last bid and auction end

**Threat: Invalid Bid Griefing** (**Mitigated by ZKP**)

*Scenario*: Attacker submits invalid ciphertexts or bids exceeding their balance

*Impact*: Wastes gas, creates fake competition, potentially invalidates auction

*Likelihood*: High without ZKP, **eliminated with ZKP**

*Mitigation*:
- ✅ **ZKP verification at submission time**
- ✅ Cryptographically proves bid validity before acceptance
- ✅ Proves balance sufficiency via Merkle proof
- ✅ Circuit-generated ciphertext ensures decryptability
- Result: Invalid bids are rejected immediately, no wasted gas

### Phase 2 Security Analysis (Native IBE)

**Threat: Validator Collusion**

*Scenario*: Threshold of validators collude to sign block number early

*Impact*: Could decrypt bids before auction ends

*Likelihood*: Depends on validator set security

*Mitigation*:
- Require honest majority (same as blockchain consensus)
- Economic penalties for misbehavior
- Monitor validator behavior
- High threshold requirement (e.g., 2/3+)

**Threat: Epoch Transition Edge Cases**

*Scenario*: Auction ends during epoch transition, keys not available

*Impact*: Cannot decrypt bids

*Likelihood*: Medium if not handled carefully

*Mitigation*:
- Enforce auctions end before epoch boundary
- Add safety margin (e.g., 100 blocks before epoch end)
- Document clearly in auction creation

**Threat: IBE Implementation Bugs**

*Scenario*: Bug in IBE encryption/decryption code

*Impact*: Could leak bid information or prevent decryption

*Likelihood*: Medium without proper review

*Mitigation*:
- Extensive unit testing with known test vectors
- Cryptographic review by expert
- Formal verification if possible
- Use well-reviewed pairing libraries (e.g., arkworks, blst)

**Threat: Invalid Bid Submission**

*Scenario*: Attacker submits malformed encrypted bids to disrupt auction

*Impact*: Could prevent finalization or cause gas exhaustion

*Likelihood*: Medium

*Mitigation*:
- Validate ciphertext format before accepting bid
- Use commitment scheme to verify decrypted values
- Handle decryption errors gracefully (skip invalid bids)
- Gas limits on finalization function

### General Security Best Practices

**1. Commitment Scheme**:
```rust
pub struct EncryptedBid {
    pub ciphertext: Vec<u8>,
    pub commitment: Hash,  // H(plaintext || nonce)
    pub nonce: Vec<u8>,
}

// On finalization, verify:
assert_eq!(
    commitment,
    hash(&[&decrypted_plaintext, &nonce].concat())
);
```

**2. Bid Validation**:
- Minimum bid amount
- Maximum bid amount (prevent overflow)
- Proper ciphertext length
- Valid commitment hash

**3. Finalization Safeguards**:
- Only allow finalization after sufficient time passed
- Implement multi-party finalization (multiple parties verify independently)
- Emit detailed events for transparency

**4. Access Control**:
- Anyone can submit bids (permissionless)
- Anyone can trigger decryption after end time
- Anyone can verify finalization correctness

**5. Emergency Procedures**:
- Governance mechanism to cancel fraudulent auctions
- Refund mechanism if decryption fails
- Circuit breaker for system-wide issues

## Performance and Costs

### Phase 1: drand Prototype

**Encryption** (Client-side):
- Time: <6ms per bid
- No blockchain gas cost

**Bid Submission** (On-chain):
- Gas cost: Storage for ~200-300 bytes
- Comparable to standard transaction

**Decryption** (Off-chain):
- Time: <10ms per bid (after fetching beacon)
- Beacon fetch: ~100-500ms (network latency)

**Finalization** (On-chain):
- Gas cost: Verification + state updates
- Can batch multiple auction finalizations

### Phase 2: Native Implementation

**Encryption** (Client-side):
- Time: ~5-20ms per bid (depending on pairing implementation)
- Includes one pairing operation

**Bid Submission** (On-chain):
- Similar gas cost to Phase 1

**Threshold Signature Request** (On-chain):
- Gas cost: Minimal (emit event)
- Validators sign off-chain

**Decryption** (On-chain or off-chain):
- Time: ~20-50ms per bid
- Includes one pairing operation
- Can be done off-chain and verified on-chain

**Finalization** (On-chain):
- Gas cost: Higher if decryption done on-chain
- Consider off-chain decryption + on-chain verification

### Optimization Strategies

**1. Batch Operations**:
- Decrypt multiple bids in parallel
- Use multi-pairing for verification

**2. Caching**:
- Cache epoch public keys client-side
- Cache drand beacons for verification

**3. Off-Chain Computation**:
- Do heavy cryptography off-chain
- Submit proofs on-chain for verification

**4. Lazy Finalization**:
- Don't finalize immediately
- Wait for sufficient time to ensure decryption possible
- Incentivize off-chain finalizers

## Conclusion

This document outlines a pragmatic two-phase approach to implementing sealed-bid auctions with timelock encryption and zero-knowledge proofs, **leveraging MoveVM native functions** for high-performance cryptography:

**Phase 1** leverages the battle-tested drand network with **on-chain verification and decryption** via native Rust functions, combined with a **zero-knowledge proof system** that ensures bid validity. The ZKP system prevents griefing attacks by cryptographically proving:
- Bid validity (well-formed ciphertext of serialized Move struct)
- Balance sufficiency (bid ≤ user balance)
- Ciphertext authenticity (generated by circuit, bound to proof)

The **two-component ZKP architecture** is key:
- **Client-side proof generator**: Heavy computation off-chain (100-500ms), produces encrypted serialized Move objects
- **Blockchain verifier**: Lightweight verification on-chain (1-2ms, ~150K gas)

**Critical architectural innovation**: The ZK circuit serializes Move `Bid` structs to BCS format and encrypts them. After decryption on-chain, the Move contract deserializes the bytes to recover the `Bid` object, stores it in the user's account resource, and executes bid logic using the instantiated struct. This provides seamless integration with Move's object model.

This provides immediate functionality with trustless finalization—no off-chain oracles needed. While it introduces a small trust assumption in drand's distributed network, the implementation is production-ready with excellent performance and grief-resistance.

**Phase 2** builds native IBE capabilities as **high-performance Rust native functions**, using the blockchain's existing threshold BLS infrastructure. This eliminates external dependencies, provides 10-100x better performance than pure Move, and offers full control over the cryptographic system. The ZKP system from Phase 1 can be adapted to verify IBE-encrypted bids as well.

**The native functions capability is a game-changer**: It enables cryptographic operations that would be impractical or prohibitively expensive in pure Move (especially ZKP verification), while maintaining Move's safety guarantees for business logic. Both phases benefit from this architecture.

The research into Aptos blockchain's architecture confirms that even advanced L1 chains are still developing similar capabilities, validating our phased approach. Starting with drand allows rapid iteration and real-world testing while building toward a fully native solution.

### Key Takeaways

1. **Two-component ZKP architecture** - Client generates proofs, blockchain verifies (1-2ms)
2. **Circuit encrypts serialized Move objects** - Ensures cryptographic binding between proof and encrypted Bid struct
3. **Seamless Move integration** - Decrypted bytes deserialize to Move objects, stored in account state, executable bid logic
4. **Permissionless decryption** - Anyone can submit valid decryption keys (drand signature or threshold signature)
5. **Time-locked verification** - Smart contract validates wall clock time, key validity, and decryption capability
6. **Grief-resistance via ZKP** - Invalid bids rejected at submission time, balance verified cryptographically
7. **MoveVM native functions enable practical cryptography** - 10-100x performance improvement over pure Move
8. **drand is production-ready today** and provides a practical path to market with on-chain verification
9. **Native IBE is achievable** with existing threshold BLS infrastructure, implemented as Rust native functions
10. **Epoch-scoped auctions** are a pragmatic constraint for rotating validator sets
11. **The approach is battle-tested** by similar projects (Filecoin, Protocol Labs)
12. **Security trade-offs are well-understood** and acceptable for auction use cases
13. **Phased implementation approach** - Start with drand, migrate to native IBE

### Next Steps

1. **Design ZK circuit** for bid validity verification
2. **Implement client-side proof generator** (`bid-prover` tool)
3. **Implement blockchain ZKP verifier** as native function
4. **Integrate drand** with on-chain verification
5. **Deploy prototype to testnet** for validation
6. **Gather real-world performance** and usability data
7. **Start IBE implementation** work for Phase 2
8. **Plan migration strategy** from Phase 1 to Phase 2

## References

### drand Resources

- **drand Website**: https://drand.love
- **Documentation**: https://docs.drand.love
- **GitHub (Go tlock)**: https://github.com/drand/tlock
- **GitHub (JS tlock)**: https://github.com/drand/tlock-js
- **Research Paper**: "tlock: practical timelock encryption from threshold BLS" - https://eprint.iacr.org/2023/189.pdf
- **Mainnet Beacon**: https://api.drand.sh/chains

### IBE and Cryptography Resources

- **Boneh-Franklin IBE Paper**: "Identity-Based Encryption from the Weil Pairing" (2001) - https://crypto.stanford.edu/~dabo/pubs/papers/bfibe.pdf
- **BLS12-381 Specification**: https://hackmd.io/@benjaminion/bls12-381
- **Arkworks Ecosystem**: https://github.com/arkworks-rs
- **blst Library**: https://github.com/supranational/blst

### Aptos Resources

- **Aptos GitHub**: https://github.com/aptos-labs/aptos-core
- **Aptos Cryptography Docs**: https://aptos.dev/standards/cryptographic-foundations/
- **Batched IBE Paper**: "Efficiently-Thresholdizable Batched Identity Based Encryption, with Applications" - https://eprint.iacr.org/2024/1575
- **On-Chain Randomness (AIP-79)**: https://github.com/aptos-foundation/AIPs/blob/main/aips/aip-79.md

### General Resources

- **League of Entropy**: https://www.cloudflare.com/leagueofentropy/
- **Threshold Cryptography**: "Practical Threshold Signatures" - https://eprint.iacr.org/2020/852.pdf
- **Time-Lock Puzzles**: "Time-lock puzzles and timed-release Crypto" (Rivest et al., 1996)

---

*Document Version: 1.0*
*Last Updated: 2025-11-05*
*Project: Atomica - Blockchain Auctions with Timelock Encryption*
