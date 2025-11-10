use diem_prover_stwo::{prove_equality, verify_equality};

/// Test that verifies the equality check works correctly when numbers match
#[test]
fn test_equality_happy_case() {
    println!("🚀 Testing Equality AIR - Happy Case (numbers match)");

    let a = 42;
    let b = 42;
    println!("\n🔢 Testing with a={}, b={} (should match)", a, b);

    // Generate proof
    println!("\n🔮 Generating STARK proof");
    let proof_start = std::time::Instant::now();
    let proof = prove_equality(a, b).expect("Proof generation should succeed");
    let proof_time = proof_start.elapsed();
    println!("   ⏱️  Proof generation: {:?}", proof_time);

    // Verify proof
    println!("\n✓ Verifying proof");
    let verify_start = std::time::Instant::now();
    let verified = verify_equality(&proof).expect("Verification should succeed");
    let verify_time = verify_start.elapsed();
    println!("   ⏱️  Verification: {:?}", verify_time);

    assert!(verified, "Proof should verify for equal values");
    println!("\n✅ Equality test (happy case) passed!");
    println!("   Total time: {:?}", proof_start.elapsed());
    println!("   - Prove: {:?}", proof_time);
    println!("   - Verify: {:?}", verify_time);
}

/// Test that verifies the equality check correctly fails when numbers don't match
#[test]
fn test_equality_failure_case() {
    println!("🚀 Testing Equality AIR - Failure Case (numbers don't match)");

    let a = 42;
    let b = 43;
    println!("\n🔢 Testing with a={}, b={} (should NOT match)", a, b);

    // This should return an error because a != b
    println!("\n📊 Attempting to generate proof (expecting error)");
    let result = prove_equality(a, b);

    assert!(result.is_err(), "Expected prove_equality to fail when a != b");
    let error_msg = result.unwrap_err().to_string();
    assert!(
        error_msg.contains("Cannot prove equality"),
        "Error message should indicate equality failure"
    );
    println!("✅ Correctly rejected proof for unequal values");
}

#[test]
fn test_equality_zero_values() {
    println!("🚀 Testing Equality AIR - Zero Values");

    let a = 0;
    let b = 0;

    let proof = prove_equality(a, b).expect("Proof generation should succeed");
    let verified = verify_equality(&proof).expect("Verification should succeed");

    assert!(verified, "Proof should verify for zero values");
    println!("✅ Zero values test passed!");
}

#[test]
fn test_equality_large_values() {
    println!("🚀 Testing Equality AIR - Large Values");

    let a = 999999;
    let b = 999999;

    let proof = prove_equality(a, b).expect("Proof generation should succeed");
    let verified = verify_equality(&proof).expect("Verification should succeed");

    assert!(verified, "Proof should verify for large values");
    println!("✅ Large values test passed!");
}

#[test]
fn test_proof_serialization() {
    println!("🚀 Testing Proof Serialization");

    let a = 12345;
    let b = 12345;

    // Generate proof
    let proof = prove_equality(a, b).expect("Proof generation should succeed");

    // Serialize to JSON
    let serialized = serde_json::to_string(&proof).expect("Serialization should succeed");
    println!("   Serialized proof size: {} bytes", serialized.len());

    // Deserialize back
    let deserialized: diem_prover_stwo::EqualityProof =
        serde_json::from_str(&serialized).expect("Deserialization should succeed");

    // Verify deserialized proof
    let verified = verify_equality(&deserialized).expect("Verification should succeed");
    assert!(verified, "Deserialized proof should verify");

    println!("✅ Serialization test passed!");
}
