use anyhow::Result;
use sp1_sdk::{ProverClient, SP1Stdin};

/// The minimal no-op guest program ELF
const NOOP_ELF: &[u8] = include_bytes!("../../target/elf-compilation/riscv32im-succinct-zkvm-elf/release/noop-guest");

/// Test to verify SP1 prover toolchain works correctly with a minimal noop program
/// Uses core proving mode which is fast for testing (compressed/plonk/groth16 take much longer)
/// This validates: ProverClient init, key generation, proof generation, and public value extraction
#[test]
fn test_noop_proof() -> Result<()> {
    println!("🚀 Testing SP1 Prover with Minimal No-Op Program");
    println!("📦 Guest program size: {} bytes", NOOP_ELF.len());

    let test_start = std::time::Instant::now();

    // Initialize SP1 prover
    println!("\n🔧 Step 1: Initialize prover");
    let prover_start = std::time::Instant::now();
    let prover = ProverClient::new();
    println!("   ⏱️  {:?}", prover_start.elapsed());

    // Setup keys
    println!("\n🔑 Step 2: Generate proving/verifying keys");
    let keygen_start = std::time::Instant::now();
    let (pk, _vk) = prover.setup(NOOP_ELF);
    println!("   ⏱️  {:?}", keygen_start.elapsed());

    // Prepare input (just a number)
    let mut stdin = SP1Stdin::new();
    stdin.write(&42u32);

    // Generate proof (using core mode - fast for testing, doesn't support on-chain verification)
    println!("\n🔮 Step 3: Generate proof (core mode for fast testing)");
    let prove_start = std::time::Instant::now();
    let proof = prover
        .prove(&pk, stdin)
        .run()?;
    let prove_time = prove_start.elapsed();
    println!("   ⏱️  {:?}", prove_time);
    println!("   ✅ Proof generated successfully");

    // Extract result
    println!("\n📊 Step 4: Extract public values");
    let extract_start = std::time::Instant::now();
    let public_values_bytes = proof.public_values.to_vec();
    let result: u32 = bincode::deserialize(&public_values_bytes)?;
    println!("   ⏱️  {:?}", extract_start.elapsed());
    println!("   Result: {} (expected: 43)", result);

    // Verify result
    assert_eq!(result, 43, "Expected 42 + 1 = 43");

    let total_time = test_start.elapsed();
    println!("\n✅ No-op test passed!");
    println!("   Total time: {:?}", total_time);

    // Ensure it completed in reasonable time (core mode is faster than compressed)
    assert!(total_time.as_secs() < 300, "Test should complete in under 5 minutes, took {:?}", total_time);

    Ok(())
}
