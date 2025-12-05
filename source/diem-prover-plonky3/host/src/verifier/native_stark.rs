//! Native STARK verifier using Plonky3
//!
//! This module provides direct verification of STARK proofs using Plonky3's
//! native verification system. This is the fastest verification method but
//! is not EVM-compatible.

use std::marker::PhantomData;
use std::time::Instant;

use anyhow::Result;
use p3_challenger::{HashChallenger, SerializingChallenger32};
use p3_circle::CirclePcs;
use p3_commit::ExtensionMmcs;
use p3_field::extension::BinomialExtensionField;
use p3_fri::FriParameters;
use p3_keccak::Keccak256Hash;
use p3_merkle_tree::MerkleTreeMmcs;
use p3_mersenne_31::Mersenne31;
use p3_symmetric::{CompressionFunctionFromHasher, SerializingHasher};
use p3_uni_stark::{verify, StarkConfig};
use serde::{Deserialize, Serialize};

use super::types::{VerificationMethod, VerificationResult, Verifier};
use crate::eq_air::{EqualityAir, F};

// Type aliases for Plonky3 configuration
type Val = Mersenne31;
type Challenge = BinomialExtensionField<Val, 3>;
type ByteHash = Keccak256Hash;
type FieldHash = SerializingHasher<ByteHash>;
type MyCompress = CompressionFunctionFromHasher<ByteHash, 2, 32>;
type ValMmcs = MerkleTreeMmcs<Val, u8, FieldHash, MyCompress, 32>;
type ChallengeMmcs = ExtensionMmcs<Val, Challenge, ValMmcs>;
type Challenger = SerializingChallenger32<Val, HashChallenger<u8, ByteHash, 32>>;
type Pcs = CirclePcs<Val, ValMmcs, ChallengeMmcs>;
type MyConfig = StarkConfig<Pcs, Challenge, Challenger>;

/// Native STARK proof structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NativeStarkProof {
    /// The serialized STARK proof bytes
    pub proof_bytes: Vec<u8>,

    /// Value 'a' that was proven equal
    pub a: u32,

    /// Value 'b' that was proven equal
    pub b: u32,

    /// Number of rows in the execution trace
    pub num_rows: usize,
}

/// Native STARK verifier
pub struct NativeStarkVerifier {
    /// STARK configuration
    config: MyConfig,

    /// Number of rows expected in the trace
    num_rows: usize,
}

impl NativeStarkVerifier {
    /// Create a new native STARK verifier
    ///
    /// # Arguments
    /// * `num_rows` - Expected number of rows in the execution trace (must match prover)
    pub fn new(num_rows: usize) -> Self {
        // Setup configuration matching the prover
        let byte_hash = ByteHash {};
        let field_hash = FieldHash::new(Keccak256Hash {});
        let compress = MyCompress::new(byte_hash);
        let val_mmcs = ValMmcs::new(field_hash, compress);
        let challenge_mmcs = ChallengeMmcs::new(val_mmcs.clone());

        let fri_config = FriParameters {
            log_blowup: 1,
            num_queries: 100,
            proof_of_work_bits: 16,
            log_final_poly_len: 1,
            mmcs: challenge_mmcs,
        };

        let pcs = Pcs {
            mmcs: val_mmcs,
            fri_params: fri_config,
            _phantom: PhantomData,
        };

        let challenger = Challenger::from_hasher(vec![], byte_hash);
        let config = MyConfig::new(pcs, challenger);

        Self { config, num_rows }
    }

    /// Verify a native STARK proof with detailed result
    pub fn verify_with_result(&self, proof: &NativeStarkProof) -> Result<VerificationResult> {
        let start = Instant::now();

        // Perform verification
        self.verify(proof)?;

        let elapsed = start.elapsed();

        Ok(VerificationResult::new(
            true,
            VerificationMethod::NativeStark,
            elapsed.as_micros() as u64,
        )
        .with_metadata(format!(
            "Verified STARK proof for a={}, b={} with {} trace rows",
            proof.a, proof.b, proof.num_rows
        )))
    }
}

impl Verifier for NativeStarkVerifier {
    type Proof = NativeStarkProof;

    fn verify(&self, proof: &Self::Proof) -> Result<()> {
        // Sanity check: values should be equal
        if proof.a != proof.b {
            anyhow::bail!(
                "Proof values are not equal: {} != {}",
                proof.a,
                proof.b
            );
        }

        // Ensure proof was generated with expected trace size
        if proof.num_rows != self.num_rows {
            anyhow::bail!(
                "Proof trace size mismatch: expected {} rows, got {}",
                self.num_rows,
                proof.num_rows
            );
        }

        // Create AIR with expected values (must match what was used in proving)
        let air = EqualityAir {
            num_rows: proof.num_rows,
            expected_a: F::new_checked(proof.a).expect("Value must fit in field"),
            expected_b: F::new_checked(proof.b).expect("Value must fit in field"),
        };

        // Deserialize proof
        let stark_proof = bincode::deserialize(&proof.proof_bytes)
            .map_err(|e| anyhow::anyhow!("Failed to deserialize STARK proof: {}", e))?;

        // Verify proof using Plonky3
        verify(&self.config, &air, &stark_proof, &vec![])
            .map_err(|e| anyhow::anyhow!("STARK verification failed: {:?}", e))?;

        Ok(())
    }

    fn method(&self) -> VerificationMethod {
        VerificationMethod::NativeStark
    }
}

impl Default for NativeStarkVerifier {
    fn default() -> Self {
        // Default to 32 rows (matches the prover default)
        Self::new(32)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::eq_air::prove_equality;

    #[test]
    fn test_native_stark_verifier() -> Result<()> {
        let verifier = NativeStarkVerifier::default();

        // Generate a proof
        let equality_proof = prove_equality(42, 42)?;

        // Convert to NativeStarkProof format
        let proof = NativeStarkProof {
            proof_bytes: equality_proof.proof_bytes,
            a: equality_proof.a,
            b: equality_proof.b,
            num_rows: 32,
        };

        // Verify using the verifier trait
        verifier.verify(&proof)?;

        Ok(())
    }

    #[test]
    fn test_native_stark_verifier_with_result() -> Result<()> {
        let verifier = NativeStarkVerifier::default();

        // Generate a proof
        let equality_proof = prove_equality(100, 100)?;

        let proof = NativeStarkProof {
            proof_bytes: equality_proof.proof_bytes,
            a: equality_proof.a,
            b: equality_proof.b,
            num_rows: 32,
        };

        // Verify with detailed result
        let result = verifier.verify_with_result(&proof)?;

        assert!(result.valid);
        assert_eq!(result.method, VerificationMethod::NativeStark);
        assert!(result.verification_time_us > 0);
        assert!(result.metadata.is_some());

        Ok(())
    }

    #[test]
    fn test_native_stark_verifier_rejects_unequal() -> Result<()> {
        let verifier = NativeStarkVerifier::default();

        // Create an invalid proof with unequal values
        let proof = NativeStarkProof {
            proof_bytes: vec![0; 100], // dummy bytes
            a: 42,
            b: 43, // Different value
            num_rows: 32,
        };

        // Should fail validation
        let result = verifier.verify(&proof);
        assert!(result.is_err());

        Ok(())
    }

    #[test]
    fn test_verifier_method() {
        let verifier = NativeStarkVerifier::default();
        assert_eq!(verifier.method(), VerificationMethod::NativeStark);
    }
}
