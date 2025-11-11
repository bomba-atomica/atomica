//! Dual Verification Demo
//!
//! This example demonstrates both verification methods:
//! 1. Native STARK verification using Plonky3
//! 2. STARK-in-SNARK verification using Groth16
//!
//! Run with: cargo run --example dual_verification_demo

use anyhow::Result;
use ark_std::rand::thread_rng;
use diem_prover_plonk::{
    prove_equality, NativeStarkProof, NativeStarkVerifier, SnarkVerifier, SnarkWrapper,
};
use diem_prover_plonk::verifier::{ProofWrapper, Verifier};
use std::time::Instant;

fn main() -> Result<()> {
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║     Plonky3 STARK Dual Verification System Demo           ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    // The value we'll prove equality for
    const TEST_VALUE: u32 = 42;

    // ═══════════════════════════════════════════════════════════════
    // Step 1: Generate STARK Proof
    // ═══════════════════════════════════════════════════════════════
    println!("┌─ Step 1: Generating STARK Proof ─────────────────────────┐");
    println!("│ Proving: {} == {}                                        │", TEST_VALUE, TEST_VALUE);

    let prove_start = Instant::now();
    let equality_proof = prove_equality(TEST_VALUE, TEST_VALUE)?;
    let prove_time = prove_start.elapsed();

    let stark_proof = NativeStarkProof {
        proof_bytes: equality_proof.proof_bytes.clone(),
        a: equality_proof.a,
        b: equality_proof.b,
        num_rows: 32,
    };

    println!("│ ✓ Proof generated in {:?}                               │", prove_time);
    println!(
        "│ ✓ Proof size: {} bytes ({:.1} KB)                         │",
        stark_proof.proof_bytes.len(),
        stark_proof.proof_bytes.len() as f64 / 1024.0
    );
    println!("└───────────────────────────────────────────────────────────┘\n");

    // ═══════════════════════════════════════════════════════════════
    // Step 2: Method 1 - Native STARK Verification
    // ═══════════════════════════════════════════════════════════════
    println!("┌─ Method 1: Native STARK Verification ────────────────────┐");
    println!("│ Properties:                                               │");
    println!("│   • Transparent setup (no trusted ceremony)              │");
    println!("│   • Post-quantum secure                                  │");
    println!("│   • Fast verification                                    │");
    println!("│   • NOT EVM-compatible                                   │");
    println!("├───────────────────────────────────────────────────────────┤");

    let native_verifier = NativeStarkVerifier::default();
    let native_result = native_verifier.verify_with_result(&stark_proof)?;

    println!("│ ✓ Verification: SUCCESS                                  │");
    println!(
        "│ ✓ Time: {} μs ({:.3} ms)                              │",
        native_result.verification_time_us,
        native_result.verification_time_us as f64 / 1000.0
    );
    println!(
        "│ ✓ Method: {:?}                                    │",
        native_result.method
    );
    if let Some(metadata) = &native_result.metadata {
        println!("│ ℹ {:<56} │", metadata);
    }
    println!("└───────────────────────────────────────────────────────────┘\n");

    // ═══════════════════════════════════════════════════════════════
    // Step 3: Method 2 - STARK-in-SNARK Verification
    // ═══════════════════════════════════════════════════════════════
    println!("┌─ Method 2: STARK-in-SNARK Verification ──────────────────┐");
    println!("│ Properties:                                               │");
    println!("│   • EVM-compatible (BN254 curve)                         │");
    println!("│   • Compact proof size (~200 bytes)                      │");
    println!("│   • Two-layer verification                               │");
    println!("│   • Requires trusted setup                               │");
    println!("├───────────────────────────────────────────────────────────┤");

    // Setup phase (trusted setup ceremony)
    println!("│ ⚙ Running trusted setup...                               │");
    let mut rng = thread_rng();
    let setup_start = Instant::now();
    let wrapper = SnarkWrapper::new(&mut rng)?;
    let setup_time = setup_start.elapsed();
    println!("│ ✓ Setup completed in {:?}                                │", setup_time);

    // Wrapping phase (proving)
    println!("│ ⚙ Wrapping STARK proof in SNARK...                       │");
    let wrap_start = Instant::now();
    let wrapped_proof = wrapper.wrap(&stark_proof)?;
    let wrap_time = wrap_start.elapsed();
    println!("│ ✓ Wrapping completed in {:?}                             │", wrap_time);
    println!(
        "│ ✓ Outer SNARK proof size: {} bytes                        │",
        wrapped_proof.outer_snark_proof.len()
    );

    // Verification phase
    println!("│ ⚙ Verifying SNARK proof...                               │");
    let snark_verifier = SnarkVerifier::new(wrapper.verifying_key().clone());
    let snark_result = snark_verifier.verify_with_result(&wrapped_proof)?;

    println!("│ ✓ Verification: SUCCESS                                  │");
    println!(
        "│ ✓ Time: {} μs ({:.3} ms)                            │",
        snark_result.verification_time_us,
        snark_result.verification_time_us as f64 / 1000.0
    );
    println!(
        "│ ✓ Method: {:?}                               │",
        snark_result.method
    );
    println!("└───────────────────────────────────────────────────────────┘\n");

    // ═══════════════════════════════════════════════════════════════
    // Step 4: Comparison
    // ═══════════════════════════════════════════════════════════════
    println!("┌─ Performance Comparison ──────────────────────────────────┐");
    println!("│                                                           │");
    println!(
        "│ Native STARK:        {:>8.3} ms                          │",
        native_result.verification_time_us as f64 / 1000.0
    );
    println!(
        "│ STARK-in-SNARK:      {:>8.3} ms                          │",
        snark_result.verification_time_us as f64 / 1000.0
    );
    println!(
        "│ Speedup:             {:>8.2}x                           │",
        snark_result.verification_time_us as f64 / native_result.verification_time_us as f64
    );
    println!("│                                                           │");
    println!("│ Proof Sizes:                                              │");
    println!(
        "│   STARK proof:       {:>8} bytes ({:>6.1} KB)            │",
        stark_proof.proof_bytes.len(),
        stark_proof.proof_bytes.len() as f64 / 1024.0
    );
    println!(
        "│   SNARK proof:       {:>8} bytes ({:>6.1} KB)            │",
        wrapped_proof.outer_snark_proof.len(),
        wrapped_proof.outer_snark_proof.len() as f64 / 1024.0
    );
    println!(
        "│   Compression:       {:>8.2}x                           │",
        stark_proof.proof_bytes.len() as f64 / wrapped_proof.outer_snark_proof.len() as f64
    );
    println!("└───────────────────────────────────────────────────────────┘\n");

    // ═══════════════════════════════════════════════════════════════
    // Step 5: Use Case Recommendations
    // ═══════════════════════════════════════════════════════════════
    println!("┌─ Use Case Recommendations ────────────────────────────────┐");
    println!("│                                                           │");
    println!("│ 🔹 Use Native STARK when:                                │");
    println!("│    • Fastest verification is required                    │");
    println!("│    • Transparent setup is critical                       │");
    println!("│    • EVM compatibility is not needed                     │");
    println!("│    • Post-quantum security is desired                    │");
    println!("│                                                           │");
    println!("│ 🔹 Use STARK-in-SNARK when:                              │");
    println!("│    • EVM/blockchain verification is required             │");
    println!("│    • Compact proof size is important                     │");
    println!("│    • On-chain gas costs must be minimized                │");
    println!("│    • BN254 curve compatibility is needed                 │");
    println!("│                                                           │");
    println!("└───────────────────────────────────────────────────────────┘\n");

    // ═══════════════════════════════════════════════════════════════
    // Summary
    // ═══════════════════════════════════════════════════════════════
    println!("╔════════════════════════════════════════════════════════════╗");
    println!("║                    Demo Complete!                          ║");
    println!("╠════════════════════════════════════════════════════════════╣");
    println!("║ Both verification methods validated the same STARK proof  ║");
    println!("║ demonstrating the dual verification architecture.         ║");
    println!("╚════════════════════════════════════════════════════════════╝\n");

    println!("Architecture Overview:");
    println!("┌──────────────────────────────────────────────────────────────┐");
    println!("│                      Equality Prover                         │");
    println!("│                    (Plonky3 STARK)                          │");
    println!("└────────────────────────┬─────────────────────────────────────┘");
    println!("                         │");
    println!("            ┌────────────┴───────────────┐");
    println!("            │                            │");
    println!("            ▼                            ▼");
    println!("  ┌──────────────────┐      ┌──────────────────────┐");
    println!("  │ Native Verifier  │      │  SNARK Wrapper       │");
    println!("  │  (Plonky3)       │      │  (Groth16)           │");
    println!("  │                  │      │                      │");
    println!("  │  Fast: ~{}ms     │      │  Creates SNARK       │",
             (native_result.verification_time_us as f64 / 1000.0) as usize);
    println!("  │  Transparent     │      │  wrapping STARK      │");
    println!("  └──────────────────┘      └──────────┬───────────┘");
    println!("                                       │");
    println!("                                       ▼");
    println!("                            ┌──────────────────────┐");
    println!("                            │  SNARK Verifier      │");
    println!("                            │  (Groth16)           │");
    println!("                            │                      │");
    println!("                            │  EVM-compatible      │");
    println!("                            │  ~{} bytes           │",
             wrapped_proof.outer_snark_proof.len());
    println!("                            └──────────────────────┘");

    Ok(())
}
