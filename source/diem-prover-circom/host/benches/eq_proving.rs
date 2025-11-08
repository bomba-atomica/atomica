use ark_bn254::{Bn254, Fr};
use ark_circom::{CircomBuilder, CircomConfig};
use ark_groth16::Groth16;
use ark_snark::SNARK;
use ark_std::rand::thread_rng;
use std::path::PathBuf;

fn main() {
    // Run registered benchmarks
    divan::main();
}

/// Benchmark: Complete proof generation workflow
///
/// This measures the total time from circuit loading to proof generation,
/// including all setup steps. This represents the "cold start" scenario.
#[divan::bench]
fn complete_proof_generation() {
    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    // Load circuit
    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path).unwrap();
    let mut builder = CircomBuilder::new(cfg);

    // Set inputs
    builder.push_input("a", 42);
    builder.push_input("b", 42);

    // Setup (trusted setup)
    let circom = builder.setup();
    let mut rng = thread_rng();
    let params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng).unwrap();

    // Build witness
    let circom = builder.build().unwrap();

    // Generate proof (this is the stage we're most interested in)
    let _proof = Groth16::<Bn254>::prove(&params, circom, &mut rng).unwrap();
}

/// Benchmark: Proof generation only (hot path)
///
/// This measures only the proof generation step, assuming circuit is loaded
/// and parameters are already generated. This represents the "hot path" scenario
/// where we're generating multiple proofs with the same circuit.
#[divan::bench]
fn proof_generation_only() -> ark_groth16::Proof<Bn254> {
    // Setup is done once outside the benchmark
    divan::black_box(proof_generation_only_setup())
}

// Helper function that does setup (not benchmarked)
fn proof_generation_only_setup() -> ark_groth16::Proof<Bn254> {
    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path).unwrap();
    let mut builder = CircomBuilder::new(cfg);

    builder.push_input("a", 42);
    builder.push_input("b", 42);

    let circom = builder.setup();
    let mut rng = thread_rng();
    let params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng).unwrap();

    let circom = builder.build().unwrap();

    // Only this part is benchmarked
    Groth16::<Bn254>::prove(&params, circom, &mut rng).unwrap()
}

/// Benchmark: Witness generation
///
/// Measures the time to compute the witness (all wire values in the circuit)
/// from the inputs. This is pure circuit computation.
#[divan::bench]
fn witness_generation() {
    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path).unwrap();
    let mut builder = CircomBuilder::new(cfg);

    builder.push_input("a", 42);
    builder.push_input("b", 42);

    // Setup (not benchmarked, done once)
    let _circom = builder.setup();

    // Only witness generation is benchmarked
    let _circom = divan::black_box(builder.build().unwrap());
}

/// Benchmark: Trusted setup (parameter generation)
///
/// Measures the time to generate proving and verification keys.
/// This is done once per circuit in production.
#[divan::bench]
fn trusted_setup() {
    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path).unwrap();
    let mut builder = CircomBuilder::new(cfg);

    builder.push_input("a", 42);
    builder.push_input("b", 42);

    let circom = builder.setup();
    let mut rng = thread_rng();

    // This is what we're benchmarking
    let _params = divan::black_box(
        Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng).unwrap()
    );
}

/// Benchmark: Circuit loading
///
/// Measures the time to load and parse circuit files (WASM + R1CS).
/// This is the first step in any proof generation.
#[divan::bench]
fn circuit_loading() {
    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    // This is what we're benchmarking
    let cfg = divan::black_box(CircomConfig::<Fr>::new(cfg_path, r1cs_path).unwrap());
    let _builder = CircomBuilder::new(cfg);
}

/// Benchmark: Proof verification
///
/// Measures the time to verify a proof. This is typically very fast
/// and is what end-users (verifiers) need to run.
#[divan::bench]
fn proof_verification() {
    // Pre-generate a proof (not benchmarked)
    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path).unwrap();
    let mut builder = CircomBuilder::new(cfg);

    builder.push_input("a", 42);
    builder.push_input("b", 42);

    let circom = builder.setup();
    let mut rng = thread_rng();
    let params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng).unwrap();

    let circom = builder.build().unwrap();
    let inputs = circom.get_public_inputs().unwrap();
    let proof = Groth16::<Bn254>::prove(&params, circom, &mut rng).unwrap();

    let pvk = Groth16::<Bn254>::process_vk(&params.vk).unwrap();

    // Only verification is benchmarked
    let _verified = divan::black_box(
        Groth16::<Bn254>::verify_with_processed_vk(&pvk, &inputs, &proof).unwrap()
    );
}

/// Benchmark group: Compare different input values
///
/// Measures if proof generation time varies with different input values.
/// It should be constant-time for security (to prevent timing attacks).
#[divan::bench(args = [0, 42, 1337, u64::MAX])]
fn proof_with_different_inputs(value: u64) {
    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path).unwrap();
    let mut builder = CircomBuilder::new(cfg);

    // Use the parameterized input value
    builder.push_input("a", value);
    builder.push_input("b", value);

    let circom = builder.setup();
    let mut rng = thread_rng();
    let params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng).unwrap();

    let circom = builder.build().unwrap();

    // Benchmark proof generation with this input value
    let _proof = divan::black_box(
        Groth16::<Bn254>::prove(&params, circom, &mut rng).unwrap()
    );
}
