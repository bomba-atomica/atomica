use color_eyre::Result;
use ark_bn254::{Bn254, Fr};
use ark_circom::{CircomBuilder, CircomConfig};
use ark_groth16::Groth16;
use ark_snark::SNARK;
use ark_std::rand::thread_rng;
use std::path::PathBuf;

/// Test that verifies the equality check circuit works correctly when numbers match
#[tokio::test]
async fn test_equality_happy_case() -> Result<()> {
    println!("🚀 Testing Equality Circuit - Happy Case (numbers match)");

    // Path to compiled circuit artifacts
    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    // Check if circuit is compiled
    if !cfg_path.exists() || !r1cs_path.exists() {
        eprintln!("❌ Circuit not compiled!");
        eprintln!("   Run: cd ../circuits && circom eq.circom --r1cs --wasm --sym --c -o build");
        panic!("Circuit files not found. Please compile the circuit first.");
    }

    println!("📦 Circuit files:");
    println!("   WASM: {:?}", cfg_path);
    println!("   R1CS: {:?}", r1cs_path);

    // Test values - both numbers are 42
    let a = 42;
    let b = 42;
    println!("\n🔢 Testing with a={}, b={} (should match)", a, b);

    // Step 1: Load the circuit
    println!("\n🔧 Step 1: Load circuit");
    let load_start = std::time::Instant::now();

    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path)?;
    let mut builder = CircomBuilder::new(cfg);

    // Set input values
    builder.push_input("a", a);
    builder.push_input("b", b);

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
    println!("\n✅ Equality test (happy case) passed!");
    println!("   Total time: {:?}", total_time);
    println!("   - Load: {:?}", load_time);
    println!("   - Keygen: {:?}", keygen_time);
    println!("   - Witness: {:?}", witness_time);
    println!("   - Prove: {:?}", prove_time);
    println!("   - Verify: {:?}", verify_time);

    Ok(())
}

/// Test that verifies the equality check circuit correctly fails when numbers don't match
#[tokio::test]
#[should_panic(expected = "assertion failed")]
async fn test_equality_failure_case() {
    println!("🚀 Testing Equality Circuit - Failure Case (numbers don't match)");

    // Path to compiled circuit artifacts
    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    println!("📦 Circuit files:");
    println!("   WASM: {:?}", cfg_path);
    println!("   R1CS: {:?}", r1cs_path);

    // Test values - different numbers
    let a = 42;
    let b = 43;
    println!("\n🔢 Testing with a={}, b={} (should NOT match)", a, b);

    // Step 1: Load the circuit
    println!("\n🔧 Step 1: Load circuit");
    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path).unwrap();
    let mut builder = CircomBuilder::new(cfg);

    // Set input values - these are different
    builder.push_input("a", a);
    builder.push_input("b", b);

    // Step 2: Generate proving/verification keys
    println!("\n🔑 Step 2: Generate proving/verifying keys (trusted setup)");
    let circom = builder.setup();
    let mut rng = thread_rng();
    let _params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng).unwrap();

    // Step 3: Try to build witness - this should panic because a != b violates the constraint
    println!("\n📊 Step 3: Attempt to build witness (expecting panic)");
    println!("   The circuit will panic because the constraint a === b is not satisfied");

    // This call will panic, which is what we expect
    let _ = builder.build();

    // If we get here, the test fails
    panic!("Expected build() to panic when a != b, but it succeeded!");
}
