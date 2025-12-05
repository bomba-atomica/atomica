//! Integration tests for dual verification system
//!
//! Tests both native STARK verification and STARK-in-SNARK verification

use anyhow::Result;
use ark_std::rand::thread_rng;
use diem_prover_plonky3::{
    prove_equality, NativeStarkProof, NativeStarkVerifier, SnarkVerifier, SnarkWrapper,
    VerificationMethod, Verifier, WrappedProof,
};
use diem_prover_plonky3::verifier::ProofWrapper;

/// Test native STARK verification with various values
#[test]
fn test_native_stark_verification() -> Result<()> {
    let verifier = NativeStarkVerifier::default();

    // Test case 1: Small values
    let proof1 = prove_equality(1, 1)?;
    let stark_proof1 = NativeStarkProof {
        proof_bytes: proof1.proof_bytes,
        a: proof1.a,
        b: proof1.b,
        num_rows: 32,
    };
    verifier.verify(&stark_proof1)?;

    // Test case 2: Medium values
    let proof2 = prove_equality(12345, 12345)?;
    let stark_proof2 = NativeStarkProof {
        proof_bytes: proof2.proof_bytes,
        a: proof2.a,
        b: proof2.b,
        num_rows: 32,
    };
    verifier.verify(&stark_proof2)?;

    // Test case 3: Large values
    let proof3 = prove_equality(999999, 999999)?;
    let stark_proof3 = NativeStarkProof {
        proof_bytes: proof3.proof_bytes,
        a: proof3.a,
        b: proof3.b,
        num_rows: 32,
    };
    verifier.verify(&stark_proof3)?;

    Ok(())
}

/// Test STARK-in-SNARK verification
#[test]
fn test_stark_in_snark_verification() -> Result<()> {
    let mut rng = thread_rng();

    // Setup SNARK wrapper (trusted setup)
    let wrapper = SnarkWrapper::new(&mut rng)?;
    let verifier = SnarkVerifier::new(wrapper.verifying_key().clone());

    // Generate a STARK proof
    let proof = prove_equality(42, 42)?;
    let stark_proof = NativeStarkProof {
        proof_bytes: proof.proof_bytes,
        a: proof.a,
        b: proof.b,
        num_rows: 32,
    };

    // Wrap the STARK proof in a SNARK
    let wrapped_proof = wrapper.wrap(&stark_proof)?;

    // Verify the wrapped proof
    verifier.verify(&wrapped_proof)?;

    Ok(())
}

/// Test both verification methods on the same proof
#[test]
fn test_dual_verification_same_proof() -> Result<()> {
    let mut rng = thread_rng();

    // Generate a STARK proof
    let proof = prove_equality(777, 777)?;
    let stark_proof = NativeStarkProof {
        proof_bytes: proof.proof_bytes,
        a: proof.a,
        b: proof.b,
        num_rows: 32,
    };

    // Method 1: Native STARK verification
    let native_verifier = NativeStarkVerifier::default();
    native_verifier.verify(&stark_proof)?;

    // Method 2: STARK-in-SNARK verification
    let wrapper = SnarkWrapper::new(&mut rng)?;
    let wrapped_proof = wrapper.wrap(&stark_proof)?;
    let snark_verifier = SnarkVerifier::new(wrapper.verifying_key().clone());
    snark_verifier.verify(&wrapped_proof)?;

    Ok(())
}

/// Test verification results with metadata
#[test]
fn test_verification_results() -> Result<()> {
    let mut rng = thread_rng();

    let proof = prove_equality(100, 100)?;
    let stark_proof = NativeStarkProof {
        proof_bytes: proof.proof_bytes,
        a: proof.a,
        b: proof.b,
        num_rows: 32,
    };

    // Test native STARK result
    let native_verifier = NativeStarkVerifier::default();
    let native_result = native_verifier.verify_with_result(&stark_proof)?;
    assert!(native_result.valid);
    assert_eq!(native_result.method, VerificationMethod::NativeStark);
    assert!(native_result.verification_time_us > 0);
    assert!(native_result.metadata.is_some());

    // Test SNARK result
    let wrapper = SnarkWrapper::new(&mut rng)?;
    let wrapped_proof = wrapper.wrap(&stark_proof)?;
    let snark_verifier = SnarkVerifier::new(wrapper.verifying_key().clone());
    let snark_result = snark_verifier.verify_with_result(&wrapped_proof)?;
    assert!(snark_result.valid);
    assert_eq!(snark_result.method, VerificationMethod::StarkInSnark);
    assert!(snark_result.verification_time_us > 0);
    assert!(snark_result.metadata.is_some());

    Ok(())
}

/// Test that verification methods can be queried
#[test]
fn test_verifier_methods() {
    let native_verifier = NativeStarkVerifier::default();
    assert_eq!(native_verifier.method(), VerificationMethod::NativeStark);

    let mut rng = thread_rng();
    let wrapper = SnarkWrapper::new(&mut rng).unwrap();
    let snark_verifier = SnarkVerifier::new(wrapper.verifying_key().clone());
    assert_eq!(snark_verifier.method(), VerificationMethod::StarkInSnark);
}

/// Test proof serialization and deserialization for wrapped proofs
#[test]
fn test_wrapped_proof_serialization() -> Result<()> {
    let mut rng = thread_rng();

    let proof = prove_equality(555, 555)?;
    let stark_proof = NativeStarkProof {
        proof_bytes: proof.proof_bytes,
        a: proof.a,
        b: proof.b,
        num_rows: 32,
    };

    let wrapper = SnarkWrapper::new(&mut rng)?;
    let wrapped_proof = wrapper.wrap(&stark_proof)?;

    // Serialize to JSON
    let serialized = serde_json::to_string(&wrapped_proof)?;

    // Deserialize back
    let deserialized: WrappedProof = serde_json::from_str(&serialized)?;

    // Verify deserialized proof
    let verifier = SnarkVerifier::new(wrapper.verifying_key().clone());
    verifier.verify(&deserialized)?;

    Ok(())
}

/// Test that verification fails for mismatched proofs
#[test]
fn test_verification_rejects_invalid() -> Result<()> {
    let native_verifier = NativeStarkVerifier::default();

    // Create an invalid proof with unequal values
    let invalid_proof = NativeStarkProof {
        proof_bytes: vec![0; 100], // dummy bytes
        a: 42,
        b: 43, // Different value!
        num_rows: 32,
    };

    // Should fail
    let result = native_verifier.verify(&invalid_proof);
    assert!(result.is_err());

    Ok(())
}

/// Benchmark comparison between verification methods
#[test]
fn test_verification_performance_comparison() -> Result<()> {
    use std::time::Instant;

    let mut rng = thread_rng();

    // Generate proof once
    let proof = prove_equality(888, 888)?;
    let stark_proof = NativeStarkProof {
        proof_bytes: proof.proof_bytes,
        a: proof.a,
        b: proof.b,
        num_rows: 32,
    };

    // Time native STARK verification
    let native_verifier = NativeStarkVerifier::default();
    let native_start = Instant::now();
    native_verifier.verify(&stark_proof)?;
    let native_time = native_start.elapsed();

    // Setup and time SNARK verification
    let wrapper = SnarkWrapper::new(&mut rng)?;
    let wrapped_proof = wrapper.wrap(&stark_proof)?;
    let snark_verifier = SnarkVerifier::new(wrapper.verifying_key().clone());

    let snark_start = Instant::now();
    snark_verifier.verify(&wrapped_proof)?;
    let snark_time = snark_start.elapsed();

    println!("\nVerification Performance:");
    println!("  Native STARK: {:?}", native_time);
    println!("  STARK-in-SNARK: {:?}", snark_time);
    println!(
        "  Ratio: {:.2}x",
        snark_time.as_micros() as f64 / native_time.as_micros() as f64
    );

    // Both should complete in reasonable time
    assert!(native_time.as_secs() < 10);
    assert!(snark_time.as_secs() < 10);

    Ok(())
}

/// Test multiple proofs with same setup
#[test]
fn test_multiple_proofs_same_setup() -> Result<()> {
    let mut rng = thread_rng();

    // Setup once
    let wrapper = SnarkWrapper::new(&mut rng)?;
    let verifier = SnarkVerifier::new(wrapper.verifying_key().clone());

    // Verify multiple proofs
    for value in [1, 10, 100, 1000, 10000] {
        let proof = prove_equality(value, value)?;
        let stark_proof = NativeStarkProof {
            proof_bytes: proof.proof_bytes,
            a: proof.a,
            b: proof.b,
            num_rows: 32,
        };

        let wrapped = wrapper.wrap(&stark_proof)?;
        verifier.verify(&wrapped)?;
    }

    Ok(())
}
