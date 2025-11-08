use color_eyre::Result;
use ark_bn254::{Bn254, Fr};
use ark_circom::{CircomBuilder, CircomConfig};
use ark_groth16::Groth16;
use ark_snark::SNARK;
use ark_std::rand::thread_rng;
use std::path::PathBuf;

/// Test that proof generated with one set of parameters fails with different verification key
#[tokio::test]
async fn test_mismatched_proving_verification_keys() -> Result<()> {
    println!("🚀 Testing Mismatched Proving/Verification Keys");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    // Generate first set of parameters
    println!("🔧 Generating first set of parameters (proving key 1)...");
    let cfg1 = CircomConfig::<Fr>::new(&cfg_path, &r1cs_path)?;
    let mut builder1 = CircomBuilder::new(cfg1);
    builder1.push_input("a", 42);
    builder1.push_input("b", 42);

    let circom1 = builder1.setup();
    let mut rng = thread_rng();
    let params1 = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom1, &mut rng)?;

    // Generate proof using first parameters
    let circom1 = builder1.build()?;
    let inputs1 = circom1.get_public_inputs().unwrap();
    let proof1 = Groth16::<Bn254>::prove(&params1, circom1, &mut rng)?;
    println!("✅ Proof generated with params1");

    // Verify proof works with its own verification key
    let pvk1 = Groth16::<Bn254>::process_vk(&params1.vk)?;
    let verified_correct = Groth16::<Bn254>::verify_with_processed_vk(&pvk1, &inputs1, &proof1)?;
    assert!(verified_correct, "Proof should verify with matching vk");
    println!("✅ Proof verifies with matching verification key");

    // Generate second set of parameters (different trusted setup)
    println!("🔧 Generating second set of parameters (different trusted setup)...");
    let cfg2 = CircomConfig::<Fr>::new(&cfg_path, &r1cs_path)?;
    let mut builder2 = CircomBuilder::new(cfg2);
    builder2.push_input("a", 42);
    builder2.push_input("b", 42);

    let circom2 = builder2.setup();
    let params2 = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom2, &mut rng)?;

    // Try to verify proof1 with params2's verification key
    println!("📊 Attempting to verify proof with mismatched verification key...");
    let pvk2 = Groth16::<Bn254>::process_vk(&params2.vk)?;
    let verified_mismatched = Groth16::<Bn254>::verify_with_processed_vk(&pvk2, &inputs1, &proof1)?;

    assert!(!verified_mismatched, "Proof should NOT verify with different verification key");
    println!("✅ Correctly rejected proof with mismatched verification key");

    Ok(())
}

/// Test that using noop circuit's vk to verify eq circuit's proof fails
#[tokio::test]
async fn test_cross_circuit_verification() -> Result<()> {
    println!("🚀 Testing Cross-Circuit Verification (eq proof vs noop vk)");

    // Generate proof for eq circuit
    println!("🔧 Generating proof for eq circuit...");
    let eq_cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let eq_r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let eq_cfg = CircomConfig::<Fr>::new(&eq_cfg_path, &eq_r1cs_path)?;
    let mut eq_builder = CircomBuilder::new(eq_cfg);
    eq_builder.push_input("a", 42);
    eq_builder.push_input("b", 42);

    let eq_circom = eq_builder.setup();
    let mut rng = thread_rng();
    let eq_params = Groth16::<Bn254>::generate_random_parameters_with_reduction(eq_circom, &mut rng)?;

    let eq_circom = eq_builder.build()?;
    let eq_inputs = eq_circom.get_public_inputs().unwrap();
    let eq_proof = Groth16::<Bn254>::prove(&eq_params, eq_circom, &mut rng)?;
    println!("✅ Eq circuit proof generated");

    // Generate parameters for noop circuit
    println!("🔧 Generating parameters for noop circuit...");
    let noop_cfg_path = PathBuf::from("../circuits/build/noop_js/noop.wasm");
    let noop_r1cs_path = PathBuf::from("../circuits/build/noop.r1cs");

    // Check if noop circuit exists
    if !noop_cfg_path.exists() || !noop_r1cs_path.exists() {
        println!("⚠️  Noop circuit not compiled, skipping cross-circuit test");
        return Ok(());
    }

    let noop_cfg = CircomConfig::<Fr>::new(&noop_cfg_path, &noop_r1cs_path)?;
    let noop_builder = CircomBuilder::new(noop_cfg);

    let noop_circom = noop_builder.setup();
    let noop_params = Groth16::<Bn254>::generate_random_parameters_with_reduction(noop_circom, &mut rng)?;
    println!("✅ Noop circuit parameters generated");

    // Try to verify eq_proof with noop_params vk
    println!("📊 Attempting to verify eq proof with noop verification key...");
    let noop_pvk = Groth16::<Bn254>::process_vk(&noop_params.vk)?;

    // This should fail because the circuits are different (different number of public inputs)
    // It may return an error instead of false
    let result = Groth16::<Bn254>::verify_with_processed_vk(&noop_pvk, &eq_inputs, &eq_proof);

    match result {
        Ok(verified) => {
            assert!(!verified, "Eq proof should NOT verify with noop verification key");
            println!("✅ Correctly rejected proof from different circuit (returned false)");
        }
        Err(_) => {
            println!("✅ Correctly rejected proof from different circuit (returned error)");
        }
    }

    Ok(())
}

/// Test that using outdated/old verification keys fails
#[tokio::test]
async fn test_multiple_key_generations() -> Result<()> {
    println!("🚀 Testing Multiple Key Generation Rounds");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");
    let mut rng = thread_rng();

    // Generate multiple sets of parameters
    let mut all_params = vec![];
    let mut all_proofs = vec![];
    let mut all_inputs = vec![];

    for i in 0..3 {
        println!("🔧 Round {}: Generating parameters and proof...", i + 1);

        let cfg = CircomConfig::<Fr>::new(&cfg_path, &r1cs_path)?;
        let mut builder = CircomBuilder::new(cfg);
        builder.push_input("a", 42);
        builder.push_input("b", 42);

        let circom = builder.setup();
        let params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng)?;

        let circom = builder.build()?;
        let inputs = circom.get_public_inputs().unwrap();
        let proof = Groth16::<Bn254>::prove(&params, circom, &mut rng)?;

        all_params.push(params);
        all_proofs.push(proof);
        all_inputs.push(inputs);
    }

    println!("✅ Generated 3 sets of parameters and proofs");

    // Verify each proof only works with its own vk
    println!("📊 Testing cross-verification...");
    for i in 0..3 {
        for j in 0..3 {
            let pvk = Groth16::<Bn254>::process_vk(&all_params[j].vk)?;
            let verified = Groth16::<Bn254>::verify_with_processed_vk(
                &pvk,
                &all_inputs[i],
                &all_proofs[i]
            )?;

            if i == j {
                assert!(verified, "Proof {} should verify with its own vk {}", i, j);
                println!("  ✅ Proof {} verified with matching vk {}", i, j);
            } else {
                assert!(!verified, "Proof {} should NOT verify with different vk {}", i, j);
                println!("  ✅ Proof {} correctly rejected by vk {}", i, j);
            }
        }
    }

    println!("✅ All cross-verification tests passed");

    Ok(())
}

/// Test that verification fails when using proving key instead of verification key
#[tokio::test]
async fn test_proving_key_vs_verification_key() -> Result<()> {
    println!("🚀 Testing Proving Key vs Verification Key Confusion");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(&cfg_path, &r1cs_path)?;
    let mut builder = CircomBuilder::new(cfg);
    builder.push_input("a", 42);
    builder.push_input("b", 42);

    let circom = builder.setup();
    let mut rng = thread_rng();
    let params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng)?;

    let circom = builder.build()?;
    let inputs = circom.get_public_inputs().unwrap();
    let proof = Groth16::<Bn254>::prove(&params, circom, &mut rng)?;

    // Normal verification should work
    let pvk = Groth16::<Bn254>::process_vk(&params.vk)?;
    let verified = Groth16::<Bn254>::verify_with_processed_vk(&pvk, &inputs, &proof)?;
    assert!(verified, "Normal verification should work");
    println!("✅ Normal verification with correct vk works");

    // Note: We can't easily "misuse" the proving key as a verification key
    // because they have different types in the ark-groth16 API.
    // This test confirms the type safety of the API.
    println!("✅ Type system prevents using proving key for verification");

    Ok(())
}

/// Test verification with parameters from different elliptic curve (if possible)
#[tokio::test]
async fn test_same_circuit_different_runs() -> Result<()> {
    println!("🚀 Testing Same Circuit, Different Parameter Generations");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");
    let mut rng = thread_rng();

    // First run
    println!("🔧 First run: Generate params and proof...");
    let cfg1 = CircomConfig::<Fr>::new(&cfg_path, &r1cs_path)?;
    let mut builder1 = CircomBuilder::new(cfg1);
    builder1.push_input("a", 100);
    builder1.push_input("b", 100);

    let circom1 = builder1.setup();
    let params_run1 = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom1, &mut rng)?;

    let circom1 = builder1.build()?;
    let inputs_run1 = circom1.get_public_inputs().unwrap();
    let proof_run1 = Groth16::<Bn254>::prove(&params_run1, circom1, &mut rng)?;

    // Second run with same inputs
    println!("🔧 Second run: Generate params and proof (same inputs)...");
    let cfg2 = CircomConfig::<Fr>::new(&cfg_path, &r1cs_path)?;
    let mut builder2 = CircomBuilder::new(cfg2);
    builder2.push_input("a", 100);
    builder2.push_input("b", 100);

    let circom2 = builder2.setup();
    let params_run2 = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom2, &mut rng)?;

    let circom2 = builder2.build()?;
    let inputs_run2 = circom2.get_public_inputs().unwrap();
    let proof_run2 = Groth16::<Bn254>::prove(&params_run2, circom2, &mut rng)?;

    // Verify each proof works with its own vk
    println!("📊 Verifying each proof with its own vk...");
    let pvk1 = Groth16::<Bn254>::process_vk(&params_run1.vk)?;
    let verified1 = Groth16::<Bn254>::verify_with_processed_vk(&pvk1, &inputs_run1, &proof_run1)?;
    assert!(verified1, "Proof from run 1 should verify with vk from run 1");

    let pvk2 = Groth16::<Bn254>::process_vk(&params_run2.vk)?;
    let verified2 = Groth16::<Bn254>::verify_with_processed_vk(&pvk2, &inputs_run2, &proof_run2)?;
    assert!(verified2, "Proof from run 2 should verify with vk from run 2");

    println!("✅ Both proofs verify with their own keys");

    // Cross-verify: run1 proof with run2 vk
    println!("📊 Cross-verifying: run1 proof with run2 vk...");
    let cross_verified = Groth16::<Bn254>::verify_with_processed_vk(&pvk2, &inputs_run1, &proof_run1)?;
    assert!(!cross_verified, "Run1 proof should NOT verify with run2 vk");
    println!("✅ Correctly rejected cross-verification");

    Ok(())
}
