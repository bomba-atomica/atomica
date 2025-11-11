// Equality Check AIR for Plonky3
//
// This module defines an Algebraic Intermediate Representation (AIR) that proves
// two values are equal: a == b
//
// This uses Plonky3's modular STARK framework with the Mersenne31 field.

use anyhow::Result;
use p3_air::{Air, AirBuilder, BaseAir};
use p3_challenger::{HashChallenger, SerializingChallenger32};
use p3_circle::CirclePcs;
use p3_commit::ExtensionMmcs;
use p3_field::extension::BinomialExtensionField;
use p3_field::Field;
use p3_keccak::Keccak256Hash;
use p3_matrix::dense::RowMajorMatrix;
use p3_matrix::Matrix;
use p3_merkle_tree::MerkleTreeMmcs;
use p3_mersenne_31::Mersenne31;
use p3_symmetric::{CompressionFunctionFromHasher, SerializingHasher32};
use p3_uni_stark::{prove, verify, StarkConfig};
use serde::{Deserialize, Serialize};

/// Type alias for our field
pub type F = Mersenne31;

/// Equality AIR structure
#[derive(Clone)]
pub struct EqualityAir {
    pub num_rows: usize,
}

impl<F: Field> BaseAir<F> for EqualityAir {
    fn width(&self) -> usize {
        2 // Two columns: a and b
    }
}

impl<AB: AirBuilder> Air<AB> for EqualityAir
where
    AB::F: Field,
{
    fn eval(&self, builder: &mut AB) {
        let main = builder.main();
        let local = main.row_slice(0).expect("Failed to get row slice");

        // Get the two columns: a and b
        let a = local[0].clone();
        let b = local[1].clone();

        // Add constraint: a - b == 0
        builder.assert_zero(a - b);
    }
}

/// Generate execution trace for equality check
///
/// The trace has 2 columns: [a, b]
/// With num_rows rows, where all rows contain the same values
fn generate_trace(num_rows: usize, a_val: u32, b_val: u32) -> RowMajorMatrix<F> {
    let a_field = F::new_checked(a_val).expect("Value must be valid for Mersenne31 field");
    let b_field = F::new_checked(b_val).expect("Value must be valid for Mersenne31 field");

    let mut values = Vec::with_capacity(num_rows * 2);

    for _ in 0..num_rows {
        values.push(a_field);
        values.push(b_field);
    }

    RowMajorMatrix::new(values, 2)
}

// Type aliases for STARK configuration
type Val = Mersenne31;
type Challenge = BinomialExtensionField<Val, 3>;

type MyHash = Keccak256Hash;
type MyCompress = CompressionFunctionFromHasher<u8, MyHash, 2, 32>;
type MyHasher = SerializingHasher32<MyHash>;

type ValMmcs = MerkleTreeMmcs<
    <Val as Field>::Packing,
    <Val as Field>::Packing,
    MyHash,
    MyCompress,
    32,
>;
type ChallengeMmcs = ExtensionMmcs<Val, Challenge, ValMmcs>;

type MyPcs = CirclePcs<Val, ValMmcs, ChallengeMmcs>;
type MyChallenger = SerializingChallenger32<Val, HashChallenger<u8, MyHash, 32>>;

type MyConfig = StarkConfig<MyPcs, Challenge, MyChallenger>;

/// Create STARK configuration
fn create_stark_config() -> MyConfig {
    let hash = MyHash;
    let compress = MyCompress::new(hash);
    let val_mmcs = ValMmcs::new(hash, compress);
    let challenge_mmcs = ChallengeMmcs::new(val_mmcs);

    let pcs = MyPcs::new(challenge_mmcs);

    StarkConfig::new(pcs)
}

/// Proof that two values are equal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EqualityProof {
    pub proof_bytes: Vec<u8>,
    pub a: u32,
    pub b: u32,
}

/// Generate a proof that a == b
///
/// # Arguments
/// * `a` - First value
/// * `b` - Second value (must equal `a`)
///
/// # Returns
/// * `Ok(EqualityProof)` - Proof that a == b
/// * `Err(_)` - If a != b or proof generation fails
pub fn prove_equality(a: u32, b: u32) -> Result<EqualityProof> {
    // Verify inputs are actually equal
    if a != b {
        anyhow::bail!("Cannot prove equality: {} != {}", a, b);
    }

    // Use a small trace for simple equality (must be power of 2)
    const NUM_ROWS: usize = 32;

    // Generate trace
    let trace = generate_trace(NUM_ROWS, a, b);

    // Create AIR
    let air = EqualityAir { num_rows: NUM_ROWS };

    // Setup STARK configuration
    let config = create_stark_config();

    // Create challenger
    let mut challenger = MyChallenger::from_hasher(vec![], MyHash);

    // Generate proof
    let proof = prove::<MyConfig, _>(&config, &air, &mut challenger, trace, &vec![]);

    // Serialize proof to bytes
    let proof_bytes = bincode::serialize(&proof)
        .map_err(|e| anyhow::anyhow!("Failed to serialize proof: {}", e))?;

    Ok(EqualityProof {
        proof_bytes,
        a,
        b,
    })
}

/// Verify a proof that two values are equal
///
/// # Arguments
/// * `proof` - The equality proof to verify
///
/// # Returns
/// * `Ok(true)` - Proof is valid
/// * `Err(_)` - Verification failed
pub fn verify_equality(proof: &EqualityProof) -> Result<bool> {
    const NUM_ROWS: usize = 32;

    // Basic check: the proof should have equal values
    if proof.a != proof.b {
        anyhow::bail!("Proof values are not equal: {} != {}", proof.a, proof.b);
    }

    // Create AIR
    let air = EqualityAir { num_rows: NUM_ROWS };

    // Setup STARK configuration
    let config = create_stark_config();

    // Create challenger
    let mut challenger = MyChallenger::from_hasher(vec![], MyHash);

    // Deserialize proof
    let stark_proof = bincode::deserialize(&proof.proof_bytes)
        .map_err(|e| anyhow::anyhow!("Failed to deserialize proof: {}", e))?;

    // Verify proof
    verify(&config, &air, &mut challenger, &stark_proof, &vec![])
        .map_err(|e| anyhow::anyhow!("Verification failed: {:?}", e))?;

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_equality_happy_path() -> Result<()> {
        let a = 42;
        let b = 42;

        let proof = prove_equality(a, b)?;
        let verified = verify_equality(&proof)?;

        assert!(verified, "Proof should verify for equal values");
        Ok(())
    }

    #[test]
    fn test_equality_should_fail() {
        let a = 42;
        let b = 43;

        let result = prove_equality(a, b);
        assert!(result.is_err(), "Should not be able to prove a != b");
    }

    #[test]
    fn test_equality_zero_values() -> Result<()> {
        let a = 0;
        let b = 0;

        let proof = prove_equality(a, b)?;
        let verified = verify_equality(&proof)?;

        assert!(verified, "Proof should verify for zero values");
        Ok(())
    }

    #[test]
    fn test_equality_large_values() -> Result<()> {
        let a = 999999;
        let b = 999999;

        let proof = prove_equality(a, b)?;
        let verified = verify_equality(&proof)?;

        assert!(verified, "Proof should verify for large values");
        Ok(())
    }

    #[test]
    fn test_trace_generation() {
        let trace = generate_trace(32, 42, 42);
        assert_eq!(trace.width(), 2);
        assert_eq!(trace.height(), 32);

        // Check all rows have the correct values
        for row_idx in 0..32 {
            assert_eq!(trace.get(row_idx, 0), Some(F::new_checked(42).unwrap()));
            assert_eq!(trace.get(row_idx, 1), Some(F::new_checked(42).unwrap()));
        }
    }

    #[test]
    fn test_proof_serialization() -> Result<()> {
        let a = 12345;
        let b = 12345;

        // Generate proof
        let proof = prove_equality(a, b)?;

        // Serialize to JSON
        let serialized = serde_json::to_string(&proof)?;

        // Deserialize back
        let deserialized: EqualityProof = serde_json::from_str(&serialized)?;

        // Verify deserialized proof
        let verified = verify_equality(&deserialized)?;
        assert!(verified, "Deserialized proof should verify");

        Ok(())
    }
}
