//! Dual verification system for STARK proofs
//!
//! This module provides two verification methods for STARK proofs:
//!
//! 1. **Native STARK Verification** - Direct verification using Plonky3
//!    - Fastest verification
//!    - Transparent setup (no trusted ceremony)
//!    - Not EVM-compatible
//!
//! 2. **STARK-in-SNARK Verification** - STARK proof wrapped in Groth16 SNARK
//!    - EVM-compatible (uses BN254 curve)
//!    - Compact proof size
//!    - Two-layer verification
//!
//! # Architecture
//!
//! ```text
//! ┌──────────────────────────────────────────────────────────────┐
//! │                    Equality Prover                           │
//! │                  (Plonky3 STARK)                            │
//! │                                                              │
//! │  Input: a, b (where a == b)                                 │
//! │  Output: STARK proof                                         │
//! └──────────────────────────────────────────────────────────────┘
//!                           │
//!                           │
//!            ┌──────────────┴──────────────┐
//!            │                             │
//!            ▼                             ▼
//!  ┌──────────────────┐         ┌──────────────────────┐
//!  │ Native Verifier  │         │  SNARK Wrapper       │
//!  │  (Plonky3)       │         │  (Groth16)           │
//!  │                  │         │                      │
//!  │  Fast: ~1-5ms    │         │  Creates SNARK proof │
//!  │  Transparent     │         │  wrapping STARK      │
//!  └──────────────────┘         └──────────────────────┘
//!                                          │
//!                                          ▼
//!                               ┌──────────────────────┐
//!                               │  SNARK Verifier      │
//!                               │  (Groth16)           │
//!                               │                      │
//!                               │  EVM-compatible      │
//!                               │  Compact: ~200 bytes │
//!                               └──────────────────────┘
//! ```
//!
//! # Example
//!
//! ```no_run
//! use diem_prover_plonky3::verifier::{
//!     NativeStarkVerifier, SnarkWrapper, SnarkVerifier, Verifier,
//! };
//! use diem_prover_plonky3::eq_air::prove_equality;
//! use ark_std::rand::thread_rng;
//!
//! # fn main() -> anyhow::Result<()> {
//! // Generate a STARK proof
//! let proof = prove_equality(42, 42)?;
//!
//! // Method 1: Native STARK verification
//! let native_verifier = NativeStarkVerifier::default();
//! // ... convert and verify
//!
//! // Method 2: STARK-in-SNARK verification
//! let mut rng = thread_rng();
//! let wrapper = SnarkWrapper::new(&mut rng)?;
//! // ... wrap and verify
//! # Ok(())
//! # }
//! ```

pub mod native_stark;
pub mod snark_wrapper;
pub mod types;

// Re-export main types
pub use native_stark::{NativeStarkProof, NativeStarkVerifier};
pub use snark_wrapper::{SnarkVerifier, SnarkWrapper, WrappedProof};
pub use types::{
    ProofWrapper, VerificationMethod, VerificationResult, Verifier,
};
