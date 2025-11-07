# Proving System Alternatives for Aptos Light Client

Comprehensive comparison of proving systems for verifying BLS12-381 aggregate signatures from Aptos validators on Ethereum.

## TL;DR Recommendations

| Use Case | Best Option | Proving Time | Setup Time | Proof Size | Gas Cost |
|----------|-------------|--------------|------------|------------|----------|
| **Production (Recommended)** | **Circom + Groth16** | **5-30s** | **2-3 weeks** | **256B** | **~200K** |
| Fastest proving | Plonky2 | 170ms | 3-4 weeks | 43KB | ~1M |
| No trusted setup | Halo2 | 1-5s | 3-4 weeks | 2-5KB | ~500K |
| Simplest (no ZK) | Direct EIP-2537 | 0s | 1 week | 0B | ~300K |
| Lowest dev cost | Optimistic | 0s | 1 week | 0B | ~50K |

---

## Option 1: Circom + Groth16 ⭐ (RECOMMENDED)

**Application-specific circuit** for BLS signature verification. Much lighter than general-purpose zkVMs.

### Performance

```
Proving time: 5-30 seconds (CPU)
Proving time: 1-5 seconds (GPU)
Proof size: 256 bytes
Gas cost: ~200,000 gas
Circuit constraints: ~10M (for 100 validators)
Memory: 4-8 GB
Setup: Trusted setup ceremony
```

### Architecture

```circom
// bls_verify.circom
pragma circom 2.1.0;

include "circomlib/pairing.circom";
include "circomlib/bls12_381.circom";

template BLSVerify(MAX_VALIDATORS) {
    // Public inputs
    signal input messageHash;
    signal input quorumVotingPower;
    signal input validatorSetHash;

    // Private inputs
    signal input signatures[MAX_VALIDATORS][2][2];
    signal input publicKeys[MAX_VALIDATORS][2][2];
    signal input votingPowers[MAX_VALIDATORS];
    signal input signerBitmask;

    // 1. Aggregate public keys
    component pkAgg = G1MultiExp(MAX_VALIDATORS);
    // ... aggregation logic

    // 2. Verify BLS pairing
    component pairing = BLS12381PairingCheck();
    pairing.p1[0] <== aggregatedPubKey;
    pairing.q1[0] <== hashToG2(messageHash);
    pairing.p1[1] <== signature;
    pairing.q1[1] <== g2Generator;
    pairing.out === 1;
}
```

### Implementation Steps

```bash
# 1. Install Circom
npm install -g circom

# 2. Write circuit
circom bls_verify.circom --r1cs --wasm --sym -o build/

# 3. Trusted setup (can use existing ceremony)
snarkjs groth16 setup build/bls_verify.r1cs pot_final.ptau circuit_final.zkey

# 4. Export verifier
snarkjs zkey export solidityverifier circuit_final.zkey Verifier.sol

# 5. Prover in Rust/JS
use snarkjs::prove;
let proof = prove(circuit, witness)?;
```

### Pros
- ✅ **10-100x faster** than SP1 (5-30s vs hours)
- ✅ **Tiny proofs** (256 bytes vs 1-2KB)
- ✅ **Low gas** (~200K vs ~250K)
- ✅ **Proven technology** (used in production by many projects)
- ✅ **Good tooling** (Circom, SnarkJS, Circomlib)

### Cons
- ⚠️ Requires trusted setup ceremony
- ⚠️ Application-specific (can't prove arbitrary programs)
- ⚠️ Circom learning curve
- ⚠️ Hard to debug circuits

### Example Projects
- **Succinct's Ethereum Consensus Light Client**: Uses Circom for BLS verification
- **Ethereum Beacon Chain Light Client**: Verifies 512 validator signatures
- **Telepathy**: Cross-chain message passing using Circom

### Scalability
Committee size from 32 to 512 signers (16x increase):
- Constraints increase by only 10.5%
- Witness generation time increases by 47%
- **Gas cost remains constant** at <230K (Groth16 proof size is constant)

---

## Option 2: Direct BLS Verification (EIP-2537)

**No ZK proving** - directly verify BLS signatures on Ethereum using precompiles.

### Performance

```
Proving time: 0s (no proving!)
Proof size: N/A
Gas cost: ~140,000 per signature
Gas cost (aggregate): ~300,000 for 100 validators
Setup: None
```

### Architecture

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

contract AptosLightClient {
    // BLS12-381 precompile addresses
    address constant BLS12_G1MSM = address(0x0d);
    address constant BLS12_PAIRING = address(0x10);
    address constant BLS12_MAP_FP2_TO_G2 = address(0x12);

    function updateState(
        bytes32 messageHash,
        bytes calldata aggregatedSignature,
        bytes[] calldata publicKeys,
        uint256 signerBitmask,
        uint64[] calldata votingPowers
    ) external {
        // 1. Check quorum
        uint128 totalVotingPower = 0;
        for (uint i = 0; i < publicKeys.length; i++) {
            if ((signerBitmask & (1 << i)) != 0) {
                totalVotingPower += votingPowers[i];
            }
        }
        require(totalVotingPower >= quorumVotingPower);

        // 2. Aggregate public keys using G1MSM precompile
        bytes memory aggPubKey = _aggregatePublicKeys(
            publicKeys,
            signerBitmask
        );

        // 3. Hash message to G2
        bytes memory hashedMsg = _hashToG2(messageHash);

        // 4. Verify pairing
        require(_verifyPairing(aggPubKey, hashedMsg, aggregatedSignature));

        // 5. Update state
        trustedState = newState;
    }

    function _aggregatePublicKeys(
        bytes[] calldata publicKeys,
        uint256 signerBitmask
    ) internal view returns (bytes memory) {
        // Build input for G1MSM precompile
        bytes memory input = new bytes(160 * signerCount);
        // ... pack public keys

        (bool success, bytes memory result) = BLS12_G1MSM.staticcall(input);
        require(success);
        return result;
    }

    function _verifyPairing(
        bytes memory pubKey,
        bytes memory message,
        bytes calldata signature
    ) internal view returns (bool) {
        bytes memory input = abi.encodePacked(
            message,    // G2 point (256 bytes)
            pubKey,     // G1 point (128 bytes)
            signature,  // G1 point (128 bytes)
            G2_GEN      // G2 generator (256 bytes)
        );

        (bool success, bytes memory result) = BLS12_PAIRING.staticcall(input);
        require(success);
        return abi.decode(result, (uint256)) == 1;
    }

    function _hashToG2(bytes32 message)
        internal view returns (bytes memory)
    {
        (bool success, bytes memory result) =
            BLS12_MAP_FP2_TO_G2.staticcall(abi.encodePacked(message));
        require(success);
        return result;
    }
}
```

### Pros
- ✅ **No proving overhead** (instant)
- ✅ **No infrastructure** needed
- ✅ **No trusted setup**
- ✅ **Simple implementation**
- ✅ **Lower gas than zkSNARK** (for small validator sets)

### Cons
- ⚠️ **High gas costs** (~300K for 100 validators)
- ⚠️ **Gas scales with validators** (not constant)
- ⚠️ **Large calldata** (all signatures + public keys on-chain)
- ⚠️ **No privacy** (all validator data public)

### When to Use
- Small validator sets (< 20 validators)
- Low update frequency
- Gas costs not a concern
- Simplicity more important than efficiency

---

## Option 3: Plonky2

**Fast recursive SNARK** system from Polygon. Optimized for proving speed.

### Performance

```
Proving time: 170ms (MacBook Pro)
Proving time: 300ms (MacBook Air 2021)
Proof size: 43 KB
Gas cost: ~1M (large proof verification)
Setup: No trusted setup
```

### Architecture

```rust
use plonky2::plonk::config::{GenericConfig, PoseidonGoldilocksConfig};
use plonky2::plonk::circuit_builder::CircuitBuilder;

// Define circuit
const D: usize = 2;
type C = PoseidonGoldilocksConfig;
type F = <C as GenericConfig<D>>::F;

let mut builder = CircuitBuilder::<F, D>::new(CircuitConfig::default());

// Add BLS verification constraints
let message_hash = builder.add_virtual_target();
let sig = builder.add_virtual_bls_signature_target();
let pub_keys = builder.add_virtual_bls_pubkey_targets(num_validators);

// Verify BLS
builder.verify_bls_signature(message_hash, sig, pub_keys);

// Build circuit
let circuit = builder.build::<C>();

// Generate proof
let mut pw = PartialWitness::new();
pw.set_target(message_hash, message_hash_value);
// ... set witness values

let proof = circuit.prove(pw)?;
```

### Pros
- ✅ **Extremely fast proving** (170ms)
- ✅ **No trusted setup**
- ✅ **Recursive proofs** (can compress multiple proofs)
- ✅ **Good for high-frequency updates**

### Cons
- ⚠️ **Large proofs** (43KB vs 256B)
- ⚠️ **High gas costs** (~1M gas to verify)
- ⚠️ **Less mature** than Groth16
- ⚠️ **Fewer tools/libraries**

### When to Use
- Need very fast proving (< 1 second)
- Can tolerate larger proofs
- Building recursive proof systems
- High update frequency (proving is bottleneck)

---

## Option 4: Halo2

**PLONK-based system** with no trusted setup. Used by Zcash, Scroll, Axiom.

### Performance

```
Proving time: 1-5 seconds
Proof size: 2-5 KB
Gas cost: ~500K
Setup: No trusted setup (uses KZG commitments)
```

### Architecture

```rust
use halo2_proofs::{
    circuit::{Layouter, SimpleFloorPlanner},
    plonk::*,
};

#[derive(Clone)]
struct BLSVerifyConfig {
    message: Column<Instance>,
    signature: Column<Advice>,
    pub_keys: Vec<Column<Advice>>,
    // ... BLS verification chips
}

struct BLSVerifyCircuit {
    message: Value<Fp>,
    signature: Value<G1Affine>,
    pub_keys: Vec<Value<G1Affine>>,
}

impl Circuit<Fp> for BLSVerifyCircuit {
    type Config = BLSVerifyConfig;
    type FloorPlanner = SimpleFloorPlanner;

    fn configure(meta: &mut ConstraintSystem<Fp>) -> Self::Config {
        // Configure BLS verification circuit
        // ...
    }

    fn synthesize(
        &self,
        config: Self::Config,
        mut layouter: impl Layouter<Fp>,
    ) -> Result<(), Error> {
        // Synthesize BLS verification
        // ...
    }
}

// Generate proof
let circuit = BLSVerifyCircuit { ... };
let proof = prove_circuit(circuit)?;
```

### Pros
- ✅ **No trusted setup**
- ✅ **Reasonable proving time** (1-5s)
- ✅ **Moderate proof size** (2-5KB)
- ✅ **Production-ready** (Zcash, Scroll)
- ✅ **Good parallelization**

### Cons
- ⚠️ Higher gas than Groth16 (~500K vs ~200K)
- ⚠️ Slower than Plonky2
- ⚠️ More complex than Circom
- ⚠️ Steeper learning curve

### When to Use
- No trusted setup acceptable
- Need production-proven system
- Building on Ethereum L2s (many use Halo2)

---

## Option 5: Nova / Folding Schemes

**Incremental verification** - fold multiple computations into one proof.

### Performance

```
Proving time: ~1s per fold
Proof size: ~10KB (compressed)
Gas cost: Variable
Setup: No trusted setup
```

### Architecture

```rust
use nova_snark::{
    traits::circuit::TrivialTestCircuit,
    PublicParams, RecursiveSNARK,
};

// Define step circuit (verify one BLS signature)
struct BLSStepCircuit {
    signature: G1Affine,
    pub_key: G1Affine,
    message: Fp,
}

impl StepCircuit for BLSStepCircuit {
    fn synthesize(&self, cs: &mut ConstraintSystem) {
        // Verify one BLS signature
        // ...
    }
}

// Fold multiple signatures
let mut recursive_snark = RecursiveSNARK::new(&pp, &step_circuit_1)?;

for step_circuit in step_circuits {
    recursive_snark.prove_step(&pp, &step_circuit)?;
}

// Compress final proof
let compressed = recursive_snark.compress(&pp)?;
```

### Pros
- ✅ **Incremental proving** (add more computations to existing proof)
- ✅ **No trusted setup**
- ✅ **Efficient for sequential computations**
- ✅ **Can verify infinite computations**

### Cons
- ⚠️ **Experimental** (not production-ready)
- ⚠️ **Complex to implement**
- ⚠️ **Limited tooling**
- ⚠️ **Verification costs not well-defined**

### When to Use
- Building incrementally verifiable systems
- Research/experimental projects
- Long-running computations

---

## Option 6: Optimistic Verification

**No ZK proving** - use fraud proofs and challenge periods.

### Performance

```
Proving time: 0s (no proving)
Proof size: 0 bytes
Gas cost: ~50K (optimistic path)
Gas cost: ~300K (challenge path)
Latency: 1-7 days (challenge period)
```

### Architecture

```solidity
contract OptimisticAptosLightClient {
    uint256 constant CHALLENGE_PERIOD = 7 days;
    uint256 constant BOND_AMOUNT = 10 ether;

    struct PendingUpdate {
        bytes32 newStateRoot;
        uint64 newVersion;
        uint256 timestamp;
        address proposer;
    }

    mapping(bytes32 => PendingUpdate) public pendingUpdates;

    function proposeUpdate(
        bytes32 newStateRoot,
        uint64 newVersion,
        bytes32 updateHash
    ) external payable {
        require(msg.value >= BOND_AMOUNT);

        pendingUpdates[updateHash] = PendingUpdate({
            newStateRoot: newStateRoot,
            newVersion: newVersion,
            timestamp: block.timestamp,
            proposer: msg.sender
        });
    }

    function challengeUpdate(
        bytes32 updateHash,
        bytes calldata signatures,
        bytes[] calldata publicKeys
    ) external {
        PendingUpdate memory update = pendingUpdates[updateHash];
        require(block.timestamp < update.timestamp + CHALLENGE_PERIOD);

        // Verify fraud proof (direct BLS verification)
        bool valid = _verifyBLSDirectly(
            update.newStateRoot,
            signatures,
            publicKeys
        );

        if (!valid) {
            // Slash proposer
            payable(msg.sender).transfer(BOND_AMOUNT);
            delete pendingUpdates[updateHash];
        }
    }

    function finalizeUpdate(bytes32 updateHash) external {
        PendingUpdate memory update = pendingUpdates[updateHash];
        require(block.timestamp >= update.timestamp + CHALLENGE_PERIOD);

        // No challenge - apply update
        trustedState = update.newStateRoot;
        payable(update.proposer).transfer(BOND_AMOUNT);
        delete pendingUpdates[updateHash];
    }
}
```

### Pros
- ✅ **Lowest gas cost** (~50K optimistic)
- ✅ **No proving overhead**
- ✅ **Simple implementation**
- ✅ **Proven model** (Optimism, Arbitrum)

### Cons
- ⚠️ **Latency** (1-7 days to finalize)
- ⚠️ **Economic security only** (not cryptographic)
- ⚠️ **Requires watchers/challengers**
- ⚠️ **Bond requirements**

### When to Use
- Latency acceptable (non-urgent updates)
- Economic security sufficient
- Want lowest gas costs
- Have reliable challengers

---

## Comprehensive Comparison Table

| System | Proving | Proof Size | Gas | Setup | Maturity | Dev Time | Best For |
|--------|---------|------------|-----|-------|----------|----------|----------|
| **Circom + Groth16** | 5-30s | 256B | 200K | Trusted | ⭐⭐⭐⭐⭐ | 2-3 weeks | **Production** |
| SP1 (zkVM) | Hours | 1-2KB | 250K | None | ⭐⭐⭐⭐ | 1-2 weeks | General programs |
| Direct EIP-2537 | 0s | N/A | 300K | None | ⭐⭐⭐⭐⭐ | 1 week | Small validator sets |
| Plonky2 | 170ms | 43KB | 1M | None | ⭐⭐⭐ | 3-4 weeks | Speed critical |
| Halo2 | 1-5s | 2-5KB | 500K | None | ⭐⭐⭐⭐ | 3-4 weeks | No trusted setup |
| Nova/Folding | ~1s | 10KB | ??? | None | ⭐⭐ | 6-8 weeks | Research |
| Optimistic | 0s | 0B | 50K | None | ⭐⭐⭐⭐ | 1 week | Low latency OK |

---

## Migration Path from SP1

### Phase 1: Quick Win (Week 1)
```bash
# Add Circom to your project
npm install -g circom snarkjs

# Use existing circuit libraries
git clone https://github.com/0xPARC/circom-pairing
git clone https://github.com/succinctlabs/eth-proof-of-consensus
```

### Phase 2: Implement Circom Circuit (Week 2-3)
```circom
// Adapt from Succinct's Ethereum consensus client
// circuits/aptos_bls_verify.circom

template AptosBLSVerify(MAX_VALIDATORS) {
    // Same inputs as your SP1 guest program
    signal input messageHash;
    signal input signatures[MAX_VALIDATORS][2][2];
    // ... rest of circuit
}
```

### Phase 3: Integration (Week 4)
```rust
// Keep your existing Rust host
// Replace SP1 proving with Circom

use circom_rs::{CircomBuilder, CircomConfig};

async fn generate_proof(state_proof: &AptosStateProof) -> Result<Proof> {
    // 1. Build witness (same as SP1 stdin)
    let witness = build_witness(state_proof)?;

    // 2. Generate proof using Circom
    let mut builder = CircomBuilder::new(CircomConfig::default());
    builder.setup("circuits/aptos_bls_verify_final.zkey")?;
    builder.push_input("messageHash", message_hash);
    builder.push_input("signatures", signatures);
    // ...

    let proof = builder.prove()?;

    Ok(proof)
}
```

### Phase 4: Deploy (Week 5)
```solidity
// Update your Ethereum contract
import "./Groth16Verifier.sol"; // Generated by snarkjs

contract DiemLightClient {
    Groth16Verifier immutable verifier;

    function updateState(
        uint256[8] calldata proof,
        uint256[8] calldata publicInputs
    ) external {
        require(verifier.verifyProof(proof, publicInputs));
        trustedState = newState;
    }
}
```

---

## Recommended Approach

**For your Aptos light client bridge:**

### Best Option: Circom + Groth16

**Why:**
1. **10-100x faster** than SP1 (5-30s vs hours)
2. **Proven at scale** (Ethereum consensus, Succinct, zkSync)
3. **Constant gas costs** regardless of validator count
4. **Tiny proofs** (256 bytes)
5. **Good tooling** and community support

**Implementation timeline:**
- Week 1: Setup Circom, study existing BLS circuits
- Week 2-3: Implement Aptos-specific circuit
- Week 4: Integrate with existing Rust infrastructure
- Week 5: Test, audit, deploy

**Cost comparison:**
```
SP1 (GPU):        10-15 min proving + $730/month GPU
Circom (CPU):     5-30s proving + $0/month (or $100 for beefy CPU)
Circom (GPU):     1-5s proving + $730/month GPU

Gas costs are similar: ~200K vs ~250K
```

### Alternative: Direct EIP-2537 (If Acceptable)

If you have:
- Small validator set (< 50)
- Low update frequency (< 1/hour)
- Gas costs not critical

Then **skip ZK entirely** and use direct BLS verification:
- 0s proving time
- Simple implementation
- ~300K gas

---

## Code Examples

All example code for each approach available at:
- Circom: `https://github.com/succinctlabs/eth-proof-of-consensus`
- Direct BLS: `https://github.com/ethereum/EIPs/blob/master/assets/eip-2537/`
- Plonky2: `https://github.com/0xPolygonZero/plonky2`
- Halo2: `https://github.com/axiom-crypto/halo2-lib`

---

## Conclusion

**Stop using SP1 for BLS verification.** It's a general-purpose zkVM optimized for arbitrary programs, not application-specific circuits.

**Switch to Circom + Groth16** for:
- 10-100x faster proving
- Lower gas costs
- Proven production use
- Better developer experience

**Total migration time: 3-5 weeks**
**Proving improvement: Hours → Seconds**
