//! Common types and traits for the dual verification system
//!
//! This module defines the core abstractions for verifying proofs through
//! either native STARK verification or STARK-wrapped-in-SNARK verification.

use anyhow::Result;
use serde::{Deserialize, Serialize};

/// Verification method selector
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum VerificationMethod {
    /// Native STARK verification using Plonky3
    /// - Fast verification
    /// - Transparent (no trusted setup)
    /// - Not EVM-compatible
    NativeStark,

    /// STARK proof wrapped in a PLONK SNARK
    /// - Slower verification (two-layer)
    /// - EVM-compatible (uses BN254 curve)
    /// - Compact proof size
    StarkInSnark,
}

/// Common trait for all proof verifiers
pub trait Verifier {
    /// The type of proof this verifier can verify
    type Proof;

    /// Verify a proof
    ///
    /// # Arguments
    /// * `proof` - The proof to verify
    ///
    /// # Returns
    /// * `Ok(())` - Proof is valid
    /// * `Err(_)` - Verification failed
    fn verify(&self, proof: &Self::Proof) -> Result<()>;

    /// Get the verification method used by this verifier
    fn method(&self) -> VerificationMethod;
}

/// Trait for wrapping proofs in other proof systems
pub trait ProofWrapper {
    /// The inner proof type (e.g., STARK proof)
    type InnerProof;

    /// The outer proof type (e.g., PLONK proof)
    type OuterProof;

    /// Wrap an inner proof in an outer proof system
    ///
    /// # Arguments
    /// * `inner_proof` - The proof to wrap
    ///
    /// # Returns
    /// * `Ok(outer_proof)` - The wrapped proof
    /// * `Err(_)` - Wrapping failed
    fn wrap(&self, inner_proof: &Self::InnerProof) -> Result<Self::OuterProof>;
}

/// Verification result with metadata
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationResult {
    /// Whether the proof is valid
    pub valid: bool,

    /// Verification method used
    pub method: VerificationMethod,

    /// Time taken to verify (in microseconds)
    pub verification_time_us: u64,

    /// Optional additional metadata
    pub metadata: Option<String>,
}

impl VerificationResult {
    /// Create a new verification result
    pub fn new(valid: bool, method: VerificationMethod, verification_time_us: u64) -> Self {
        Self {
            valid,
            method,
            verification_time_us,
            metadata: None,
        }
    }

    /// Add metadata to the result
    pub fn with_metadata(mut self, metadata: String) -> Self {
        self.metadata = Some(metadata);
        self
    }
}
