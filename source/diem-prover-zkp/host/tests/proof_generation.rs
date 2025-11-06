use anyhow::Result;
use sp1_sdk::{ProverClient, SP1Stdin};
use std::fs;

// Include the types module
include!("../src/types.rs");

/// The compiled guest program ELF binary (built by build.rs using SP1)
const GUEST_ELF: &[u8] = include_bytes!("../../target/elf-compilation/riscv32im-succinct-zkvm-elf/release/diem-guest");

#[test]
fn test_generate_and_verify_proof() -> Result<()> {
    println!("🚀 Diem ZK Proof Generator - Integration Test");
    println!("📦 Guest program size: {} bytes", GUEST_ELF.len());

    // Create a test state proof using fixture data
    println!("\n📋 Creating test state proof...");
    let state_proof = AptosStateProof::test_proof();

    println!("   - Old version: {}", state_proof.old_version);
    println!("   - New version: {}", state_proof.new_version);
    println!("   - Validators: {}", state_proof.validators.len());
    println!("   - Signatures: {}", state_proof.signatures.len());

    // Validate test data
    assert_eq!(state_proof.old_version, 100);
    assert_eq!(state_proof.new_version, 200);
    assert!(!state_proof.validators.is_empty(), "Validators should not be empty");
    assert!(!state_proof.signatures.is_empty(), "Signatures should not be empty");

    // Initialize SP1 prover
    println!("\n🔧 Initializing SP1 prover...");
    let prover = ProverClient::new();

    // Setup proving key from ELF
    let (pk, vk) = prover.setup(GUEST_ELF);

    // Prepare input for the guest program
    let mut stdin = SP1Stdin::new();
    stdin.write(&state_proof);

    // Generate the proof
    println!("\n🔮 Generating ZK proof (this may take a few minutes)...");
    println!("   Using compressed mode for balance of size and speed");

    let start = std::time::Instant::now();

    let proof = prover
        .prove(&pk, stdin)
        .compressed()
        .run()?;

    let elapsed = start.elapsed();

    println!("\n✅ Proof generated successfully!");
    println!("   Time: {:.2}s", elapsed.as_secs_f64());
    println!("   Proof size: {} bytes", proof.bytes().len());

    // Validate proof is not empty
    assert!(!proof.bytes().is_empty(), "Proof should not be empty");

    // Extract public values
    let public_values_bytes = proof.public_values.to_vec();
    let public_values: PublicValues = bincode::deserialize(&public_values_bytes)?;

    println!("\n📊 Public Values:");
    println!("   Old version: {}", public_values.old_version);
    println!("   New version: {}", public_values.new_version);
    println!("   Epoch: {}", public_values.epoch);

    // Validate public values match input
    assert_eq!(public_values.old_version, state_proof.old_version);
    assert_eq!(public_values.new_version, state_proof.new_version);
    assert_eq!(public_values.epoch, state_proof.epoch);

    // Save proof to file for inspection (optional, can be removed for CI)
    let proof_path = "proof.bin";
    fs::write(proof_path, proof.bytes())?;
    println!("\n💾 Proof saved to: {}", proof_path);

    // Save public values to file (optional, can be removed for CI)
    let public_values_path = "public_values.json";
    let json = serde_json::to_string_pretty(&public_values)?;
    fs::write(public_values_path, json)?;
    println!("💾 Public values saved to: {}", public_values_path);

    // Verify the proof
    println!("\n🔍 Verifying proof...");
    prover.verify(&proof, &vk)?;
    println!("✅ Proof verified successfully!");

    println!("\n🎉 Integration test passed!");
    println!("   - {} ({} bytes)", proof_path, fs::metadata(proof_path)?.len());
    println!("   - {}", public_values_path);

    Ok(())
}
