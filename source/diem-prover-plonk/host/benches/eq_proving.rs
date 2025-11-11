use diem_prover_stwo::{prove_equality, verify_equality};

fn main() {
    // Run registered benchmarks
    divan::main();
}

/// Benchmark: Complete proof generation workflow
///
/// This measures the total time from start to proof generation,
/// including all setup steps. This represents the "cold start" scenario.
#[divan::bench]
fn complete_proof_generation() {
    let a = 42;
    let b = 42;

    // Generate proof (includes trace generation, commitment, and proof)
    let proof = prove_equality(a, b).unwrap();

    // Prevent optimization
    divan::black_box(proof);
}

/// Benchmark: Proof generation only (hot path)
///
/// This measures only the proof generation step.
/// This represents the "hot path" scenario where we're generating multiple proofs.
#[divan::bench]
fn proof_generation_only() {
    let a = 42;
    let b = 42;

    let proof = prove_equality(a, b).unwrap();
    divan::black_box(proof);
}

/// Benchmark: Proof verification
///
/// This measures the time to verify a proof.
/// This is what end-users/verifiers need to run and should be fast.
#[divan::bench]
fn proof_verification() {
    // Pre-generate a proof (not benchmarked)
    let a = 42;
    let b = 42;
    let proof = prove_equality(a, b).unwrap();

    // Only verification is benchmarked
    let verified = verify_equality(&proof).unwrap();
    divan::black_box(verified);
}

/// Benchmark: Proof serialization
///
/// Measures the time to serialize a proof to JSON
#[divan::bench]
fn proof_serialization() {
    let a = 42;
    let b = 42;
    let proof = prove_equality(a, b).unwrap();

    // Benchmark serialization
    let serialized = serde_json::to_string(&proof).unwrap();
    divan::black_box(serialized);
}

/// Benchmark: Proof deserialization
///
/// Measures the time to deserialize a proof from JSON
#[divan::bench]
fn proof_deserialization() {
    let a = 42;
    let b = 42;
    let proof = prove_equality(a, b).unwrap();
    let serialized = serde_json::to_string(&proof).unwrap();

    // Benchmark deserialization
    let deserialized: diem_prover_stwo::EqualityProof =
        serde_json::from_str(&serialized).unwrap();
    divan::black_box(deserialized);
}

/// Benchmark group: Compare different input values
///
/// Measures if proof generation time varies with different input values.
/// It should be constant-time for security (to prevent timing attacks).
#[divan::bench(args = [0, 42, 1337, 999999])]
fn proof_with_different_inputs(value: u32) {
    let proof = prove_equality(value, value).unwrap();
    divan::black_box(proof);
}

/// Benchmark: Full round-trip (generate + serialize + deserialize + verify)
///
/// This measures the complete end-to-end workflow
#[divan::bench]
fn full_round_trip() {
    let a = 42;
    let b = 42;

    // Generate proof
    let proof = prove_equality(a, b).unwrap();

    // Serialize
    let serialized = serde_json::to_string(&proof).unwrap();

    // Deserialize
    let deserialized: diem_prover_stwo::EqualityProof =
        serde_json::from_str(&serialized).unwrap();

    // Verify
    let verified = verify_equality(&deserialized).unwrap();

    divan::black_box(verified);
}
