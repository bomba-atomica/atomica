use anyhow::Result;
use ark_bn254::Bn254;
use ark_circom::{CircomBuilder, CircomConfig};
use ark_groth16::{Groth16, ProvingKey, VerifyingKey};
use ark_relations::r1cs::ConstraintMatrices;
use ark_std::rand::thread_rng;
use std::path::PathBuf;

/// Test that verifies Circom + Groth16 prover can generate and verify a simple noop proof
///
/// This test is analogous to the SP1 noop test but using Circom circuits.
/// It demonstrates the basic workflow:
/// 1. Load compiled circuit (R1CS + WASM)
/// 2. Generate proving/verification keys
/// 3. Create witness from inputs
/// 4. Generate Groth16 proof
/// 5. Verify the proof
#[test]
fn test_noop_proof() -> Result<()> {
    println!("🚀 Testing Circom + Groth16 Prover with No-Op Circuit");

    // Path to compiled circuit artifacts
    let cfg_path = PathBuf::from("../circuits/build/noop_js/noop.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/noop.r1cs");

    // Check if circuit is compiled
    if !cfg_path.exists() || !r1cs_path.exists() {
        eprintln!("❌ Circuit not compiled!");
        eprintln!("   Run: cd ../circuits && ./compile.sh");
        eprintln!("");
        eprintln!("   Expected files:");
        eprintln!("   - {:?}", cfg_path);
        eprintln!("   - {:?}", r1cs_path);
        panic!("Circuit files not found. Please compile the circuit first.");
    }

    println!("📦 Circuit files:");
    println!("   WASM: {:?}", cfg_path);
    println!("   R1CS: {:?}", r1cs_path);

    // Step 1: Load the circuit
    println!("\n🔧 Step 1: Load circuit");
    let load_start = std::time::Instant::now();

    let cfg = CircomConfig::<Bn254>::new(cfg_path, r1cs_path)?;
    let mut builder = CircomBuilder::new(cfg);

    // Set input value (43, same as SP1 noop test)
    builder.push_input("in", 43);

    let load_time = load_start.elapsed();
    println!("   ⏱️  {:?}", load_time);

    // Step 2: Generate proving/verification keys
    println!("\n🔑 Step 2: Generate proving/verifying keys (trusted setup)");
    let keygen_start = std::time::Instant::now();

    let circom = builder.setup();
    let mut rng = thread_rng();

    let params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng)?;

    let keygen_time = keygen_start.elapsed();
    println!("   ⏱️  {:?}", keygen_time);

    // Step 3: Build witness
    println!("\n📊 Step 3: Build witness");
    let witness_start = std::time::Instant::now();

    let circom = builder.build()?;
    let inputs = circom.get_public_inputs().unwrap();

    let witness_time = witness_start.elapsed();
    println!("   ⏱️  {:?}", witness_time);
    println!("   Public inputs: {:?}", inputs);

    // Step 4: Generate proof
    println!("\n🔮 Step 4: Generate Groth16 proof");
    let prove_start = std::time::Instant::now();

    let proof = Groth16::<Bn254>::prove(&params, circom, &mut rng)?;

    let prove_time = prove_start.elapsed();
    println!("   ⏱️  {:?}", prove_time);
    println!("   ✅ Proof generated successfully");

    // Step 5: Verify proof
    println!("\n✓ Step 5: Verify proof");
    let verify_start = std::time::Instant::now();

    let pvk = Groth16::<Bn254>::process_vk(&params.vk)?;
    let verified = Groth16::<Bn254>::verify_with_processed_vk(&pvk, &inputs, &proof)?;

    let verify_time = verify_start.elapsed();
    println!("   ⏱️  {:?}", verify_time);

    assert!(verified, "Proof verification failed!");
    println!("   ✅ Proof verified successfully!");

    // Summary
    let total_time = load_start.elapsed();
    println!("\n✅ No-op test passed!");
    println!("   Total time: {:?}", total_time);
    println!("   - Load: {:?}", load_time);
    println!("   - Keygen: {:?}", keygen_time);
    println!("   - Witness: {:?}", witness_time);
    println!("   - Prove: {:?}", prove_time);
    println!("   - Verify: {:?}", verify_time);

    Ok(())
}
