//! STARK-in-SNARK verifier using Groth16
//!
//! This module provides a two-layer verification system where a STARK proof
//! is verified inside a Groth16 SNARK circuit. This enables EVM-compatible
//! verification on the BN254 curve.
//!
//! ## Architecture
//!
//! ```text
//! ┌─────────────────────────────────────────────────────────┐
//! │  Inner Layer: STARK Proof (Plonky3)                     │
//! │  - Fast proving with Mersenne31 field                   │
//! │  - Transparent setup (no trusted ceremony)              │
//! │  - Native recursion support                             │
//! └─────────────────────────────────────────────────────────┘
//!                          │
//!                          ▼
//! ┌─────────────────────────────────────────────────────────┐
//! │  Outer Layer: SNARK Proof (Groth16)                     │
//! │  - Verifies inner STARK proof in R1CS circuit           │
//! │  - Uses BN254 curve (EVM-compatible)                    │
//! │  - Compact proof (~200 bytes)                           │
//! │  - Fast on-chain verification                           │
//! └─────────────────────────────────────────────────────────┘
//! ```
//!
//! Note: This is a simplified demonstration. A production implementation would
//! require implementing the full STARK verifier as R1CS constraints.

use std::time::Instant;

use anyhow::Result;
use ark_bn254::{Bn254, Fr as BnFr};
use ark_groth16::{Groth16, Proof as Groth16Proof, ProvingKey, VerifyingKey, prepare_verifying_key};
use ark_r1cs_std::{
    prelude::*,
    fields::fp::FpVar,
};
use ark_relations::r1cs::{ConstraintSynthesizer, ConstraintSystemRef, SynthesisError};
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize};
use ark_snark::{CircuitSpecificSetupSNARK, SNARK};
use ark_std::rand::{CryptoRng, RngCore};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::native_stark::NativeStarkProof;
use super::types::{ProofWrapper, VerificationMethod, VerificationResult, Verifier};

/// Wrapped proof containing both inner STARK and outer SNARK
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WrappedProof {
    /// The inner STARK proof
    pub inner_stark_proof: NativeStarkProof,

    /// The outer Groth16 proof (serialized)
    pub outer_snark_proof: Vec<u8>,

    /// Public inputs to the SNARK circuit
    pub public_inputs: Vec<String>,
}

/// Circuit that verifies a STARK proof
///
/// This circuit takes the STARK proof as a private witness and verifies it,
/// outputting the verified values as public inputs.
#[derive(Clone)]
struct StarkVerifierCircuit {
    /// Hash of the STARK proof (acts as commitment)
    proof_hash: Option<Vec<u8>>,

    /// The values that were proven equal (a, b)
    verified_a: Option<u32>,
    verified_b: Option<u32>,
}

impl StarkVerifierCircuit {
    fn new(proof_hash: Vec<u8>, a: u32, b: u32) -> Self {
        Self {
            proof_hash: Some(proof_hash),
            verified_a: Some(a),
            verified_b: Some(b),
        }
    }

    fn empty() -> Self {
        Self {
            proof_hash: None,
            verified_a: None,
            verified_b: None,
        }
    }
}

impl ConstraintSynthesizer<BnFr> for StarkVerifierCircuit {
    fn generate_constraints(self, cs: ConstraintSystemRef<BnFr>) -> Result<(), SynthesisError> {
        // In a production implementation, this circuit would:
        // 1. Take the full STARK proof as private witness
        // 2. Implement the FRI verification algorithm in R1CS constraints
        // 3. Verify Merkle proofs for the commitment scheme
        // 4. Check all STARK constraints
        //
        // For this demo, we create a simplified circuit that:
        // - Takes a hash of the STARK proof as witness
        // - Verifies basic equality constraints
        // - Outputs the verified values as public

        // Allocate the verified values as field elements
        // Private witnesses
        let a_witness = FpVar::new_witness(cs.clone(), || {
            self.verified_a
                .map(|v| BnFr::from(v as u64))
                .ok_or(SynthesisError::AssignmentMissing)
        })?;

        let b_witness = FpVar::new_witness(cs.clone(), || {
            self.verified_b
                .map(|v| BnFr::from(v as u64))
                .ok_or(SynthesisError::AssignmentMissing)
        })?;

        // Public input: the value we're proving (a == b)
        let a_public = FpVar::new_input(cs.clone(), || {
            self.verified_a
                .map(|v| BnFr::from(v as u64))
                .ok_or(SynthesisError::AssignmentMissing)
        })?;

        // Constraints:
        // 1. Private a equals public a
        a_witness.enforce_equal(&a_public)?;

        // 2. a equals b (the core equality check)
        a_witness.enforce_equal(&b_witness)?;

        // 3. Use the proof hash in a constraint (dummy constraint for demo)
        // In a real implementation, this would be the full STARK verification
        if let Some(hash) = &self.proof_hash {
            // Convert first byte of hash to field element as simple constraint
            let hash_byte = BnFr::from(hash[0] as u64);
            let hash_var = FpVar::new_witness(cs.clone(), || Ok(hash_byte))?;
            // Ensure hash is nonzero (proof exists)
            hash_var.is_zero()?.enforce_equal(&Boolean::FALSE)?;
        }

        Ok(())
    }
}

/// SNARK wrapper for STARK proofs
pub struct SnarkWrapper {
    /// Groth16 proving key
    proving_key: ProvingKey<Bn254>,

    /// Groth16 verifying key
    verifying_key: VerifyingKey<Bn254>,
}

impl SnarkWrapper {
    /// Create a new SNARK wrapper with a trusted setup
    ///
    /// WARNING: This uses a test random number generator.
    /// Production systems must use a secure setup ceremony.
    pub fn new<R: RngCore + CryptoRng>(rng: &mut R) -> Result<Self> {
        // Create an empty circuit for setup
        let circuit = StarkVerifierCircuit::empty();

        // Run Groth16 setup
        let (proving_key, verifying_key) =
            Groth16::<Bn254>::setup(circuit, rng)
                .map_err(|e| anyhow::anyhow!("Setup failed: {:?}", e))?;

        Ok(Self {
            proving_key,
            verifying_key,
        })
    }

    /// Create a wrapper from existing keys (deserialized)
    pub fn from_keys(proving_key: ProvingKey<Bn254>, verifying_key: VerifyingKey<Bn254>) -> Self {
        Self {
            proving_key,
            verifying_key,
        }
    }

    /// Get the verifying key
    pub fn verifying_key(&self) -> &VerifyingKey<Bn254> {
        &self.verifying_key
    }

    /// Compute hash of STARK proof for the circuit
    fn hash_stark_proof(proof: &NativeStarkProof) -> Vec<u8> {
        let mut hasher = Sha256::new();
        hasher.update(&proof.proof_bytes);
        hasher.update(&proof.a.to_le_bytes());
        hasher.update(&proof.b.to_le_bytes());
        hasher.update(&proof.num_rows.to_le_bytes());
        hasher.finalize().to_vec()
    }
}

impl ProofWrapper for SnarkWrapper {
    type InnerProof = NativeStarkProof;
    type OuterProof = WrappedProof;

    fn wrap(&self, inner_proof: &Self::InnerProof) -> Result<Self::OuterProof> {
        // First, verify the STARK proof is valid
        // (In production, this might be optional if we trust the prover)
        let native_verifier = super::native_stark::NativeStarkVerifier::new(inner_proof.num_rows);
        native_verifier.verify(inner_proof)?;

        // Compute hash of the STARK proof
        let proof_hash = Self::hash_stark_proof(inner_proof);

        // Create the circuit with the STARK proof data
        let circuit = StarkVerifierCircuit::new(proof_hash, inner_proof.a, inner_proof.b);

        // Generate the Groth16 proof
        let mut rng = ark_std::rand::thread_rng();
        let proof = Groth16::<Bn254>::prove(&self.proving_key, circuit, &mut rng)
            .map_err(|e| anyhow::anyhow!("SNARK proving failed: {:?}", e))?;

        // Serialize the Groth16 proof
        let mut proof_bytes = Vec::new();
        proof
            .serialize_compressed(&mut proof_bytes)
            .map_err(|e| anyhow::anyhow!("Failed to serialize SNARK proof: {}", e))?;

        Ok(WrappedProof {
            inner_stark_proof: inner_proof.clone(),
            outer_snark_proof: proof_bytes,
            public_inputs: vec![inner_proof.a.to_string()],
        })
    }
}

/// SNARK verifier for wrapped proofs
pub struct SnarkVerifier {
    /// Groth16 verifying key
    verifying_key: VerifyingKey<Bn254>,
}

impl SnarkVerifier {
    /// Create a new SNARK verifier
    pub fn new(verifying_key: VerifyingKey<Bn254>) -> Self {
        Self { verifying_key }
    }

    /// Verify with detailed result
    pub fn verify_with_result(&self, proof: &WrappedProof) -> Result<VerificationResult> {
        let start = Instant::now();

        self.verify(proof)?;

        let elapsed = start.elapsed();

        Ok(VerificationResult::new(
            true,
            VerificationMethod::StarkInSnark,
            elapsed.as_micros() as u64,
        )
        .with_metadata(format!(
            "Verified STARK-in-SNARK proof for a={}, b={} | Outer SNARK proof: {} bytes",
            proof.inner_stark_proof.a,
            proof.inner_stark_proof.b,
            proof.outer_snark_proof.len()
        )))
    }
}

impl Verifier for SnarkVerifier {
    type Proof = WrappedProof;

    fn verify(&self, proof: &Self::Proof) -> Result<()> {
        // Deserialize the Groth16 proof
        let groth16_proof = Groth16Proof::<Bn254>::deserialize_compressed(&proof.outer_snark_proof[..])
            .map_err(|e| anyhow::anyhow!("Failed to deserialize SNARK proof: {}", e))?;

        // Parse public inputs
        let public_inputs: Vec<BnFr> = proof
            .public_inputs
            .iter()
            .map(|s| {
                let val: u32 = s.parse().map_err(|e| {
                    anyhow::anyhow!("Failed to parse public input '{}': {}", s, e)
                })?;
                Ok(BnFr::from(val as u64))
            })
            .collect::<Result<Vec<_>>>()?;

        // Prepare verifying key and verify the Groth16 proof
        let pvk = prepare_verifying_key(&self.verifying_key);
        Groth16::<Bn254>::verify_proof(&pvk, &groth16_proof, &public_inputs)
            .map_err(|e| anyhow::anyhow!("SNARK verification failed: {:?}", e))?;

        Ok(())
    }

    fn method(&self) -> VerificationMethod {
        VerificationMethod::StarkInSnark
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::eq_air::prove_equality;
    use ark_std::rand::thread_rng;

    #[test]
    fn test_snark_wrapper() -> Result<()> {
        let mut rng = thread_rng();

        // Setup SNARK wrapper
        let wrapper = SnarkWrapper::new(&mut rng)?;

        // Generate a STARK proof
        let equality_proof = prove_equality(42, 42)?;
        let stark_proof = NativeStarkProof {
            proof_bytes: equality_proof.proof_bytes,
            a: equality_proof.a,
            b: equality_proof.b,
            num_rows: 32,
        };

        // Wrap the STARK proof in a SNARK
        let wrapped_proof = wrapper.wrap(&stark_proof)?;

        // Verify the wrapped proof
        let verifier = SnarkVerifier::new(wrapper.verifying_key().clone());
        verifier.verify(&wrapped_proof)?;

        Ok(())
    }

    #[test]
    fn test_snark_verifier_with_result() -> Result<()> {
        let mut rng = thread_rng();

        let wrapper = SnarkWrapper::new(&mut rng)?;

        let equality_proof = prove_equality(100, 100)?;
        let stark_proof = NativeStarkProof {
            proof_bytes: equality_proof.proof_bytes,
            a: equality_proof.a,
            b: equality_proof.b,
            num_rows: 32,
        };

        let wrapped_proof = wrapper.wrap(&stark_proof)?;

        let verifier = SnarkVerifier::new(wrapper.verifying_key().clone());
        let result = verifier.verify_with_result(&wrapped_proof)?;

        assert!(result.valid);
        assert_eq!(result.method, VerificationMethod::StarkInSnark);
        assert!(result.verification_time_us > 0);
        assert!(result.metadata.is_some());

        Ok(())
    }

    #[test]
    fn test_verifier_method() {
        let mut rng = thread_rng();
        let wrapper = SnarkWrapper::new(&mut rng).unwrap();
        let verifier = SnarkVerifier::new(wrapper.verifying_key().clone());
        assert_eq!(verifier.method(), VerificationMethod::StarkInSnark);
    }

    #[test]
    fn test_proof_hash_computation() {
        let proof = NativeStarkProof {
            proof_bytes: vec![1, 2, 3, 4],
            a: 42,
            b: 42,
            num_rows: 32,
        };

        let hash1 = SnarkWrapper::hash_stark_proof(&proof);
        let hash2 = SnarkWrapper::hash_stark_proof(&proof);

        // Hashes should be deterministic
        assert_eq!(hash1, hash2);
        assert_eq!(hash1.len(), 32); // SHA-256 output

        // Different proofs should have different hashes
        let proof2 = NativeStarkProof {
            proof_bytes: vec![1, 2, 3, 5], // Changed one byte
            a: 42,
            b: 42,
            num_rows: 32,
        };
        let hash3 = SnarkWrapper::hash_stark_proof(&proof2);
        assert_ne!(hash1, hash3);
    }
}
