# Test Methodology for diem-prover-circom

## Executive Summary

This document outlines our comprehensive testing strategy for the diem-prover-circom ZK-SNARK proof system. Our methodology addresses three critical dimensions often overlooked in typical software testing:

1. **Vendor Code Validation**: Ensuring third-party dependencies behave correctly and haven't been compromised
2. **Toolchain Compatibility**: Verifying integration across Rust versions and dependency ecosystems
3. **Application Logic**: Testing our circuits and abstractions

This multi-layered approach protects against supply chain attacks, dependency drift, and regression bugs while ensuring cryptographic soundness.

---

## 1. Vendor Code Validation Tests

### Purpose
Validate that external dependencies (ark-circom, ark-groth16, wasmer) behave according to their documented specifications and haven't been tampered with or inadvertently broken.

### Why This Matters
- **Supply Chain Security**: Detect malicious modifications or backdoors in dependencies
- **API Contract Verification**: Ensure vendor code upholds expected behavior after upgrades
- **Regression Detection**: Catch breaking changes in minor/patch version updates
- **Cryptographic Soundness**: Verify ZK-SNARK security properties are maintained

### Test Categories

#### 1.1 Cryptographic Primitive Validation
**Location**: `tests/vendor_crypto_validation_test.rs` (to be created)

Tests that validate fundamental cryptographic operations:

```rust
// Test that ark-bn254 curve operations are correct
- Point addition/multiplication follows group laws
- Generator points are on the curve
- Pairing operations satisfy bilinearity
- Field arithmetic is correct (addition, multiplication, inversion)

// Test that ark-groth16 implements the protocol correctly
- Verification equation e(A, B) = e(α, β) · e(C, δ) · e(public_inputs, γ)
- Proving key and verification key are correctly related
- Randomness is properly incorporated into proofs
```

**Rationale**: These tests ensure the underlying cryptographic library hasn't been compromised. A supply chain attack might subtly weaken security by using weak generators or introducing backdoors in random number generation.

#### 1.2 ZK-SNARK Soundness Tests
**Location**: `tests/vendor_soundness_test.rs` (to be created)

Tests that verify the zero-knowledge proof system maintains its security properties:

```rust
// Soundness: prover cannot create valid proofs for false statements
- Attempt to prove a != b when a == b constraint exists
- Verify that invalid witnesses are rejected
- Ensure constraint violations cause proof generation to fail

// Completeness: honest prover can always prove true statements
- Valid witnesses always produce verifiable proofs
- Verification never rejects valid proofs

// Zero-knowledge: proofs leak no information beyond validity
- Proofs for same statement with different witnesses are indistinguishable
- Verifier learns nothing about witness values
```

**Rationale**: Ensures ark-groth16 implements the Groth16 protocol correctly and hasn't introduced vulnerabilities.

#### 1.3 Vendor Error Handling Tests
**Location**: `tests/invalid_circuit_test.rs` (✅ implemented)

Tests that validate vendor code fails safely:

```rust
// ark-circom error handling
✅ Corrupted WASM files are rejected
✅ Invalid R1CS files are rejected
✅ Missing circuit files are detected
✅ Empty circuit files are handled

// Future additions:
- Malformed witness data is rejected
- Invalid field elements are caught
- Out-of-bounds array accesses fail gracefully
```

**Rationale**: Vendor code should fail-fast on invalid inputs. Silent failures or undefined behavior could indicate tampering or bugs.

#### 1.4 Determinism and Reproducibility Tests
**Location**: `tests/vendor_determinism_test.rs` (to be created)

Tests that ensure deterministic behavior:

```rust
// Deterministic proof generation (with fixed randomness)
- Same witness + same randomness = identical proof
- R1CS compilation is deterministic
- Witness generation is deterministic

// Cross-platform consistency
- Proofs generated on different architectures are identical
- Verification results are platform-independent
```

**Rationale**: Non-determinism could indicate backdoors or implementation flaws. Cryptographic operations should be reproducible.

---

## 2. Toolchain Compatibility Tests

### Purpose
Ensure the entire dependency stack works correctly with our build environment, including Rust compiler versions, platform-specific tooling, and transitive dependencies.

### Why This Matters
- **Build Reproducibility**: Ensure builds work across different environments
- **Platform Support**: Validate compatibility across macOS, Linux, and CI environments
- **Dependency Hell Prevention**: Catch version conflicts early
- **Future-Proofing**: Test against upcoming Rust versions

### Test Categories

#### 2.1 Rust Compiler Version Tests
**Location**: `.github/workflows/rust-versions.yml` (to be created)

CI tests across Rust versions:

```yaml
# Test matrix
- rust: 1.75.0  # MSRV (Minimum Supported Rust Version)
- rust: 1.80.0  # Current stable
- rust: 1.81.0  # Next stable
- rust: nightly # Bleeding edge

# For each version:
- cargo build --all-targets
- cargo test --all-targets
- cargo test --release  # Optimization bugs
```

**Rationale**: Different Rust versions can expose bugs through improved optimizations, new lints, or stdlib changes.

#### 2.2 Platform-Specific Integration Tests
**Location**: `tests/platform_integration_test.rs` (to be created)

Tests for platform-specific behavior:

```rust
// macOS-specific (current platform)
✅ Linker workarounds for wasmer (probestack issue)
✅ .cargo/config.toml platform flags work
- Test on both x86_64 and aarch64 (Apple Silicon)

// Linux-specific (for CI)
- ELF binary format handling
- System allocator behavior
- Shared library loading

// Cross-platform
- File path handling (\ vs /)
- Endianness for serialization
- Floating point determinism
```

**Rationale**: Platform-specific issues (like the wasmer/probestack bug) can break builds. Tests ensure portability.

#### 2.3 Dependency Version Matrix Tests
**Location**: `.github/workflows/dependency-matrix.yml` (to be created)

Test with different versions of critical dependencies:

```yaml
# ark-works ecosystem versions
- ark: "0.5.0"  # Current
- ark: "0.5.x"  # Latest patch
- ark: "0.6.0"  # Future (when available)

# wasmer versions
- wasmer: "2.3.0"  # Current
- wasmer: "3.x"    # Major version upgrade

# circom compiler versions
- circom: "2.2.3"  # Current
- circom: "2.3.x"  # Future minor version
```

**Rationale**: Dependency updates can break builds or introduce subtle bugs. Matrix testing catches this before upgrades.

#### 2.4 Build Configuration Tests
**Location**: `tests/build_config_test.rs` (to be created)

Tests for different build modes:

```rust
// Debug vs Release builds
- Debug: tests pass with debug assertions
- Release: tests pass with optimizations
- Opt-level variations: [0, 1, 2, 3, 's', 'z']

// Feature flag combinations
- Default features
- Minimal features
- All features enabled
- Feature flag conflicts detected

// Link-time optimization (LTO)
- LTO off (faster builds)
- Thin LTO
- Fat LTO (potential for exposing undefined behavior)
```

**Rationale**: Different build configurations can expose undefined behavior, performance issues, or feature incompatibilities.

---

## 3. Application Logic Tests

### Purpose
Validate our Circom circuits, Rust abstractions, and integration code work correctly.

### Why This Matters
- **Correctness**: Our circuits implement intended logic
- **Security**: No bugs in constraint systems
- **Usability**: APIs are ergonomic and safe
- **Maintainability**: Code is testable and documented

### Test Categories

#### 3.1 Circuit Correctness Tests
**Location**: `tests/eq_test.rs` (✅ implemented), `tests/noop_test.rs` (✅ implemented)

Tests for each circuit's logic:

```rust
// Equality circuit (eq.circom)
✅ Happy path: a == b passes
✅ Failure path: a != b is rejected
- Edge cases: zero values, maximum field elements
- Boundary conditions: field overflow behavior

// Noop circuit
✅ Always produces valid proofs
- Verify proof size is minimal
- Benchmark performance baseline

// Future circuits
- Range proofs: value is in [min, max]
- Merkle tree membership proofs
- Signature verification circuits
```

**Rationale**: Each circuit must correctly implement its mathematical constraints. Bugs here compromise security.

#### 3.2 Witness Generation Tests
**Location**: `tests/invalid_witness_test.rs` (✅ implemented)

Tests for witness computation correctness:

```rust
✅ Missing inputs cause constraint violations
✅ Wrong input names are handled
✅ Partial inputs default to zero (causing violations)
✅ Constraint violations panic as expected
✅ Duplicate input assignments handled
✅ Extreme values tested

// Future additions:
- Complex witness computations (loops, conditionals)
- Signal propagation through subcircuits
- Array witness generation
```

**Rationale**: Witness generation bugs can cause valid statements to be unprovable or expose sensitive data.

#### 3.3 Proof Tampering Detection Tests
**Location**: `tests/proof_tampering_test.rs` (✅ implemented)

Tests that verify verification rejects invalid proofs:

```rust
✅ Tampered proof.a component rejected
✅ Tampered proof.b component rejected
✅ Tampered proof.c component rejected
✅ Wrong public inputs rejected
✅ Proof/circuit mismatch detected
✅ Empty public inputs cause error

// Future additions:
- Malleability: can attacker modify proof to verify?
- Proof replay attacks
- Public input manipulation
```

**Rationale**: Verification must be robust against adversarial proofs. Any acceptance of invalid proofs breaks soundness.

#### 3.4 Cryptographic Parameter Tests
**Location**: `tests/mismatched_keys_test.rs` (✅ implemented)

Tests for proving/verification key handling:

```rust
✅ Mismatched keys cause verification failure
✅ Cross-circuit verification fails
✅ Multiple trusted setups are independent
✅ Type system prevents key misuse
✅ Same circuit, different setups incompatible

// Future additions:
- Key serialization/deserialization
- Key compression
- Powers of tau ceremony validation
- SRS (structured reference string) updates
```

**Rationale**: Incorrect key usage can completely break security. Keys from different setups must not be mixed.

#### 3.5 Integration and End-to-End Tests
**Location**: `tests/e2e_test.rs` (to be created)

Full workflow tests:

```rust
// Complete proof lifecycle
- Circuit compilation (circom → r1cs + wasm)
- Trusted setup (generate proving/verification keys)
- Witness generation (inputs → witness)
- Proof generation (witness + proving key → proof)
- Proof verification (proof + verification key + public inputs → bool)

// Serialization round-trips
- Proof serialization to bytes and back
- Verification key export/import
- Public inputs encoding/decoding

// Performance benchmarks
- Proof generation time
- Verification time
- Memory usage
- Circuit constraint count
```

**Rationale**: End-to-end tests ensure all components work together correctly in realistic scenarios.

---

## 4. Test Infrastructure

### 4.1 Continuous Integration Pipeline

```yaml
# .github/workflows/ci.yml
name: Comprehensive Test Suite

on: [push, pull_request]

jobs:
  vendor-validation:
    runs-on: [ubuntu-latest, macos-latest]
    steps:
      - Cryptographic primitive tests
      - Soundness tests
      - Error handling tests
      - Determinism tests

  toolchain-compatibility:
    strategy:
      matrix:
        rust: [1.75, 1.80, 1.81, nightly]
        os: [ubuntu-latest, macos-latest]
    steps:
      - Build all targets
      - Run all tests
      - Run with different opt-levels

  application-logic:
    runs-on: ubuntu-latest
    steps:
      - Circuit correctness tests
      - Witness generation tests
      - Proof tampering tests
      - Key mismatch tests
      - Integration tests

  security-audit:
    runs-on: ubuntu-latest
    steps:
      - cargo audit (dependency vulnerabilities)
      - cargo deny (license/security policies)
      - Supply chain security scanning
```

### 4.2 Test Data Management

```
tests/
  fixtures/
    circuits/              # Reference circuits for testing
      valid/               # Known-good circuits
      invalid/             # Malformed circuits for error testing
    proofs/                # Pre-generated proofs for verification
    keys/                  # Test proving/verification keys
    vectors/               # Test vectors from research papers
      groth16_vectors/     # Reference implementation test vectors
      bn254_vectors/       # Curve operation test vectors
```

### 4.3 Test Coverage Goals

- **Line Coverage**: ≥80% for all application code
- **Branch Coverage**: ≥70% for conditional logic
- **Vendor Behavior Coverage**: 100% of documented error conditions
- **Platform Coverage**: macOS (x86_64, aarch64), Linux (x86_64)
- **Rust Version Coverage**: MSRV through nightly

---

## 5. Test Execution Strategy

### 5.1 Local Development

```bash
# Quick smoke test (< 10 seconds)
cargo test --lib

# Full test suite (< 2 minutes)
cargo test --all-targets

# With coverage
cargo tarpaulin --out Html

# Vendor validation subset
cargo test --test vendor_
```

### 5.2 Pre-Commit Checks

```bash
# Required before commit
- cargo fmt --check
- cargo clippy -- -D warnings
- cargo test --all-targets
- cargo audit
```

### 5.3 CI/CD Pipeline

```
On PR:
  - Run all tests on all platforms
  - Check code coverage delta
  - Run security audit

On main branch:
  - All of the above
  - Extended compatibility matrix
  - Performance regression tests
  - Nightly build with latest dependencies

Weekly:
  - Dependency version matrix tests
  - Supply chain security scan
  - Long-running fuzzing tests
```

---

## 6. Test Categorization and Tagging

Use Rust test attributes to organize tests:

```rust
// Vendor validation tests
#[test]
#[cfg(feature = "vendor_validation")]
fn test_ark_bn254_generator_on_curve() { ... }

// Slow tests (skip in rapid iteration)
#[test]
#[ignore = "slow"]
fn test_large_circuit_proof_generation() { ... }

// Platform-specific tests
#[test]
#[cfg(target_os = "macos")]
fn test_macos_linker_workaround() { ... }

// Requires specific setup (circom compiler installed)
#[test]
#[cfg(feature = "circom_compiler")]
fn test_circuit_compilation() { ... }
```

Run specific categories:

```bash
# Only fast tests
cargo test --lib

# Include slow tests
cargo test -- --include-ignored

# Vendor validation only
cargo test --features vendor_validation

# Platform-specific
cargo test --test platform_integration_test
```

---

## 7. Security Considerations

### 7.1 Supply Chain Attack Detection

Our vendor validation tests specifically watch for:

1. **Cryptographic Backdoors**
   - Weak random number generation
   - Biased curve points
   - Trapdoored trusted setups

2. **Logic Bombs**
   - Date/time-based malicious behavior
   - Environment-dependent code paths
   - Hidden functionality activated by specific inputs

3. **Data Exfiltration**
   - Unexpected network activity (monitor during tests)
   - File system access outside expected paths
   - Timing side-channels leaking witness data

### 7.2 Test Isolation

- Each test runs in isolated process (Rust default)
- Temporary files cleaned up after tests
- No shared global state between tests
- Network access mocked/blocked in tests

---

## 8. Maintenance and Evolution

### 8.1 When to Add New Tests

- **New Circuit Added**: Full test suite (correctness, edge cases, security)
- **Dependency Updated**: Re-run vendor validation tests
- **Bug Found in Production**: Add regression test before fixing
- **New Platform Supported**: Add platform-specific tests
- **Performance Optimization**: Add benchmark to prevent regression

### 8.2 Test Review Criteria

All new tests must:
- [ ] Have clear documentation of what they test and why
- [ ] Include both happy path and error cases
- [ ] Be deterministic (no flaky tests)
- [ ] Complete in reasonable time (< 5s for unit tests)
- [ ] Have meaningful assertion messages
- [ ] Be categorized with appropriate tags

### 8.3 Deprecation Policy

Tests are removed only when:
- Feature/code being tested is removed
- Test is superseded by better test
- Vendor behavior changes make test obsolete (document why)

---

## 9. Current Test Status

### ✅ Implemented (28 tests)

| Test File | Tests | Status | Coverage |
|-----------|-------|--------|----------|
| `eq_test.rs` | 2 | ✅ Complete | Happy + failure paths |
| `noop_test.rs` | 1 | ✅ Complete | Basic functionality |
| `invalid_circuit_test.rs` | 7 | ✅ Complete | All error conditions |
| `invalid_witness_test.rs` | 7 | ✅ Complete | Witness validation |
| `proof_tampering_test.rs` | 6 | ✅ Complete | Proof integrity |
| `mismatched_keys_test.rs` | 5 | ✅ Complete | Key security |

### 🚧 Planned (High Priority)

| Test File | Purpose | Rationale |
|-----------|---------|-----------|
| `vendor_crypto_validation_test.rs` | Validate ark-bn254 operations | Supply chain security |
| `vendor_soundness_test.rs` | Verify Groth16 security properties | Cryptographic correctness |
| `vendor_determinism_test.rs` | Ensure reproducible builds | Detect backdoors |
| `platform_integration_test.rs` | Multi-platform compatibility | Production readiness |
| `e2e_test.rs` | Full workflow testing | Integration validation |

### 📋 Future Considerations

- Fuzz testing for circuits and witnesses
- Property-based testing with QuickCheck
- Formal verification of critical circuits
- Differential testing against other ZK-SNARK implementations
- Performance regression test suite

---

## 10. Metrics and Success Criteria

### Test Health Metrics

Track these metrics over time:

- **Test Execution Time**: Total time for full suite (target: < 5 min)
- **Test Flakiness Rate**: % of tests that fail intermittently (target: 0%)
- **Coverage Percentage**: Lines/branches covered (target: >80%)
- **Vendor Test Count**: # of vendor behavior assertions (target: growing)
- **Mean Time to Detect (MTTD)**: Time to detect dependency regressions (target: < 1 day)

### Definition of Done for Testing

A feature is "done" when:

1. ✅ Unit tests cover all code paths
2. ✅ Integration tests verify feature works end-to-end
3. ✅ Error conditions tested and handled gracefully
4. ✅ Vendor behavior assumptions validated with tests
5. ✅ Platform compatibility verified on CI
6. ✅ Performance benchmarks established
7. ✅ Security implications reviewed and tested

---

## Conclusion

This three-dimensional testing methodology—**vendor validation**, **toolchain compatibility**, and **application logic**—provides defense in depth against:

- Supply chain attacks
- Dependency drift and breaking changes
- Platform-specific bugs
- Cryptographic implementation errors
- Application logic bugs

By treating vendor code as potentially hostile and toolchain integration as potentially fragile, we build robust systems that fail safely and maintain security properties even as dependencies evolve.

**Remember**: In cryptographic systems, a test that passes is good, but a test that *would fail if the code were wrong* is invaluable.

---

## References

- [Groth16 Paper](https://eprint.iacr.org/2016/260.pdf) - Original protocol specification
- [Circom Documentation](https://docs.circom.io/) - Circuit language reference
- [ark-works Documentation](https://github.com/arkworks-rs/arkworks-rs.github.io) - Rust crypto library
- [NIST Post-Quantum Cryptography](https://csrc.nist.gov/projects/post-quantum-cryptography) - Future considerations
- [Supply Chain Security Best Practices](https://www.cisa.gov/supply-chain) - CISA guidelines
