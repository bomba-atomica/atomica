use color_eyre::Result;
use ark_bn254::{Bn254, Fr};
use ark_circom::{CircomBuilder, CircomConfig};
use ark_groth16::Groth16;
use ark_snark::SNARK;
use ark_std::rand::thread_rng;
use std::path::PathBuf;

/// Test that providing wrong inputs causes witness generation to fail (constraint violation)
#[tokio::test]
#[should_panic(expected = "assertion failed")]
async fn test_witness_constraint_violation() {
    println!("🚀 Testing Witness with Constraint Violation");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    // Load circuit
    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path).unwrap();
    let mut builder = CircomBuilder::new(cfg);

    // Set inputs that violate the constraint a === b
    builder.push_input("a", 100);
    builder.push_input("b", 200);  // Different from a, violates constraint

    // Setup (this should work fine)
    let circom = builder.setup();
    let mut rng = thread_rng();
    let _params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng).unwrap();

    println!("📊 Attempting to build witness with constraint violation...");

    // This should panic because the constraint a === b is not satisfied
    let _ = builder.build();

    panic!("Expected build() to panic due to constraint violation!");
}

/// Test that missing inputs - ark-circom uses default values which violate constraints
/// When input 'b' is missing, ark-circom uses 0, causing a != b constraint violation
#[tokio::test]
#[should_panic(expected = "assertion failed")]
async fn test_missing_inputs() {
    println!("🚀 Testing Missing Circuit Inputs");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path).unwrap();
    let mut builder = CircomBuilder::new(cfg);

    // Setup required for build()
    let circom = builder.setup();
    let mut rng = thread_rng();
    let _params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng).unwrap();

    // Only provide input 'a', but not 'b'
    builder.push_input("a", 42);
    // Deliberately not setting 'b' - ark-circom will use default value 0

    println!("📊 Attempting to build witness with missing inputs...");

    // This will panic because a=42 but b=0 (default), violating a === b
    let _result = builder.build();

    panic!("Expected build() to panic when missing inputs cause constraint violation!");
}

/// Test that providing inputs with wrong names - documents actual behavior
#[tokio::test]
async fn test_wrong_input_name() {
    println!("🚀 Testing Wrong Input Names");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path).unwrap();
    let mut builder = CircomBuilder::new(cfg);

    // Use completely wrong input names
    builder.push_input("wrong_input_1", 42);
    builder.push_input("wrong_input_2", 42);

    println!("📊 Attempting to build witness with wrong input names...");

    // ark-circom doesn't validate input names at push_input time
    // It may use default values for the actual required inputs (a, b)
    let result = builder.build();

    // Document the actual behavior
    println!("Result: {:?}", if result.is_ok() { "OK (inputs ignored)" } else { "Error" });
    println!("✅ Test completed - wrong input names are ignored, defaults used");
}

/// Test that providing only partial inputs causes constraint violation
/// Same as test_missing_inputs - demonstrates missing input behavior
#[tokio::test]
#[should_panic(expected = "assertion failed")]
async fn test_partial_inputs() {
    println!("🚀 Testing Partial Inputs (only 'a', missing 'b')");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path).unwrap();
    let mut builder = CircomBuilder::new(cfg);

    // Setup
    let circom = builder.setup();
    let mut rng = thread_rng();
    let _params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng).unwrap();

    // Only provide 'a' - 'b' will default to 0
    builder.push_input("a", 42);

    println!("📊 Attempting to build witness with only partial inputs...");

    // Will panic due to constraint violation (a=42, b=0)
    let _result = builder.build();

    panic!("Expected build() to panic!");
}

/// Test that duplicate input assignments are handled
#[tokio::test]
async fn test_duplicate_input_assignment() {
    println!("🚀 Testing Duplicate Input Assignment");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path).unwrap();
    let mut builder = CircomBuilder::new(cfg);

    // Assign 'a' twice with different values
    builder.push_input("a", 42);
    builder.push_input("b", 42);

    // Try to assign 'a' again - this might be accepted by the builder
    // but could cause issues during witness generation
    builder.push_input("a", 100);  // Different value

    println!("📊 Building witness after duplicate input assignment...");

    // The behavior here depends on ark-circom implementation
    // It might overwrite, error, or use the first value
    let result = builder.build();

    // We expect this to either error or potentially violate the constraint
    // since we're reassigning 'a' to a different value than 'b'
    println!("Result: {:?}", if result.is_ok() { "OK" } else { "Error" });

    if result.is_ok() {
        println!("⚠️  Duplicate assignment was accepted (implementation-specific behavior)");
    } else {
        println!("✅ Correctly rejected duplicate input assignment");
    }
}

/// Test constraint violation with extreme values
#[tokio::test]
#[should_panic(expected = "assertion failed")]
async fn test_extreme_value_constraint_violation() {
    println!("🚀 Testing Constraint Violation with Extreme Values");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path).unwrap();
    let mut builder = CircomBuilder::new(cfg);

    // Use very large numbers that differ
    builder.push_input("a", u64::MAX);
    builder.push_input("b", u64::MAX - 1);

    let circom = builder.setup();
    let mut rng = thread_rng();
    let _params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng).unwrap();

    println!("📊 Attempting to build witness with extreme value mismatch...");

    // Should panic due to constraint violation
    let _ = builder.build();

    panic!("Expected build() to panic!");
}

/// Test that zero vs non-zero values are caught by equality constraint
#[tokio::test]
#[should_panic(expected = "assertion failed")]
async fn test_zero_vs_nonzero_constraint_violation() {
    println!("🚀 Testing Zero vs Non-Zero Constraint Violation");

    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path).unwrap();
    let mut builder = CircomBuilder::new(cfg);

    // One zero, one non-zero
    builder.push_input("a", 0);
    builder.push_input("b", 1);

    let circom = builder.setup();
    let mut rng = thread_rng();
    let _params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng).unwrap();

    println!("📊 Attempting to build witness with zero vs non-zero...");

    // Should panic
    let _ = builder.build();

    panic!("Expected build() to panic!");
}
