// Diem Prover - Plonky3 Edition
// This crate provides a test harness for evaluating Plonky3 STARK proofs

pub mod eq_air;

pub use eq_air::{prove_equality, verify_equality, EqualityProof, EqualityAir, F};
