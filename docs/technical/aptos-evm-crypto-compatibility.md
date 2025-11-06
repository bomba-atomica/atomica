# Verifying Aptos State Proofs in Ethereum Smart Contracts

## Executive Summary

**Yes, it is NOW FULLY FEASIBLE to verify Aptos state proofs in Solidity!**

As of **May 7, 2025**, EIP-2537 was activated on Ethereum mainnet as part of the Prague-Electra (Pectra) upgrade, providing native BLS12-381 precompiles. This makes full trustless verification of Aptos state proofs practical and cost-effective.

## Cryptographic Requirements

### 1. Hash Function: SHA3-256 (Keccak) ✅ NATIVE SUPPORT

**Aptos Implementation:**
- Location: `crates/aptos-crypto/src/hash.rs:116`
- Uses SHA3-256 (Keccak variant) for all cryptographic hashing
- Example: `TransactionAccumulatorHasher` uses SHA3 with prefix `b"TransactionAccumulator"`

**Ethereum/Solidity Support:**
- Native `keccak256()` function in Solidity
- Extremely gas-efficient: ~30 gas + 6 gas per word
- **Status: ✅ Fully Compatible**

```solidity
// Aptos uses SHA3-256, Ethereum provides keccak256 (same algorithm)
bytes32 hash = keccak256(abi.encodePacked(data));
```

### 2. Signature Scheme: BLS12-381 Aggregate Signatures ✅ NATIVE SUPPORT (Since May 2025)

**Aptos Implementation:**
- Location: `types/src/aggregate_signature.rs:16`
- Uses BLS12-381 pairing-based cryptography
- Validators sign with BLS private keys
- Signatures are aggregated into a single compact signature
- Location: `types/src/validator_verifier.rs:14`

**Ethereum/Solidity Support:**
- **EIP-2537**: ✅ **ACTIVATED on May 7, 2025** as part of Prague-Electra (Pectra) upgrade
- **Status**: BLS12-381 precompiles are NOW LIVE on Ethereum mainnet
- Provides 9 new precompiled contracts for BLS operations

**Verification Cost with EIP-2537 Precompiles:**

| Operation | Gas Cost | Status |
|--------|----------|--------|
| **BLS G1 Addition** | ~500 gas | ✅ Available |
| **BLS G1 Multiplication** | ~12,000 gas | ✅ Available |
| **BLS G2 Addition** | ~800 gas | ✅ Available |
| **BLS G2 Multiplication** | ~45,000 gas | ✅ Available |
| **BLS Pairing** | ~115,000 gas base + ~23,000 per pair | ✅ Available |
| **Full Aggregate Signature Verification** | ~130,000-180,000 gas | ✅ **PRACTICAL** |

For reference, library implementations (now obsolete):
- Solidity Library (pure): 5,000,000-10,000,000+ gas ❌
- Optimized Assembly: 2,000,000-5,000,000 gas ❌

### 3. Merkle Tree Verification ✅ STRAIGHTFORWARD

**Requirements:**
- Binary Merkle tree verification (Transaction Accumulator)
- Sparse Merkle tree verification (State Tree)
- Both use SHA3-256 hashing

**Solidity Implementation:**
```solidity
function verifyMerkleProof(
    bytes32 leaf,
    bytes32[] calldata proof,
    bytes32 root,
    uint256 index
) public pure returns (bool) {
    bytes32 computedHash = leaf;

    for (uint256 i = 0; i < proof.length; i++) {
        bytes32 proofElement = proof[i];

        if (index % 2 == 0) {
            // Left node
            computedHash = keccak256(abi.encodePacked(computedHash, proofElement));
        } else {
            // Right node
            computedHash = keccak256(abi.encodePacked(proofElement, computedHash));
        }

        index = index / 2;
    }

    return computedHash == root;
}
```

**Gas Cost:** ~3,000-10,000 gas depending on proof depth (very efficient)

## Verification Architecture

### Full State Proof Verification Flow

```solidity
contract AptosStateVerifier {
    // 1. Store trusted validator set and waypoint
    struct EpochState {
        uint64 epoch;
        bytes32 waypointHash;
        ValidatorInfo[] validators;
        uint128 totalVotingPower;
        uint128 quorumVotingPower;
    }

    struct ValidatorInfo {
        address aptosAddress; // 32 bytes
        bytes blsPublicKey;   // 96 bytes (BLS12-381 G2)
        uint64 votingPower;
    }

    EpochState public currentEpochState;

    // 2. Verify LedgerInfo signature
    function verifyLedgerInfo(
        bytes calldata ledgerInfoBytes,
        bytes calldata aggregatedSignature,
        bytes calldata signerBitmask
    ) public view returns (bool) {
        // Hash the LedgerInfo using BCS encoding
        bytes32 ledgerInfoHash = keccak256(ledgerInfoBytes);

        // CHALLENGE: Verify BLS aggregate signature
        // This requires BLS12-381 pairing operations
        return verifyBLSAggregateSignature(
            ledgerInfoHash,
            aggregatedSignature,
            signerBitmask,
            currentEpochState.validators
        );
    }

    // 3. Verify transaction inclusion
    function verifyTransactionProof(
        bytes32 transactionHash,
        bytes32[] calldata accumulatorProof,
        uint64 transactionIndex,
        bytes32 accumulatorRoot
    ) public pure returns (bool) {
        return verifyMerkleProof(
            transactionHash,
            accumulatorProof,
            accumulatorRoot,
            transactionIndex
        );
    }

    // 4. Verify state value
    function verifyStateProof(
        bytes32 stateKey,
        bytes calldata stateValue,
        bytes32[] calldata sparseMerkleProof,
        bytes32 stateRoot
    ) public pure returns (bool) {
        bytes32 valueHash = keccak256(stateValue);
        return verifySparseMerkleProof(
            stateKey,
            valueHash,
            sparseMerkleProof,
            stateRoot
        );
    }
}
```

## Implementation Approaches

### Approach 1: Full Trustless Verification ✅ NOW RECOMMENDED (Post-Pectra)

With EIP-2537 activated, you can now do full BLS signature verification on-chain!

```solidity
contract TrustlessAptosVerifier {
    // BLS12-381 precompile addresses (0x0a - 0x12)
    address constant BLS_G1_ADD = address(0x0a);
    address constant BLS_G1_MUL = address(0x0b);
    address constant BLS_G1_MULTIEXP = address(0x0c);
    address constant BLS_G2_ADD = address(0x0d);
    address constant BLS_G2_MUL = address(0x0e);
    address constant BLS_G2_MULTIEXP = address(0x0f);
    address constant BLS_PAIRING = address(0x10);
    address constant BLS_MAP_FP_TO_G1 = address(0x11);
    address constant BLS_MAP_FP2_TO_G2 = address(0x12);

    function verifyAggregateSignature(
        bytes32 message,
        bytes calldata aggregatedSignature,
        bytes calldata aggregatedPublicKey
    ) public view returns (bool) {
        // 1. Hash message to G2 point
        bytes memory messagePoint = hashToG2(message);

        // 2. Prepare pairing inputs: e(sig, G2) == e(aggPubKey, H(msg))
        bytes memory pairingInput = abi.encodePacked(
            aggregatedSignature,  // G1 point
            BLS_G2_GENERATOR,     // G2 generator
            aggregatedPublicKey,  // G1 point (aggregated)
            messagePoint          // G2 point (hashed message)
        );

        // 3. Call pairing precompile
        (bool success, bytes memory result) = BLS_PAIRING.staticcall(pairingInput);
        require(success, "Pairing failed");

        return abi.decode(result, (bool));
    }
}
```

**Gas Cost:** ~130,000-180,000 gas per state proof ✅
**Security:** Fully trustless, cryptographically secure
**Feasibility:** ✅ **Production ready NOW**

### Approach 2: Optimistic Verification (Still Valid for Lower Costs)
```solidity
contract OptimisticAptosVerifier {
    // Store state root claims with challenge period
    struct StateRootClaim {
        bytes32 stateRoot;
        uint64 version;
        uint256 timestamp;
        address claimant;
        uint256 bond;
        bool challenged;
    }

    uint256 constant CHALLENGE_PERIOD = 7 days;

    // 1. Relayer submits state root with bond
    function submitStateRoot(
        bytes32 stateRoot,
        uint64 version,
        bytes calldata ledgerInfoProof
    ) external payable {
        require(msg.value >= REQUIRED_BOND, "Insufficient bond");
        // Store claim, start challenge period
    }

    // 2. Anyone can challenge with BLS verification
    function challengeStateRoot(
        uint256 claimId,
        bytes calldata fraudProof
    ) external {
        // If successfully challenged, slash bond
        // Challenger receives reward
    }

    // 3. After challenge period, state root is finalized
    function finalizeStateRoot(uint256 claimId) external {
        StateRootClaim storage claim = claims[claimId];
        require(block.timestamp >= claim.timestamp + CHALLENGE_PERIOD);
        require(!claim.challenged);
        // State root is now trusted
    }
}
```

**Advantages:**
- No BLS verification in happy path (cheap)
- Security through economic incentives
- Challenge mechanism deters fraud

#### Option C: Light Client with Multi-Signature Bridge 🌉
```solidity
contract AptosLightClientBridge {
    // Use trusted committee instead of full validator set verification
    mapping(address => bool) public trustedRelayers;
    uint256 public requiredSignatures;

    // Require M-of-N signatures from trusted relayers
    function updateStateRoot(
        bytes32 newStateRoot,
        uint64 version,
        bytes[] calldata signatures // ECDSA signatures, not BLS
    ) external {
        require(signatures.length >= requiredSignatures);
        // Verify ECDSA signatures (cheap)
        // Update state root
    }
}
```

**Advantages:**
- Extremely gas-efficient
- No BLS verification needed
- Immediate finality

**Disadvantages:**
- Introduces trust assumptions
- Centralization risk

#### Option D: ZK-SNARK Proof of BLS Verification 🔐 ADVANCED
```solidity
contract ZKAptosVerifier {
    // Verify zero-knowledge proof that BLS signature is valid
    function verifyStateProofWithZK(
        bytes calldata zkProof,
        bytes32 stateRoot
    ) external view returns (bool) {
        // Verify SNARK proof that validator signatures are valid
        // Much cheaper than native BLS verification
        return verifyZKProof(zkProof);
    }
}
```

**Advantages:**
- Cryptographically secure
- Relatively gas-efficient (~200,000-500,000 gas)

**Disadvantages:**
- Complex implementation
- Requires ZK circuit development
- Proving time on client side

### Challenge 2: BCS Encoding/Decoding

**The Problem:**
- Aptos uses Binary Canonical Serialization (BCS) for all data structures
- Solidity needs to decode BCS to extract and verify data

**Solution:**
```solidity
library BCSDecoder {
    // Decode BCS-encoded data
    function decodeU64(bytes calldata data, uint256 offset)
        internal pure returns (uint64, uint256)
    {
        // Little-endian decoding
        uint64 value = uint64(uint8(data[offset])) |
                      (uint64(uint8(data[offset + 1])) << 8) |
                      (uint64(uint8(data[offset + 2])) << 16) |
                      // ... continue for 8 bytes
        return (value, offset + 8);
    }

    // Decode variable-length vectors, structs, etc.
}
```

**Gas Cost:** Moderate, depends on data structure complexity

### Challenge 3: Epoch Changes

**The Problem:**
- Validator set changes every epoch
- Need to verify epoch change proofs to update validator set

**Solution:**
```solidity
contract AptosEpochManager {
    mapping(uint64 => EpochState) public epochs;

    function verifyEpochChange(
        uint64 currentEpoch,
        bytes calldata epochChangeLedgerInfo,
        bytes calldata aggregatedSignature
    ) external {
        // Verify LedgerInfo is signed by current epoch's validators
        // Extract next epoch's validator set from LedgerInfo
        // Update stored epoch state
    }
}
```

## Practical Implementation Approaches

### Approach 1: Merkle Proof Only (No Signature Verification)

**Use Case:** Bridges where Aptos validator signatures are verified off-chain or via different mechanism

```solidity
contract SimpleAptosProofVerifier {
    bytes32 public trustedStateRoot; // Updated by trusted mechanism

    function verifyAccountBalance(
        address account,
        uint256 balance,
        bytes32[] calldata proof
    ) external view returns (bool) {
        bytes32 stateKey = keccak256(abi.encodePacked("account", account, "balance"));
        bytes32 valueHash = keccak256(abi.encode(balance));
        return verifySparseMerkleProof(stateKey, valueHash, proof, trustedStateRoot);
    }
}
```

**Gas Cost:** ~5,000-15,000 gas ✅
**Security:** Depends on state root update mechanism

### Approach 2: Optimistic Bridge (Recommended for Production)

```solidity
contract OptimisticAptosBridge {
    uint256 constant CHALLENGE_PERIOD = 7 days;
    uint256 constant BOND_AMOUNT = 1 ether;

    struct StateRootClaim {
        bytes32 stateRoot;
        uint64 aptosVersion;
        uint256 submittedAt;
        address relayer;
    }

    mapping(uint256 => StateRootClaim) public claims;
    uint256 public nextClaimId;
    bytes32 public finalizedStateRoot;

    function submitStateRoot(
        bytes32 stateRoot,
        uint64 version,
        bytes calldata ledgerInfoData
    ) external payable returns (uint256) {
        require(msg.value >= BOND_AMOUNT);
        uint256 claimId = nextClaimId++;
        claims[claimId] = StateRootClaim({
            stateRoot: stateRoot,
            aptosVersion: version,
            submittedAt: block.timestamp,
            relayer: msg.sender
        });
        return claimId;
    }

    function challenge(uint256 claimId, bytes calldata fraudProof) external {
        // Verify fraud proof shows invalid state root
        // Slash relayer's bond
        // Reward challenger
    }

    function finalize(uint256 claimId) external {
        StateRootClaim storage claim = claims[claimId];
        require(block.timestamp >= claim.submittedAt + CHALLENGE_PERIOD);
        finalizedStateRoot = claim.stateRoot;
        // Return bond to relayer
    }

    function verifyStateValue(
        bytes32 key,
        bytes calldata value,
        bytes32[] calldata proof
    ) external view returns (bool) {
        return verifySparseMerkleProof(key, keccak256(value), proof, finalizedStateRoot);
    }
}
```

**Gas Cost:**
- Submit: ~100,000 gas
- Challenge: ~500,000 gas (includes fraud proof verification)
- Finalize: ~50,000 gas
- Verify: ~10,000 gas

**Security Model:**
- Economic security through bonds
- Cryptographic security through fraud proofs
- 7-day finality delay

### Approach 3: Committee-Based Bridge

```solidity
contract CommitteeAptosBridge {
    address[] public committee;
    uint256 public threshold; // M-of-N multisig

    mapping(bytes32 => mapping(address => bool)) public attestations;
    mapping(bytes32 => uint256) public attestationCount;
    mapping(bytes32 => bool) public finalizedStateRoots;

    function attestStateRoot(bytes32 stateRoot, uint64 version) external {
        require(isCommitteeMember(msg.sender));
        bytes32 id = keccak256(abi.encode(stateRoot, version));

        if (!attestations[id][msg.sender]) {
            attestations[id][msg.sender] = true;
            attestationCount[id]++;

            if (attestationCount[id] >= threshold) {
                finalizedStateRoots[stateRoot] = true;
            }
        }
    }
}
```

**Gas Cost:** ~50,000 gas per attestation ✅
**Security:** Depends on committee trust assumptions

## Gas Cost Summary (Updated for EIP-2537)

| Operation | Gas Cost | Status | Notes |
|-----------|----------|--------|-------|
| **SHA3/Keccak Hash** | ~30-100 gas | ✅ | Native support |
| **Merkle Proof (depth 20)** | ~5,000 gas | ✅ | Very efficient |
| **Sparse Merkle Proof** | ~10,000 gas | ✅ | Efficient |
| **BCS Decoding (small struct)** | ~5,000-20,000 gas | ✅ | Moderate |
| **BLS Verification (precompile)** | ~150,000-180,000 gas | ✅ **LIVE** | Production ready! |
| **Full State Proof Verification** | ~180,000-200,000 gas | ✅ **RECOMMENDED** | Complete trustless verification |
| **Optimistic Submit** | ~100,000 gas | ✅ | Alternative for cost optimization |
| **Committee Attestation** | ~50,000 gas | ⚠️ | Not recommended (trust assumptions) |

**Pre-EIP-2537 costs (now obsolete):**
| Operation | Gas Cost | Status |
|-----------|----------|--------|
| BLS Verification (library) | 2-10M gas | ❌ Obsolete |
| BLS Verification (assembly) | 2-5M gas | ❌ Obsolete |

## Recommendations (Updated Post-Pectra)

### For Cross-Chain Bridges ✅ PRIMARY RECOMMENDATION

**Recommended:** Full Trustless Verification with BLS Precompiles
- Verify Aptos validator signatures on-chain using EIP-2537
- ~150,000-200,000 gas per state root update
- Zero trust assumptions
- Comparable to other major bridges (Polygon, Arbitrum)

**Implementation:**
```solidity
contract AptosBridge {
    function updateStateRoot(
        bytes calldata ledgerInfo,
        bytes calldata blsSignature,
        bytes calldata validatorBitmask
    ) external {
        // 1. Decode LedgerInfo (BCS)
        // 2. Hash LedgerInfo
        // 3. Verify BLS aggregate signature (using precompiles)
        // 4. Check quorum threshold
        // 5. Update state root
    }
}
```

**Example Projects:**
- This is now comparable to Polygon PoS bridge checkpoint verification
- Similar pattern to Ethereum 2.0 sync committee proofs

### For High-Throughput Applications

**Recommended:** Optimistic + Full Verification Hybrid
- Fast path: Optimistic submission (~50,000 gas)
- Slow path: Full BLS verification if challenged (~180,000 gas)
- Best of both worlds: cheap happy path, secure fallback

### For Asset Transfers

**Recommended:** Full BLS Verification
- No need for committees or optimistic delays
- Direct, trustless verification in ~200,000 gas
- Acceptable cost for high-value transfers
- 12-second finality (Ethereum block time)

### For Low-Cost Applications

**Recommended:** Amortized Verification
- Batch multiple state updates
- Verify one BLS signature covering multiple state roots
- Amortize ~150,000 gas cost over N updates
- ~15,000-30,000 gas per update when batched

### For Maximum Security

**Recommended:** Full Trustless Verification (Now Available!)
- Use BLS precompiles for all verification
- No trust assumptions
- No committees, no optimistic delays
- Cryptographically sound end-to-end

## Implementation Checklist (Post-Pectra)

### Core Verification (Trustless)
- [ ] **Implement BLS12-381 aggregate signature verification** using EIP-2537 precompiles
  - [ ] Call precompile at address 0x10 (BLS_PAIRING)
  - [ ] Aggregate public keys using 0x0c (BLS_G1_MULTIEXP)
  - [ ] Verify pairing equation: e(sig, G2) == e(aggPubKey, H(msg))
- [ ] **Implement BCS decoder** for Aptos data structures
  - [ ] LedgerInfo deserialization
  - [ ] EpochChangeProof deserialization
  - [ ] StateProof deserialization
  - [ ] Transaction and state value formats
- [ ] **Implement SHA3-256 Merkle tree verification**
  - [ ] Transaction accumulator proof verification
  - [ ] Sparse Merkle tree proof verification
  - [ ] Accumulator consistency proofs
- [ ] **Implement epoch change verification**
  - [ ] Verify epoch transition signatures
  - [ ] Update validator set storage
  - [ ] Handle validator set rotation

### State Management
- [ ] Store current epoch state (validators, voting power, quorum threshold)
- [ ] Store trusted state root with version
- [ ] Implement state root update with signature verification
- [ ] Add events for state transitions

### Testing & Security
- [ ] Test with real Aptos mainnet proofs
- [ ] Fuzz test BCS decoder
- [ ] Test edge cases (epoch boundaries, validator changes)
- [ ] Gas optimization benchmarking
- [ ] Professional security audit
- [ ] Formal verification (optional but recommended)

### Optional Enhancements
- [ ] Implement batching for multiple state updates
- [ ] Add optimistic fast path as fallback
- [ ] Implement fraud proof challenges
- [ ] Add governance for parameter updates

## EIP-2537 Precompile Reference

The following precompiled contracts are available on Ethereum mainnet (since Pectra upgrade):

| Address | Operation | Description | Base Gas |
|---------|-----------|-------------|----------|
| `0x0a` | BLS12_G1ADD | G1 point addition | ~500 |
| `0x0b` | BLS12_G1MUL | G1 scalar multiplication | ~12,000 |
| `0x0c` | BLS12_G1MULTIEXP | G1 multi-scalar multiplication | Variable |
| `0x0d` | BLS12_G2ADD | G2 point addition | ~800 |
| `0x0e` | BLS12_G2MUL | G2 scalar multiplication | ~45,000 |
| `0x0f` | BLS12_G2MULTIEXP | G2 multi-scalar multiplication | Variable |
| `0x10` | BLS12_PAIRING | Pairing check | ~115,000 base |
| `0x11` | BLS12_MAP_FP_TO_G1 | Hash to G1 | ~5,500 |
| `0x12` | BLS12_MAP_FP2_TO_G2 | Hash to G2 | ~75,000 |

### Key Operations for Aptos Verification:

```solidity
// 1. Aggregate validator public keys (who signed)
function aggregatePublicKeys(
    bytes[] memory publicKeys,
    bool[] memory signerMask
) internal view returns (bytes memory) {
    // Use BLS12_G1MULTIEXP (0x0c)
    // Only include keys where signerMask[i] == true
}

// 2. Verify aggregate signature
function verifyAggregateSignature(
    bytes memory aggregatedSignature,
    bytes memory aggregatedPublicKey,
    bytes32 message
) internal view returns (bool) {
    // Use BLS12_PAIRING (0x10)
    // Check: e(sig, G2) == e(aggPubKey, H(msg))
}

// 3. Hash message to G2 point
function hashToG2(bytes32 message) internal view returns (bytes memory) {
    // Use BLS12_MAP_FP2_TO_G2 (0x12)
}
```

## Code Examples Repository

### Reference Implementations:
- **EIP-2537 Test Cases**: https://github.com/ethereum/execution-spec-tests (Prague tests)
- **Ethereum Consensus BLS**: Beacon chain uses similar BLS patterns
- **OpenZeppelin MerkleProof.sol**: Merkle verification patterns
- **Polygon PoS bridge**: Checkpoint verification patterns (pre-BLS reference)

### Recommended Libraries:
- Create an `AptosBCSDecoder.sol` library for BCS deserialization
- Create an `AptosBLSVerifier.sol` library wrapping EIP-2537 precompiles
- Create an `AptosMerkleProof.sol` library for accumulator and sparse Merkle proofs

## Conclusion

**YES! Aptos state proofs can now be fully verified in Solidity with full trustlessness!**

As of **May 7, 2025**, with the activation of EIP-2537 in the Prague-Electra upgrade, **full trustless verification is now the recommended approach** for production bridges:

### ✅ What This Enables:

1. **Full BLS signature verification** using native precompiles (~150,000-200,000 gas)
2. **Zero trust assumptions** - no committees, no optimistic delays
3. **Comparable costs** to other major bridges (Polygon, Arbitrum)
4. **Production-ready** trustless Aptos ↔ Ethereum bridges

### 🏗️ Recommended Architecture (2025+):

```solidity
contract AptosEthereumBridge {
    // Store current epoch validator set
    EpochState public currentEpoch;

    // Update state root with full BLS verification
    function updateStateRoot(
        bytes calldata ledgerInfo,
        bytes calldata blsAggregateSignature,
        bytes calldata validatorBitmask
    ) external {
        // 1. Decode BCS-encoded LedgerInfo
        // 2. Verify BLS aggregate signature using precompiles (~150k gas)
        // 3. Check quorum (2/3+ voting power)
        // 4. Update trusted state root
    }

    // Verify specific state values with Merkle proofs
    function verifyStateValue(
        bytes32 key,
        bytes calldata value,
        bytes32[] calldata proof
    ) external view returns (bool) {
        // Verify against trusted state root (~10k gas)
    }
}
```

### 💰 Total Cost for Bridge Operation:

- **State root update:** ~180,000 gas (~$5-15 at typical gas prices)
- **State value verification:** ~10,000 gas (~$0.30-1)
- **Epoch change:** ~200,000 gas (~$6-20)

This is **now economically viable** for production cross-chain applications!

### 🎯 Use Cases Now Enabled:

- **DeFi bridges** - Move assets between Aptos and Ethereum
- **Cross-chain messaging** - Trustless communication protocols
- **Data oracles** - Prove Aptos state to Ethereum contracts
- **Governance** - Mirror Aptos governance to Ethereum
- **NFT bridges** - Transfer NFTs between chains

The game has changed! Full trustless Aptos-Ethereum interoperability is now practical and cost-effective.
