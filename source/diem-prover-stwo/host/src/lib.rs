// Diem Prover - Stwo Edition
// This crate provides a test harness for evaluating stwo STARK proofs

pub mod eq_air;

pub use eq_air::{prove_equality, verify_equality, EqualityProof, EqualityEval, EqualityComponent};
