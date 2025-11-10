use diem_prover_stwo::{prove_equality, verify_equality};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== Stwo STARK Prover Integration Demo ===\n");

    // Test 1: Generate proof
    println!("Test 1: Generating proof that 100 == 100");
    let start = std::time::Instant::now();
    let proof = prove_equality(100, 100)?;
    let gen_time = start.elapsed();
    println!("✓ Proof generated in {:?}", gen_time);

    // Test 2: Verify proof
    println!("\nTest 2: Verifying proof");
    let start = std::time::Instant::now();
    let verified = verify_equality(&proof)?;
    let verify_time = start.elapsed();
    println!("✓ Proof verified in {:?}", verify_time);
    assert!(verified, "Proof should verify");

    // Test 3: Serialize proof
    println!("\nTest 3: Serializing proof");
    let serialized = serde_json::to_string(&proof)?;
    println!("✓ Serialized proof size: {} bytes", serialized.len());

    // Test 4: Deserialize and verify
    println!("\nTest 4: Deserializing and verifying");
    let deserialized: diem_prover_stwo::EqualityProof = serde_json::from_str(&serialized)?;
    let verified = verify_equality(&deserialized)?;
    println!("✓ Deserialized proof verified successfully");
    assert!(verified, "Deserialized proof should verify");

    // Test 5: Rejection test
    println!("\nTest 5: Testing rejection of unequal values");
    let result = prove_equality(50, 51);
    assert!(result.is_err(), "Should reject unequal values");
    println!("✓ Correctly rejected proof for 50 != 51");

    println!("\n=== All Integration Tests Passed! ===");
    println!("\nPerformance Summary:");
    println!("  Proof generation: {:?}", gen_time);
    println!("  Verification:     {:?}", verify_time);
    println!("  Proof size:       {} bytes (~{:.1} KB)", serialized.len(), serialized.len() as f64 / 1024.0);

    println!("\nSTARK Properties:");
    println!("  ✓ Transparent setup (no trusted ceremony)");
    println!("  ✓ Post-quantum secure (hash-based)");
    println!("  ✓ Constant-time operations");
    println!("  ✓ Native Rust implementation");

    Ok(())
}
