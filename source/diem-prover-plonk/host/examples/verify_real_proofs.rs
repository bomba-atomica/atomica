use diem_prover_plonk::{prove_equality, verify_equality, EqualityProof};

fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("=== Verifying Proofs are Real ===\n");

    // Test 1: Generate a valid proof
    println!("Test 1: Valid proof should verify");
    let proof = prove_equality(100, 100)?;
    println!("  Proof size: {} bytes", proof.proof_bytes.len());
    let result = verify_equality(&proof)?;
    println!("  ✓ Valid proof verified: {}", result);

    // Test 2: Tamper with proof bytes
    println!("\nTest 2: Tampered proof should fail");
    let mut tampered_proof = proof.clone();
    // Flip some bits in the middle of the proof
    if tampered_proof.proof_bytes.len() > 1000 {
        tampered_proof.proof_bytes[500] ^= 0xFF;
        tampered_proof.proof_bytes[1000] ^= 0xFF;
    }

    let tamper_result = verify_equality(&tampered_proof);
    match tamper_result {
        Ok(_) => println!("  ✗ PROBLEM: Tampered proof verified (should have failed!)"),
        Err(e) => println!("  ✓ Tampered proof correctly rejected: {}", e),
    }

    // Test 3: Try to use a proof for different values
    println!("\nTest 3: Proof with swapped values should fail");
    let proof_42 = prove_equality(42, 42)?;
    let mut swapped_proof = proof_42.clone();
    swapped_proof.a = 100;
    swapped_proof.b = 100;

    let swap_result = verify_equality(&swapped_proof);
    match swap_result {
        Ok(_) => println!("  ✗ PROBLEM: Swapped values verified (binding may be weak)"),
        Err(e) => println!("  ✓ Swapped values correctly rejected: {}", e),
    }

    // Test 4: Check proof uniqueness
    println!("\nTest 4: Check if proofs for same values are different (probabilistic)");
    let proof1 = prove_equality(42, 42)?;
    let proof2 = prove_equality(42, 42)?;

    let same = proof1.proof_bytes == proof2.proof_bytes;
    if same {
        println!("  ⚠ WARNING: Proofs are identical - may indicate deterministic mocking");
    } else {
        println!("  ✓ Proofs are different (contains randomness/challenges)");
    }

    // Test 5: Verify proof actually contains trace commitment data
    println!("\nTest 5: Proof structure verification");
    println!("  Proof bytes length: {}", proof.proof_bytes.len());

    // Try to deserialize and inspect
    match bincode::deserialize::<serde_json::Value>(&proof.proof_bytes) {
        Ok(_) => println!("  ✓ Proof contains structured data"),
        Err(e) => println!("  Note: Cannot deserialize as JSON (expected for binary): {}", e),
    }

    println!("\n=== Verification Complete ===");
    Ok(())
}
