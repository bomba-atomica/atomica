use color_eyre::Result;
use ark_bn254::{Bn254, Fr, G1Affine};
use ark_circom::{CircomBuilder, CircomConfig};
use ark_groth16::Groth16;
use ark_snark::SNARK;
use ark_std::rand::thread_rng;
use std::path::PathBuf;
use ark_ec::{AffineRepr, CurveGroup};

/// Test that a tampered proof fails verification
#[tokio::test]
async fn test_tampered_proof_verification_fails() -> Result<()> {
    println!("🚀 Testing Tampered Proof Verification");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    // Generate a valid proof first
    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path)?;
    let mut builder = CircomBuilder::new(cfg);

    let a = 42;
    let b = 42;
    builder.push_input("a", a);
    builder.push_input("b", b);

    println!("🔧 Generating valid proof...");
    let circom = builder.setup();
    let mut rng = thread_rng();
    let params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng)?;

    let circom = builder.build()?;
    let inputs = circom.get_public_inputs().unwrap();

    let mut proof = Groth16::<Bn254>::prove(&params, circom, &mut rng)?;
    println!("✅ Valid proof generated");

    // Verify the original proof works
    let pvk = Groth16::<Bn254>::process_vk(&params.vk)?;
    let verified = Groth16::<Bn254>::verify_with_processed_vk(&pvk, &inputs, &proof)?;
    assert!(verified, "Original proof should verify");
    println!("✅ Original proof verifies correctly");

    // Now tamper with the proof by modifying one of its components
    println!("🔧 Tampering with proof...");

    // Tamper with the A component of the proof by using identity point
    proof.a = G1Affine::identity();

    println!("📊 Verifying tampered proof...");
    let verified_tampered = Groth16::<Bn254>::verify_with_processed_vk(&pvk, &inputs, &proof)?;

    assert!(!verified_tampered, "Tampered proof should NOT verify");
    println!("✅ Tampered proof correctly rejected");

    Ok(())
}

/// Test that using wrong public inputs fails verification
#[tokio::test]
async fn test_wrong_public_inputs_verification_fails() -> Result<()> {
    println!("🚀 Testing Verification with Wrong Public Inputs");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    // Generate a valid proof
    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path)?;
    let mut builder = CircomBuilder::new(cfg);

    let a = 42;
    let b = 42;
    builder.push_input("a", a);
    builder.push_input("b", b);

    println!("🔧 Generating proof with a={}, b={}...", a, b);
    let circom = builder.setup();
    let mut rng = thread_rng();
    let params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng)?;

    let circom = builder.build()?;
    let original_inputs = circom.get_public_inputs().unwrap();

    let proof = Groth16::<Bn254>::prove(&params, circom, &mut rng)?;
    println!("✅ Proof generated");

    // Verify with correct inputs first
    let pvk = Groth16::<Bn254>::process_vk(&params.vk)?;
    let verified = Groth16::<Bn254>::verify_with_processed_vk(&pvk, &original_inputs, &proof)?;
    assert!(verified, "Proof with correct inputs should verify");
    println!("✅ Verification with correct inputs succeeds");

    // Now try to verify with wrong public inputs
    println!("🔧 Attempting verification with wrong public inputs...");
    let mut wrong_inputs = original_inputs.clone();

    // Modify the public inputs
    if !wrong_inputs.is_empty() {
        wrong_inputs[0] = Fr::from(99u64); // Change first public input
    }

    let verified_wrong = Groth16::<Bn254>::verify_with_processed_vk(&pvk, &wrong_inputs, &proof)?;

    assert!(!verified_wrong, "Proof with wrong public inputs should NOT verify");
    println!("✅ Verification with wrong public inputs correctly fails");

    Ok(())
}

/// Test that a proof generated for one circuit cannot verify on another
#[tokio::test]
async fn test_proof_circuit_mismatch() -> Result<()> {
    println!("🚀 Testing Proof/Circuit Mismatch");

    // Generate proof for eq circuit
    let eq_cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let eq_r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(eq_cfg_path, eq_r1cs_path)?;
    let mut builder = CircomBuilder::new(cfg);

    builder.push_input("a", 42);
    builder.push_input("b", 42);

    println!("🔧 Generating proof for eq circuit...");
    let circom = builder.setup();
    let mut rng = thread_rng();
    let eq_params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng)?;

    let circom = builder.build()?;
    let eq_inputs = circom.get_public_inputs().unwrap();
    let eq_proof = Groth16::<Bn254>::prove(&eq_params, circom, &mut rng)?;
    println!("✅ Eq circuit proof generated");

    // Now generate different parameters for a "different circuit" (simulate by regenerating keys)
    let cfg2 = CircomConfig::<Fr>::new(
        PathBuf::from("../circuits/build/eq_js/eq.wasm"),
        PathBuf::from("../circuits/build/eq.r1cs")
    )?;
    let mut builder2 = CircomBuilder::new(cfg2);
    builder2.push_input("a", 42);
    builder2.push_input("b", 42);

    println!("🔧 Generating different verification key...");
    let circom2 = builder2.setup();
    let different_params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom2, &mut rng)?;

    // Try to verify eq_proof with different_params vk
    println!("📊 Attempting to verify proof with mismatched verification key...");
    let pvk_different = Groth16::<Bn254>::process_vk(&different_params.vk)?;
    let verified = Groth16::<Bn254>::verify_with_processed_vk(&pvk_different, &eq_inputs, &eq_proof)?;

    assert!(!verified, "Proof should NOT verify with different circuit parameters");
    println!("✅ Correctly rejected proof with mismatched verification key");

    Ok(())
}

/// Test that empty public inputs cause verification error
#[tokio::test]
async fn test_empty_public_inputs_verification() {
    println!("🚀 Testing Verification with Empty Public Inputs");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    // Generate a valid proof
    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path).unwrap();
    let mut builder = CircomBuilder::new(cfg);

    builder.push_input("a", 42);
    builder.push_input("b", 42);

    let circom = builder.setup();
    let mut rng = thread_rng();
    let params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng).unwrap();

    let circom = builder.build().unwrap();
    let proof = Groth16::<Bn254>::prove(&params, circom, &mut rng).unwrap();

    println!("🔧 Attempting verification with empty public inputs...");
    let pvk = Groth16::<Bn254>::process_vk(&params.vk).unwrap();
    let empty_inputs: Vec<Fr> = vec![];

    // This should return an error, not just failed verification
    let result = Groth16::<Bn254>::verify_with_processed_vk(&pvk, &empty_inputs, &proof);

    assert!(result.is_err(), "Verification with empty public inputs should error");
    println!("✅ Correctly errored on empty public inputs");
}

/// Test that modifying proof's B component causes verification failure
#[tokio::test]
async fn test_tampered_proof_b_component() -> Result<()> {
    println!("🚀 Testing Tampered Proof (B Component)");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path)?;
    let mut builder = CircomBuilder::new(cfg);

    builder.push_input("a", 42);
    builder.push_input("b", 42);

    let circom = builder.setup();
    let mut rng = thread_rng();
    let params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng)?;

    let circom = builder.build()?;
    let inputs = circom.get_public_inputs().unwrap();

    let mut proof = Groth16::<Bn254>::prove(&params, circom, &mut rng)?;

    // Verify original proof
    let pvk = Groth16::<Bn254>::process_vk(&params.vk)?;
    let verified = Groth16::<Bn254>::verify_with_processed_vk(&pvk, &inputs, &proof)?;
    assert!(verified, "Original proof should verify");

    println!("🔧 Tampering with proof B component...");
    // Tamper with the B component by using identity
    use ark_bn254::G2Affine;
    proof.b = G2Affine::identity();

    println!("📊 Verifying tampered proof...");
    let verified_tampered = Groth16::<Bn254>::verify_with_processed_vk(&pvk, &inputs, &proof)?;

    assert!(!verified_tampered, "Tampered proof B should NOT verify");
    println!("✅ Tampered proof (B component) correctly rejected");

    Ok(())
}

/// Test that modifying proof's C component causes verification failure
#[tokio::test]
async fn test_tampered_proof_c_component() -> Result<()> {
    println!("🚀 Testing Tampered Proof (C Component)");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path)?;
    let mut builder = CircomBuilder::new(cfg);

    builder.push_input("a", 42);
    builder.push_input("b", 42);

    let circom = builder.setup();
    let mut rng = thread_rng();
    let params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng)?;

    let circom = builder.build()?;
    let inputs = circom.get_public_inputs().unwrap();

    let mut proof = Groth16::<Bn254>::prove(&params, circom, &mut rng)?;

    // Verify original proof
    let pvk = Groth16::<Bn254>::process_vk(&params.vk)?;
    let verified = Groth16::<Bn254>::verify_with_processed_vk(&pvk, &inputs, &proof)?;
    assert!(verified, "Original proof should verify");

    println!("🔧 Tampering with proof C component...");
    // Tamper with the C component by using identity point
    proof.c = G1Affine::identity();

    println!("📊 Verifying tampered proof...");
    let verified_tampered = Groth16::<Bn254>::verify_with_processed_vk(&pvk, &inputs, &proof)?;

    assert!(!verified_tampered, "Tampered proof C should NOT verify");
    println!("✅ Tampered proof (C component) correctly rejected");

    Ok(())
}
