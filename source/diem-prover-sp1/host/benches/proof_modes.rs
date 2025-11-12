//! Benchmarks for SP1 Proof Modes
//!
//! Compares performance of different SP1 proof modes:
//! - Core (STARK): Fast proving, transparent setup
//! - Compressed (STARK): Constant-size STARK proofs
//! - Groth16 (SNARK): EVM-compatible, smallest proofs
//! - PLONK (SNARK): EVM-compatible, universal setup
//!
//! Run with: cargo bench --bench proof_modes --release

use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use sp1_sdk::{ProverClient, SP1Stdin};

const NOOP_ELF: &[u8] = include_bytes!(
    "../../target/elf-compilation/riscv32im-succinct-zkvm-elf/release/noop-guest"
);

fn create_stdin(a: u32, b: u32) -> SP1Stdin {
    let mut stdin = SP1Stdin::new();
    stdin.write(&a);
    stdin.write(&b);
    stdin
}

fn bench_core_proving(c: &mut Criterion) {
    let mut group = c.benchmark_group("SP1_Core_STARK");
    group.sample_size(10); // Reduce samples for slow benchmarks

    let prover = ProverClient::new();
    let (pk, _vk) = prover.setup(NOOP_ELF);

    group.bench_function("prove_core", |b| {
        b.iter(|| {
            let stdin = create_stdin(black_box(42), black_box(42));
            prover.prove(&pk, stdin).run().unwrap()
        });
    });

    group.finish();
}

fn bench_compressed_proving(c: &mut Criterion) {
    let mut group = c.benchmark_group("SP1_Compressed_STARK");
    group.sample_size(10);

    let prover = ProverClient::new();
    let (pk, _vk) = prover.setup(NOOP_ELF);

    group.bench_function("prove_compressed", |b| {
        b.iter(|| {
            let stdin = create_stdin(black_box(42), black_box(42));
            prover.prove(&pk, stdin).compressed().run().unwrap()
        });
    });

    group.finish();
}

fn bench_groth16_proving(c: &mut Criterion) {
    let mut group = c.benchmark_group("SP1_Groth16_SNARK");
    group.sample_size(5); // Very slow, reduce samples
    group.measurement_time(std::time::Duration::from_secs(300)); // 5 minutes

    let prover = ProverClient::new();
    let (pk, _vk) = prover.setup(NOOP_ELF);

    group.bench_function("prove_groth16", |b| {
        b.iter(|| {
            let stdin = create_stdin(black_box(42), black_box(42));
            prover.prove(&pk, stdin).groth16().run().unwrap()
        });
    });

    group.finish();
}

fn bench_plonk_proving(c: &mut Criterion) {
    let mut group = c.benchmark_group("SP1_PLONK_SNARK");
    group.sample_size(5);
    group.measurement_time(std::time::Duration::from_secs(240)); // 4 minutes

    let prover = ProverClient::new();
    let (pk, _vk) = prover.setup(NOOP_ELF);

    group.bench_function("prove_plonk", |b| {
        b.iter(|| {
            let stdin = create_stdin(black_box(42), black_box(42));
            prover.prove(&pk, stdin).plonk().run().unwrap()
        });
    });

    group.finish();
}

fn bench_verification(c: &mut Criterion) {
    let prover = ProverClient::new();
    let (pk, vk) = prover.setup(NOOP_ELF);

    // Pre-generate proofs for verification benchmarks
    let stdin_core = create_stdin(42, 42);
    let proof_core = prover.prove(&pk, stdin_core).run().unwrap();

    let stdin_compressed = create_stdin(42, 42);
    let proof_compressed = prover.prove(&pk, stdin_compressed).compressed().run().unwrap();

    let mut group = c.benchmark_group("SP1_Verification");

    group.bench_function("verify_core", |b| {
        b.iter(|| {
            prover.verify(black_box(&proof_core), black_box(&vk)).unwrap()
        });
    });

    group.bench_function("verify_compressed", |b| {
        b.iter(|| {
            prover.verify(black_box(&proof_compressed), black_box(&vk)).unwrap()
        });
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_core_proving,
    bench_compressed_proving,
    bench_verification,
    // Note: Groth16 and PLONK benchmarks are commented out by default (very slow)
    // Uncomment to include:
    // bench_groth16_proving,
    // bench_plonk_proving,
);

criterion_main!(benches);
