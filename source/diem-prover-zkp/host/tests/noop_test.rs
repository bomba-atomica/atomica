use anyhow::Result;
use sp1_sdk::{ProverClient, SP1Stdin};

/// The minimal no-op guest program ELF
const NOOP_ELF: &[u8] = include_bytes!("../../target/elf-compilation/riscv32im-succinct-zkvm-elf/release/noop-guest");

/// Fast test to verify SP1 prover works correctly
/// This should complete in under 60 seconds
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
    let (pk, vk) = prover.setup(NOOP_ELF);
    println!("   ⏱️  {:?}", keygen_start.elapsed());

    // Prepare input (just a number)
    let mut stdin = SP1Stdin::new();
    stdin.write(&42u32);

    // Generate proof
    println!("\n🔮 Step 3: Generate proof (should be fast for noop program)");
    let prove_start = std::time::Instant::now();
    let proof = prover
        .prove(&pk, stdin)
        .compressed()
        .run()?;
    let prove_time = prove_start.elapsed();
    println!("   ⏱️  {:?}", prove_time);
    println!("   📏 Proof size: {} bytes", proof.bytes().len());

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

    // Ensure it completed reasonably fast
    assert!(total_time.as_secs() < 120, "Test should complete in under 2 minutes, took {:?}", total_time);

    Ok(())
}
