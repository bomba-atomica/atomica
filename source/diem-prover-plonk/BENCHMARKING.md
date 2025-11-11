# Benchmarking Guide for diem-prover-stwo

## Overview

This project uses [Divan](https://github.com/nvzqz/divan) for benchmarking STARK proof generation and verification performance. Benchmarks are critical for:

1. **Performance Regression Detection**: Catch slowdowns from code changes or dependency updates
2. **Optimization Validation**: Measure impact of performance improvements
3. **Production Capacity Planning**: Understand throughput and resource requirements
4. **Security Analysis**: Verify constant-time operations (timing attack prevention)

---

## Running Benchmarks

### Quick Start

```bash
# Run all benchmarks
cargo bench

# Run specific benchmark file
cargo bench --bench eq_proving

# Run with specific filters
cargo bench --bench eq_proving -- proof_generation

# Generate comparison with baseline
cargo bench -- --save-baseline main
cargo bench -- --baseline main
```

### Benchmark Output

Divan provides detailed statistics including:
- Mean execution time
- Standard deviation
- Min/max times
- Throughput (operations/second)
- Memory allocation statistics

---

## Current Benchmarks

### Equality AIR Benchmarks (`benches/eq_proving.rs`)

#### 1. `complete_proof_generation`
**What it measures**: End-to-end time from start to proof generation

**Use case**: "Cold start" scenario - first proof generation

**Includes**:
- Trace generation
- Polynomial commitment setup
- FRI protocol execution
- Proof generation

**Expected time**: ~2-3ms (depends on hardware)

---

#### 2. `proof_generation_only`
**What it measures**: Pure proof generation time (hot path)

**Use case**: Generating multiple proofs with pre-loaded system

**Includes**:
- Trace generation
- Commitment generation
- Proof generation

**Expected time**: ~1-2ms

**Note**: This is the most important metric for production throughput

---

#### 3. `proof_verification`
**What it measures**: Time to verify a STARK proof

**Use case**: End-user/verifier performance

**Includes**:
- FRI verification
- Polynomial commitment checks
- Constraint satisfaction verification

**Expected time**: ~2-3ms

**Note**: This is what end-users run

---

#### 4. `proof_serialization`
**What it measures**: Time to serialize proof to JSON

**Use case**: Network transmission overhead

**Includes**:
- JSON encoding
- Data structure traversal

**Expected time**: ~1-2ms

---

#### 5. `proof_deserialization`
**What it measures**: Time to deserialize proof from JSON

**Use case**: Receiving and parsing proofs

**Includes**:
- JSON parsing
- Data structure reconstruction

**Expected time**: ~1-2ms

---

#### 6. `proof_with_different_inputs`
**What it measures**: Proof generation time across different input values

**Parameters tested**: `[0, 42, 1337, 999999]`

**Use case**: Verifying constant-time behavior (security)

**Expected behavior**: All inputs should take similar time

**Security**: Large timing differences could indicate timing attack vulnerabilities

---

#### 7. `full_round_trip`
**What it measures**: Complete workflow including serialization

**Use case**: Real-world usage pattern

**Includes**:
- Proof generation
- Serialization
- Deserialization
- Verification

**Expected time**: ~4-6ms

---

## Performance Baselines

### Target Performance (Equality AIR)

| Operation | Target | Acceptable | Critical |
|-----------|--------|------------|----------|
| Proof Generation (hot) | <2ms | <3ms | <5ms |
| Proof Verification | <3ms | <5ms | <10ms |
| Trace Generation | <500µs | <1ms | <2ms |
| Proof Serialization | <2ms | <3ms | <5ms |

### Throughput Targets

- **Proofs/second**: >300 (hot path, single thread)
- **Verifications/second**: >300 (single thread)
- **Parallel proving**: Linear scaling up to CPU cores

### Proof Size

- **Target**: <10 KB
- **Current**: ~7.7 KB
- **Acceptable**: <15 KB

---

## Interpreting Results

### Good Signs ✅

- Consistent timing across runs (low std dev)
- Constant time across different inputs
- Linear scaling with trace size
- Stable performance across dependency updates
- Proof size under 10 KB

### Warning Signs ⚠️

- High standard deviation (>20% of mean)
- Timing varies with input values (timing attack risk)
- Performance degrades with minor code changes
- Memory usage grows unexpectedly
- Proof size increasing

### Critical Issues 🚨

- Verification slower than proving (should be similar)
- Non-linear scaling with trace size
- >2x performance regression from baseline
- Memory leaks in repeated operations
- Timing attacks possible (input-dependent timing)

---

## Best Practices

### 1. Establish Baselines

Before making changes:
```bash
# Save current performance as baseline
cargo bench -- --save-baseline before-optimization

# Make your changes...

# Compare against baseline
cargo bench -- --baseline before-optimization
```

### 2. Run on Consistent Hardware

- Use same machine for comparisons
- Close background applications
- Disable CPU frequency scaling if possible
- Run multiple times to account for variance

### 3. Benchmark in Release Mode

Always use release builds for meaningful results:
```bash
# Benchmarks automatically use release mode
cargo bench

# Never benchmark debug builds
```

### 4. Monitor for Regressions

Set up CI to catch performance regressions:
```yaml
# Example GitHub Actions
- name: Run benchmarks
  run: cargo bench --bench eq_proving -- --save-baseline ci

- name: Compare with main branch
  run: |
    git checkout main
    cargo bench --bench eq_proving -- --save-baseline main
    git checkout -
    cargo bench --bench eq_proving -- --baseline main
```

---

## STARK-Specific Considerations

### Trace Size Impact

STARK performance scales with trace size:
- **Small trace** (32 rows): ~1-2ms
- **Medium trace** (1024 rows): ~5-10ms
- **Large trace** (1M rows): ~100-500ms

Benchmark with representative trace sizes for your use case.

### FRI Parameters

FRI protocol parameters affect performance:
- **Log blowup factor**: Higher = larger proofs, more security
- **Number of queries**: More queries = more security, larger proofs
- **Fold factor**: Affects proof size and verification time

Current defaults are optimized for:
- Security level: ~100 bits
- Proof size: ~7-10 KB
- Fast verification: <5ms

### Commitment Scheme

The project uses Blake2s Merkle tree commitments:
- Fast on x86_64 (SIMD optimized)
- Constant-time operations
- ~2x faster than SHA2
- Post-quantum secure

---

## Advanced Usage

### Flamegraphs for Profiling

Identify performance bottlenecks:

```bash
# Install cargo-flamegraph
cargo install flamegraph

# Generate flamegraph for specific benchmark
cargo flamegraph --bench eq_proving -- proof_generation_only

# Opens flamegraph.svg showing where time is spent
```

### Memory Profiling

Track memory allocations:

```bash
# Divan includes allocation statistics by default
cargo bench --bench eq_proving

# Look for "allocs" and "bytes" columns in output
```

### Statistical Analysis

Divan provides:
- **Mean**: Average execution time
- **Median**: Middle value (less affected by outliers)
- **Std Dev**: Consistency measure
- **Min/Max**: Best/worst case performance

---

## Security Considerations

### Constant-Time Operations

STARK implementations must not leak information through timing:

```bash
# Benchmark with different inputs
cargo bench --bench eq_proving -- proof_with_different_inputs

# Verify timing is similar across all input values
# Large differences indicate potential timing attacks
```

**What to check**:
- Proof generation time should not depend on input values
- Trace generation time should be constant for same size
- Verification time is allowed to vary slightly with proof structure

### Side-Channel Resistance

Monitor for:
- Cache timing attacks (check CPU cache behavior)
- Branch prediction leaks (ensure constant control flow)
- Memory access patterns (should be data-independent)

STARK proofs are inherently more resistant to side-channels than pairing-based systems.

---

## Extending Benchmarks

### Adding New AIR Benchmarks

1. Create new file in `benches/`:
```rust
// benches/my_air_proving.rs
use divan;

fn main() {
    divan::main();
}

#[divan::bench]
fn my_air_proof_generation() {
    // Your benchmark code
}
```

2. Update `Cargo.toml`:
```toml
[[bench]]
name = "my_air_proving"
harness = false
```

3. Run it:
```bash
cargo bench --bench my_air_proving
```

### Parameterized Benchmarks

Test across multiple scenarios:

```rust
#[divan::bench(args = [10, 100, 1000, 10000])]
fn proof_with_different_trace_sizes(size: usize) {
    // Generate proof for AIR with given trace size
}
```

### Benchmark Groups

Organize related benchmarks:

```rust
#[divan::bench_group(name = "proving")]
mod proving {
    #[divan::bench]
    fn small_trace() { }

    #[divan::bench]
    fn large_trace() { }
}
```

---

## Continuous Benchmarking

### GitHub Actions Integration

```yaml
name: Benchmarks

on:
  push:
    branches: [main]
  pull_request:

jobs:
  benchmark:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions-rs/toolchain@v1
        with:
          toolchain: nightly

      - name: Run benchmarks
        run: cargo bench --bench eq_proving

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: bench-results
          path: target/criterion/
```

### Regression Detection

Fail CI if performance degrades >10%:

```bash
#!/bin/bash
# scripts/bench-regression-check.sh

CURRENT=$(cargo bench --bench eq_proving -- proof_generation_only | grep "mean" | awk '{print $2}')
BASELINE=2  # ms

if (( $(echo "$CURRENT > $BASELINE * 1.1" | bc -l) )); then
    echo "Performance regression detected: ${CURRENT}ms > ${BASELINE}ms"
    exit 1
fi
```

---

## Troubleshooting

### Benchmarks Too Slow

If benchmarks take >5 minutes:

1. **Reduce sample size**:
```rust
#[divan::bench(sample_count = 10)]  // Default is 100
fn my_slow_benchmark() { }
```

2. **Skip expensive setup**:
```rust
#[divan::bench]
fn my_benchmark(bencher: divan::Bencher) {
    let setup = expensive_setup();  // Runs once

    bencher.bench_local(|| {
        // Only this is timed
        use_setup(&setup);
    });
}
```

### Inconsistent Results

High variance can indicate:
- Background processes interfering
- Thermal throttling
- Memory pressure
- Cache effects

**Solution**: Run on dedicated hardware or increase sample count

### Compilation Errors

If benchmarks fail to compile:
- Ensure you're using nightly Rust
- Check that stwo dependencies are properly linked
- Verify `Cargo.toml` has `divan` in `[dev-dependencies]`

---

## Future Benchmarks (Planned)

1. **Different Trace Sizes**
   - Small (32 rows)
   - Medium (1K rows)
   - Large (1M rows)

2. **Batch Proving**
   - Multiple proofs in sequence
   - Parallel proof generation

3. **Different AIRs**
   - Range proofs
   - Signature verification
   - Hash verification

4. **Memory Usage**
   - Peak memory during proving
   - Memory usage scaling with trace size

5. **Cross-Platform**
   - macOS x86_64 vs aarch64
   - Linux x86_64
   - Performance portability

---

## References

- [Divan Documentation](https://docs.rs/divan/)
- [Stwo Repository](https://github.com/starkware-libs/stwo)
- [STARK Performance Analysis](https://starkware.co/stark/)
- [Circle STARKs Paper](https://eprint.iacr.org/2024/278)

---

## Quick Reference

```bash
# Standard benchmark run
cargo bench

# Specific benchmark
cargo bench --bench eq_proving

# Save baseline
cargo bench -- --save-baseline <name>

# Compare with baseline
cargo bench -- --baseline <name>

# Filter benchmarks
cargo bench -- proof_generation

# Verbose output
cargo bench -- --verbose

# List all benchmarks
cargo bench -- --list
```

---

**Last Updated**: 2025-11-09
**Benchmark Version**: 1.0.0
**Divan Version**: 0.1.21
**Stwo Version**: 0.1.1 (commit f717928)
