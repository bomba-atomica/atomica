# Benchmarking Guide for diem-prover-circom

## Overview

This project uses [Divan](https://github.com/nvzqz/divan) for benchmarking ZK-SNARK proof generation and verification performance. Benchmarks are critical for:

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

### Equality Circuit Benchmarks (`benches/eq_proving.rs`)

#### 1. `complete_proof_generation`
**What it measures**: End-to-end time from circuit loading to proof generation

**Use case**: "Cold start" scenario - first proof generation

**Includes**:
- Circuit loading (WASM + R1CS parsing)
- Trusted setup (proving/verification key generation)
- Witness generation
- Proof generation

**Expected time**: ~500-800ms (depends on hardware)

---

#### 2. `proof_generation_only`
**What it measures**: Pure proof generation time (hot path)

**Use case**: Generating multiple proofs with pre-loaded circuit

**Includes**:
- Proof generation only

**Expected time**: ~20-50ms

**Note**: This is the most important metric for production throughput

---

#### 3. `witness_generation`
**What it measures**: Time to compute circuit witness from inputs

**Use case**: Understanding circuit computation cost

**Includes**:
- WASM execution
- Constraint satisfaction checking
- Wire value computation

**Expected time**: <1ms for simple circuits

---

#### 4. `trusted_setup`
**What it measures**: Proving/verification key generation time

**Use case**: One-time setup cost per circuit

**Includes**:
- Random parameter generation
- Proving key construction
- Verification key construction

**Expected time**: ~150-200ms

**Note**: Done once per circuit in production

---

#### 5. `circuit_loading`
**What it measures**: Time to parse circuit files

**Use case**: Initial startup cost

**Includes**:
- WASM file parsing
- R1CS file parsing
- Circuit structure initialization

**Expected time**: ~200-400ms

---

#### 6. `proof_verification`
**What it measures**: Time to verify a proof

**Use case**: End-user/verifier performance

**Includes**:
- Pairing operations
- Verification equation computation

**Expected time**: ~10-30ms

**Note**: This is what end-users run, should be fast

---

#### 7. `proof_with_different_inputs`
**What it measures**: Proof generation time across different input values

**Parameters tested**: `[0, 42, 1337, u64::MAX]`

**Use case**: Verifying constant-time behavior (security)

**Expected behavior**: All inputs should take similar time

**Security**: Large timing differences could indicate timing attack vulnerabilities

---

## Performance Baselines

### Target Performance (Equality Circuit)

| Operation | Target | Acceptable | Critical |
|-----------|--------|------------|----------|
| Proof Generation (hot) | <30ms | <50ms | <100ms |
| Proof Verification | <20ms | <30ms | <50ms |
| Witness Generation | <1ms | <5ms | <10ms |
| Circuit Loading | <300ms | <500ms | <1s |
| Trusted Setup | <200ms | <300ms | <500ms |

### Throughput Targets

- **Proofs/second**: >20 (hot path, single thread)
- **Verifications/second**: >50 (single thread)
- **Parallel proving**: Linear scaling up to CPU cores

---

## Interpreting Results

### Good Signs ✅

- Consistent timing across runs (low std dev)
- Constant time across different inputs
- Linear scaling with circuit size
- Stable performance across dependency updates

### Warning Signs ⚠️

- High standard deviation (>20% of mean)
- Timing varies with input values (timing attack risk)
- Performance degrades with minor code changes
- Memory usage grows unexpectedly

### Critical Issues 🚨

- Verification slower than proving (should be 3-5x faster)
- Non-linear scaling with circuit size
- >2x performance regression from baseline
- Memory leaks in repeated operations

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
# cargo bench --profile dev  # DON'T DO THIS
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

ZK-SNARK implementations must not leak information through timing:

```bash
# Benchmark with different inputs
cargo bench --bench eq_proving -- proof_with_different_inputs

# Verify timing is similar across all input values
# Large differences indicate potential timing attacks
```

**What to check**:
- Proof generation time should not depend on input values
- Witness generation time should be constant
- Verification time is allowed to vary slightly

### Side-Channel Resistance

Monitor for:
- Cache timing attacks (check CPU cache behavior)
- Branch prediction leaks (ensure constant control flow)
- Memory access patterns (should be data-independent)

---

## Extending Benchmarks

### Adding New Circuit Benchmarks

1. Create new file in `benches/`:
```rust
// benches/my_circuit_proving.rs
use divan;

fn main() {
    divan::main();
}

#[divan::bench]
fn my_circuit_proof_generation() {
    // Your benchmark code
}
```

2. Run it:
```bash
cargo bench --bench my_circuit_proving
```

### Parameterized Benchmarks

Test across multiple scenarios:

```rust
#[divan::bench(args = [10, 100, 1000, 10000])]
fn proof_with_different_sizes(size: usize) {
    // Generate proof for circuit of given size
}
```

### Benchmark Groups

Organize related benchmarks:

```rust
#[divan::bench_group(name = "proving")]
mod proving {
    #[divan::bench]
    fn small_circuit() { }

    #[divan::bench]
    fn large_circuit() { }
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
          toolchain: stable

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
BASELINE=30  # ms

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
- Ensure circuit files exist in `../circuits/build/`
- Check that dependencies match test configuration
- Verify `Cargo.toml` has `divan` in `[dev-dependencies]`

---

## Future Benchmarks (Planned)

1. **Serialization/Deserialization**
   - Proof → bytes → Proof round-trip time
   - Verification key export/import time

2. **Parallel Proving**
   - Multi-threaded proof generation
   - Batch proof generation

3. **Different Circuit Sizes**
   - Small (10 constraints)
   - Medium (1000 constraints)
   - Large (100k constraints)

4. **Memory Usage**
   - Peak memory during proving
   - Memory usage scaling with circuit size

5. **Cross-Platform**
   - macOS x86_64 vs aarch64
   - Linux x86_64
   - Performance portability

---

## References

- [Divan Documentation](https://docs.rs/divan/)
- [Criterion (alternative framework)](https://github.com/bheisler/criterion.rs)
- [Groth16 Performance Analysis](https://eprint.iacr.org/2016/260.pdf)
- [Performance Testing Best Practices](https://tratt.net/laurie/blog/2023/measuring_the_overhead_of_dynamically_dispatched_calls.html)

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

**Last Updated**: 2025-11-07
**Benchmark Version**: 1.0.0
**Divan Version**: 0.1.21
