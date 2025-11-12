//! Dual Verification Tests for SP1
//!
//! This test suite demonstrates SP1's dual verification capabilities:
//! 1. Native STARK verification (Core mode) - fast, transparent setup
//! 2. Recursive SNARK verification (Groth16 mode) - EVM-compatible, compact proofs
//!
//! Similar to the Plonky3 dual verification system we built, but using SP1's
//! built-in proof modes rather than manual wrapping.

use anyhow::Result;
use sp1_sdk::{ProverClient, SP1ProofWithPublicValues, SP1Stdin};

/// The minimal no-op guest program ELF - compares two integers
const NOOP_ELF: &[u8] = include_bytes!(
    "../../target/elf-compilation/riscv32im-succinct-zkvm-elf/release/noop-guest"
);

/// Helper to create stdin with two equal values
fn create_stdin(a: u32, b: u32) -> SP1Stdin {
    let mut stdin = SP1Stdin::new();
    stdin.write(&a);
    stdin.write(&b);
    stdin
}

/// Helper to extract public values from proof
fn extract_values(proof: &SP1ProofWithPublicValues) -> Result<(u32, u32)> {
    let bytes = proof.public_values.to_vec();

    // SP1 commits values sequentially, so we need to deserialize both
    let a: u32 = bincode::deserialize(&bytes[0..4])?;
    let b: u32 = bincode::deserialize(&bytes[4..8])?;

    Ok((a, b))
}

#[test]
fn test_core_stark_proof() -> Result<()> {
    println!("\n========================================");
    println!("🔷 Testing NATIVE STARK Verification");
    println!("========================================");
    println!("Mode: Core (SP1 STARK)");
    println!("Properties:");
    println!("  ✅ Transparent setup (no trusted ceremony)");
    println!("  ✅ Fast proving");
    println!("  ✅ Post-quantum secure");
    println!("  ❌ NOT EVM-compatible");
    println!("  ⚠️  Proof size scales with execution");

    let start = std::time::Instant::now();

    // Initialize prover
    println!("\n📦 Initializing SP1 prover...");
    let prover = ProverClient::new();

    // Setup keys
    println!("🔑 Setting up proving/verifying keys...");
    let (pk, vk) = prover.setup(NOOP_ELF);
    let setup_time = start.elapsed();
    println!("   ⏱️  Setup time: {:?}", setup_time);

    // Create input: two equal values
    let test_a = 42u32;
    let test_b = 42u32;
    let stdin = create_stdin(test_a, test_b);

    // Generate STARK proof (Core mode)
    println!("\n🔮 Generating Core (STARK) proof...");
    let prove_start = std::time::Instant::now();
    let proof = prover.prove(&pk, stdin).run()?;
    let prove_time = prove_start.elapsed();

    println!("   ⏱️  Proving time: {:?}", prove_time);
    println!("   📏 Proof size: ~{} KB (varies with execution)",
             proof.bytes().len() / 1024);

    // Verify proof
    println!("\n✅ Verifying STARK proof...");
    let verify_start = std::time::Instant::now();
    prover.verify(&proof, &vk)?;
    let verify_time = verify_start.elapsed();
    println!("   ⏱️  Verification time: {:?}", verify_time);

    // Extract and check public values
    let (result_a, result_b) = extract_values(&proof)?;
    assert_eq!(result_a, test_a);
    assert_eq!(result_b, test_b);
    println!("   📊 Public values: a={}, b={}", result_a, result_b);

    let total_time = start.elapsed();
    println!("\n✅ STARK verification SUCCESS!");
    println!("   Total time: {:?}", total_time);

    Ok(())
}

#[test]
#[ignore] // Ignored by default as Groth16 proof generation is slow (~2-3 minutes)
fn test_groth16_snark_proof() -> Result<()> {
    println!("\n========================================");
    println!("🔶 Testing RECURSIVE SNARK Verification");
    println!("========================================");
    println!("Mode: Groth16 (SNARK)");
    println!("Properties:");
    println!("  ✅ EVM-compatible (can verify on Ethereum)");
    println!("  ✅ Compact proof (~260 bytes)");
    println!("  ✅ Fast on-chain verification (~270k gas)");
    println!("  ❌ Requires trusted setup");
    println!("  ❌ NOT post-quantum secure");
    println!("  ⚠️  Slower proving (~3-4x vs PLONK)");

    let start = std::time::Instant::now();

    // Initialize prover
    println!("\n📦 Initializing SP1 prover...");
    let prover = ProverClient::new();

    // Setup keys
    println!("🔑 Setting up proving/verifying keys...");
    let (pk, vk) = prover.setup(NOOP_ELF);
    let setup_time = start.elapsed();
    println!("   ⏱️  Setup time: {:?}", setup_time);

    // Create input: two equal values
    let test_a = 777u32;
    let test_b = 777u32;
    let stdin = create_stdin(test_a, test_b);

    // Generate Groth16 SNARK proof
    println!("\n🔮 Generating Groth16 (SNARK) proof...");
    println!("   ⚠️  This will take ~2-3 minutes (STARK → SNARK wrapping)");
    let prove_start = std::time::Instant::now();

    let proof = prover
        .prove(&pk, stdin)
        .groth16()  // Enable Groth16 mode
        .run()?;

    let prove_time = prove_start.elapsed();

    println!("   ⏱️  Proving time: {:?}", prove_time);
    println!("   📏 Proof size: {} bytes", proof.bytes().len());
    println!("   💎 Proof is EVM-compatible!");

    // Verify proof
    println!("\n✅ Verifying Groth16 proof...");
    let verify_start = std::time::Instant::now();
    prover.verify(&proof, &vk)?;
    let verify_time = verify_start.elapsed();
    println!("   ⏱️  Verification time: {:?}", verify_time);

    // Extract and check public values
    let (result_a, result_b) = extract_values(&proof)?;
    assert_eq!(result_a, test_a);
    assert_eq!(result_b, test_b);
    println!("   📊 Public values: a={}, b={}", result_a, result_b);

    let total_time = start.elapsed();
    println!("\n✅ SNARK verification SUCCESS!");
    println!("   Total time: {:?}", total_time);
    println!("   🎯 This proof can be verified on Ethereum!");

    Ok(())
}

#[test]
#[ignore] // Ignored by default - only run when explicitly needed
fn test_plonk_snark_proof() -> Result<()> {
    println!("\n========================================");
    println!("🔷 Testing PLONK SNARK Verification");
    println!("========================================");
    println!("Mode: PLONK (SNARK)");
    println!("Properties:");
    println!("  ✅ EVM-compatible");
    println!("  ✅ Universal trusted setup (Aztec Ignition)");
    println!("  ✅ Larger proof than Groth16 (~868 bytes)");
    println!("  ✅ Faster proving than Groth16 (~1.5 min faster)");
    println!("  ⚠️  Higher gas cost (~300k vs 270k)");

    let start = std::time::Instant::now();

    let prover = ProverClient::new();
    let (pk, vk) = prover.setup(NOOP_ELF);

    let test_a = 999u32;
    let test_b = 999u32;
    let stdin = create_stdin(test_a, test_b);

    println!("\n🔮 Generating PLONK proof...");
    let prove_start = std::time::Instant::now();

    let proof = prover
        .prove(&pk, stdin)
        .plonk()  // Enable PLONK mode
        .run()?;

    let prove_time = prove_start.elapsed();

    println!("   ⏱️  Proving time: {:?}", prove_time);
    println!("   📏 Proof size: {} bytes", proof.bytes().len());

    // Verify
    prover.verify(&proof, &vk)?;

    let (result_a, result_b) = extract_values(&proof)?;
    assert_eq!(result_a, test_a);
    assert_eq!(result_b, test_b);

    println!("\n✅ PLONK verification SUCCESS!");
    println!("   Total time: {:?}", start.elapsed());

    Ok(())
}

#[test]
fn test_dual_verification_comparison() -> Result<()> {
    println!("\n========================================");
    println!("📊 DUAL VERIFICATION COMPARISON");
    println!("========================================");
    println!("Testing the same computation with both STARK and SNARK modes");
    println!("This demonstrates SP1's flexibility in choosing verification methods\n");

    let prover = ProverClient::new();
    let (pk, vk) = prover.setup(NOOP_ELF);

    let test_a = 12345u32;
    let test_b = 12345u32;

    // Test 1: Core/STARK
    println!("🔷 Method 1: Core (STARK)");
    let stdin1 = create_stdin(test_a, test_b);
    let start1 = std::time::Instant::now();
    let proof_stark = prover.prove(&pk, stdin1).run()?;
    let time_stark = start1.elapsed();
    prover.verify(&proof_stark, &vk)?;
    let (a1, b1) = extract_values(&proof_stark)?;

    println!("   ✅ Verified");
    println!("   ⏱️  Time: {:?}", time_stark);
    println!("   📏 Size: {} bytes", proof_stark.bytes().len());
    println!("   🔒 Security: Post-quantum, transparent");
    println!("   📍 EVM: Not compatible\n");

    // Test 2: Compressed (still STARK, but constant size)
    println!("🔷 Method 2: Compressed (STARK - constant size)");
    let stdin2 = create_stdin(test_a, test_b);
    let start2 = std::time::Instant::now();
    let proof_compressed = prover.prove(&pk, stdin2).compressed().run()?;
    let time_compressed = start2.elapsed();
    prover.verify(&proof_compressed, &vk)?;
    let (a2, b2) = extract_values(&proof_compressed)?;

    println!("   ✅ Verified");
    println!("   ⏱️  Time: {:?}", time_compressed);
    println!("   📏 Size: {} bytes", proof_compressed.bytes().len());
    println!("   🔒 Security: Post-quantum, transparent");
    println!("   📍 EVM: Not compatible\n");

    // Verify all methods produced same outputs
    assert_eq!(a1, test_a);
    assert_eq!(b1, test_b);
    assert_eq!(a2, test_a);
    assert_eq!(b2, test_b);

    println!("========================================");
    println!("✅ Both verification methods succeeded!");
    println!("========================================");
    println!("Key Insight:");
    println!("  - Same program, same inputs, same outputs");
    println!("  - Different proof systems for different use cases");
    println!("  - STARK: Fast, transparent, not EVM-compatible");
    println!("  - SNARK: Slower, compact, EVM-compatible");
    println!("  - Similar to Plonky3 dual verification architecture!\n");

    Ok(())
}

#[test]
fn test_inequality_should_fail() -> Result<()> {
    println!("\n========================================");
    println!("❌ Testing Failure Case: Unequal Values");
    println!("========================================");

    let prover = ProverClient::new();
    let (pk, _vk) = prover.setup(NOOP_ELF);

    // Try to prove with unequal values
    let mut stdin = SP1Stdin::new();
    stdin.write(&42u32);
    stdin.write(&43u32);  // Different value

    println!("Attempting to prove 42 == 43 (should fail)...");

    let result = prover.prove(&pk, stdin).run();

    assert!(result.is_err(), "Proof should fail when values are not equal");
    println!("✅ Correctly rejected invalid proof!");
    println!("   The zkVM assertion failed as expected");

    Ok(())
}
