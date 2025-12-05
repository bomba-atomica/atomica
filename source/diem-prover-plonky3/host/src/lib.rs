// Diem Prover - Plonky3 Edition
// This crate provides a test harness for evaluating Plonky3 STARK proofs
// with dual verification: native STARK and STARK-in-SNARK

pub mod eq_air;
pub mod verifier;

// Re-export common types
pub use eq_air::{prove_equality, verify_equality, EqualityProof, EqualityAir, F};
pub use verifier::{
    NativeStarkProof, NativeStarkVerifier, SnarkVerifier, SnarkWrapper,
    VerificationMethod, VerificationResult, Verifier, WrappedProof,
};
