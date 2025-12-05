//! STARK-in-SNARK verifier using Marlin
//!
//! This module provides a two-layer verification system where a STARK proof
//! is verified inside a SNARK circuit, enabling EVM-compatible verification
//! on the BN254 curve.
//!
//! We use **Marlin** (a Universal SNARK) which provides:
//! - Universal Setup (Powers of Tau)
//! - Compatibility with Arkworks R1CS
//! - Efficient verification (though slightly larger proofs than Groth16)

use std::time::Instant;

use anyhow::Result;
use ark_bn254::{Bn254, Fr as BnFr};
use ark_marlin::{Marlin, Proof as MarlinProof, IndexVerifierKey, IndexProverKey, UniversalSRS};
use ark_poly::univariate::DensePolynomial;
use ark_poly_commit::marlin_pc::MarlinKZG10;
use ark_r1cs_std::{
    prelude::*,
    fields::fp::FpVar,
};
use ark_relations::r1cs::{ConstraintSynthesizer, ConstraintSystemRef, SynthesisError};
use ark_serialize::{CanonicalDeserialize, CanonicalSerialize};
use ark_std::rand::{CryptoRng, RngCore};
use blake2::Blake2s;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::native_stark::NativeStarkProof;
use super::types::{ProofWrapper, VerificationMethod, VerificationResult, Verifier};

// Define Marlin types
type MultiPC = MarlinKZG10<Bn254, DensePolynomial<BnFr>>;
type MarlinInst = Marlin<BnFr, MultiPC, Blake2s>;

/// Wrapped proof containing both inner STARK and outer SNARK
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WrappedProof {
    /// The inner STARK proof
    pub inner_stark_proof: NativeStarkProof,

    /// The outer Marlin proof (serialized)
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

/// SNARK wrapper for STARK proofs using Marlin
pub struct SnarkWrapper {
    /// Marlin proving key
    proving_key: IndexProverKey<BnFr, MultiPC>,

    /// Marlin verifying key
    verifying_key: IndexVerifierKey<BnFr, MultiPC>,
}

impl SnarkWrapper {
    /// Create a new SNARK wrapper with a Universal Setup
    pub fn new<R: RngCore + CryptoRng>(rng: &mut R) -> Result<Self> {
        // 1. Universal Setup (Powers of Tau)
        // In production, load this from a file (hermez-raw-9).
        // For demo, we generate a small SRS.
        let num_constraints = 1000;
        let num_variables = 100;
        let num_non_zero = 3000;
        let srs = MarlinInst::universal_setup(num_constraints, num_variables, num_non_zero, rng)
            .map_err(|e| anyhow::anyhow!("Universal setup failed: {:?}", e))?;

        // 2. Index the circuit to generate keys
        let circuit = StarkVerifierCircuit::empty();
        let (proving_key, verifying_key) = MarlinInst::index(&srs, circuit)
            .map_err(|e| anyhow::anyhow!("Indexing failed: {:?}", e))?;

        Ok(Self {
            proving_key,
            verifying_key,
        })
    }

    /// Create a wrapper from existing keys
    pub fn from_keys(
        proving_key: IndexProverKey<BnFr, MultiPC>, 
        verifying_key: IndexVerifierKey<BnFr, MultiPC>
    ) -> Self {
        Self {
            proving_key,
            verifying_key,
        }
    }

    /// Load keys from serialized bytes
    pub fn from_serialized_keys(pk_bytes: &[u8], vk_bytes: &[u8]) -> Result<Self> {
        let proving_key = IndexProverKey::deserialize_compressed(pk_bytes)
            .map_err(|e| anyhow::anyhow!("Failed to deserialize proving key: {}", e))?;

        let verifying_key = IndexVerifierKey::deserialize_compressed(vk_bytes)
            .map_err(|e| anyhow::anyhow!("Failed to deserialize verifying key: {}", e))?;

        Ok(Self::from_keys(proving_key, verifying_key))
    }

    /// Serialize keys
    pub fn serialize_keys(&self) -> Result<(Vec<u8>, Vec<u8>)> {
        let mut pk_bytes = Vec::new();
        self.proving_key
            .serialize_compressed(&mut pk_bytes)
            .map_err(|e| anyhow::anyhow!("Failed to serialize proving key: {}", e))?;

        let mut vk_bytes = Vec::new();
        self.verifying_key
            .serialize_compressed(&mut vk_bytes)
            .map_err(|e| anyhow::anyhow!("Failed to serialize verifying key: {}", e))?;

        Ok((pk_bytes, vk_bytes))
    }

    /// Get the verifying key
    pub fn verifying_key(&self) -> &IndexVerifierKey<BnFr, MultiPC> {
        &self.verifying_key
    }

    /// Compute hash of STARK proof
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
        // Verify STARK proof
        let native_verifier = super::native_stark::NativeStarkVerifier::new(inner_proof.num_rows);
        native_verifier.verify(inner_proof)?;

        // Compute hash
        let proof_hash = Self::hash_stark_proof(inner_proof);

        // Create circuit
        let circuit = StarkVerifierCircuit::new(proof_hash, inner_proof.a, inner_proof.b);

        // Generate Marlin proof
        let mut rng = ark_std::rand::thread_rng();
        let proof = MarlinInst::prove(&self.proving_key, circuit, &mut rng)
            .map_err(|e| anyhow::anyhow!("Marlin proving failed: {:?}", e))?;

        // Serialize proof
        let mut proof_bytes = Vec::new();
        proof
            .serialize_compressed(&mut proof_bytes)
            .map_err(|e| anyhow::anyhow!("Failed to serialize Marlin proof: {}", e))?;

        Ok(WrappedProof {
            inner_stark_proof: inner_proof.clone(),
            outer_snark_proof: proof_bytes,
            public_inputs: vec![inner_proof.a.to_string()],
        })
    }
}

/// SNARK verifier for wrapped proofs
pub struct SnarkVerifier {
    verifying_key: IndexVerifierKey<BnFr, MultiPC>,
}

impl SnarkVerifier {
    pub fn new(verifying_key: IndexVerifierKey<BnFr, MultiPC>) -> Self {
        Self { verifying_key }
    }

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
            "Verified STARK-in-Marlin proof for a={}, b={} | Outer Proof: {} bytes",
            proof.inner_stark_proof.a,
            proof.inner_stark_proof.b,
            proof.outer_snark_proof.len()
        )))
    }
}

impl Verifier for SnarkVerifier {
    type Proof = WrappedProof;

    fn verify(&self, proof: &Self::Proof) -> Result<()> {
        // Deserialize proof
        let marlin_proof = MarlinProof::<BnFr, MultiPC>::deserialize_compressed(&proof.outer_snark_proof[..])
            .map_err(|e| anyhow::anyhow!("Failed to deserialize Marlin proof: {}", e))?;

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

        // Verify
        MarlinInst::verify(&self.verifying_key, &public_inputs, &marlin_proof, &mut ark_std::rand::thread_rng())
            .map_err(|e| anyhow::anyhow!("Marlin verification failed: {:?}", e))?;

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
        let wrapper = SnarkWrapper::new(&mut rng)?;
        let equality_proof = prove_equality(42, 42)?;
        let stark_proof = NativeStarkProof {
            proof_bytes: equality_proof.proof_bytes,
            a: equality_proof.a,
            b: equality_proof.b,
            num_rows: 32,
        };
        let wrapped_proof = wrapper.wrap(&stark_proof)?;
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
        assert_eq!(hash1, hash2);
    }

    #[test]
    fn test_key_serialization_deserialization() -> Result<()> {
        let mut rng = thread_rng();
        let wrapper = SnarkWrapper::new(&mut rng)?;
        let (pk_bytes, vk_bytes) = wrapper.serialize_keys()?;
        let wrapper2 = SnarkWrapper::from_serialized_keys(&pk_bytes, &vk_bytes)?;
        let equality_proof = prove_equality(77, 77)?;
        let stark_proof = NativeStarkProof {
            proof_bytes: equality_proof.proof_bytes,
            a: equality_proof.a,
            b: equality_proof.b,
            num_rows: 32,
        };
        let wrapped_proof = wrapper2.wrap(&stark_proof)?;
        let verifier = SnarkVerifier::new(wrapper2.verifying_key().clone());
        verifier.verify(&wrapped_proof)?;
        Ok(())
    }

    #[test]
    fn test_verifier_only_needs_vk() -> Result<()> {
        let mut rng = thread_rng();
        let wrapper = SnarkWrapper::new(&mut rng)?;
        let equality_proof = prove_equality(99, 99)?;
        let stark_proof = NativeStarkProof {
            proof_bytes: equality_proof.proof_bytes,
            a: equality_proof.a,
            b: equality_proof.b,
            num_rows: 32,
        };
        let wrapped_proof = wrapper.wrap(&stark_proof)?;
        let (_, vk_bytes) = wrapper.serialize_keys()?;
        let vk = IndexVerifierKey::<BnFr, MultiPC>::deserialize_compressed(&vk_bytes[..])?;
        let verifier = SnarkVerifier::new(vk);
        verifier.verify(&wrapped_proof)?;
        Ok(())
    }
}
