# Linting and CI/CD Setup - Complete Guide

## ✅ What's Been Configured

### Rust Linting

**Files Created:**
- `rustfmt.toml` - Rust formatting rules
- `clippy.toml` - Clippy linting configuration
- `.cargo/config.toml` - Cargo aliases and build config

**Features:**
- ✅ Automatic formatting with `rustfmt`
- ✅ Strict linting with `clippy`
- ✅ Denies warnings in CI
- ✅ MSRV tracking (1.75.0)
- ✅ Custom rules for complexity, line length

### Solidity Linting

**Files Created:**
- `contracts/.solhint.json` - Solhint configuration
- `contracts/.solhintignore` - Ignore patterns
- `contracts/foundry.toml` - Foundry settings

**Features:**
- ✅ Solhint with recommended rules
- ✅ Forge formatter integration
- ✅ Compiler version enforcement (^0.8.20)
- ✅ Naming convention checks
- ✅ Gas optimization hints

### GitHub Actions CI/CD

**Files Created:**
- `.github/workflows/ci.yml` - Main CI pipeline
- `.github/workflows/release.yml` - Release automation

**CI Pipeline Jobs:**
1. **Rust Lint** - Format & clippy checks
2. **Rust Build** - Compile guest + host
3. **Rust Test** - Run all tests
4. **Solidity Lint** - Format & solhint checks
5. **Solidity Build** - Compile contracts
6. **Solidity Test** - Run Foundry tests
7. **Security** - cargo-audit & Slither
8. **Coverage** - Generate coverage reports

### Developer Tools

**Files Created:**
- `Makefile` - Convenient commands
- `.pre-commit-config.yaml` - Pre-commit hooks
- `.editorconfig` - Editor consistency
- `.gitignore` - Git ignore rules
- `DEVELOPMENT.md` - Complete dev guide

---

## 🚀 Quick Start

### 1. Install Prerequisites

```bash
# Rust toolchain
rustup target add riscv32im-unknown-none-elf

# Foundry (Solidity)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Development tools
cargo install cargo-audit
npm install -g solhint

# Pre-commit hooks (optional but recommended)
pip install pre-commit
pre-commit install
```

### 2. Verify Setup

```bash
# Check Rust
cargo --version
rustfmt --version
cargo clippy --version

# Check Solidity
forge --version
solhint --version

# Check pre-commit
pre-commit --version
```

### 3. Run Checks Locally

```bash
# Format all code
make fmt

# Check linting
make lint

# Build everything
make build

# Run tests
make test

# Full CI check
make ci
```

---

## 📋 Available Commands

### Via Makefile

```bash
make install          # Install all dependencies
make lint             # Run all linters
make lint-fix         # Auto-fix all issues
make fmt              # Format all code
make build            # Build all components
make test             # Run all tests
make clean            # Clean build artifacts
make dev              # Run prover in dev mode
make ci               # Run full CI locally
make coverage         # Generate coverage report
make audit            # Run security audit
```

### Via Cargo

```bash
# Formatting
cargo fmt --all                    # Format all Rust code
cargo fmt --all -- --check         # Check formatting

# Linting
cargo clippy --all-targets --all-features -- -D warnings
cargo clippy --fix                 # Auto-fix clippy issues

# Building
cargo build --release              # Build all
cargo build-guest                  # Build guest only
cargo build-host                   # Build host only

# Testing
cargo test --all                   # Run all tests
cargo test-guest                   # Test guest
cargo test-host                    # Test host
```

### Via Forge (Solidity)

```bash
cd contracts

# Formatting
forge fmt                          # Format Solidity code
forge fmt --check                  # Check formatting

# Linting
solhint 'src/**/*.sol'            # Lint with solhint

# Building
forge build                        # Build contracts
forge build --sizes                # Show contract sizes

# Testing
forge test                         # Run tests
forge test -vvv                    # Verbose output
forge test --gas-report            # Gas usage report
```

---

## 🔍 Linting Rules

### Rust (Clippy)

**Key Rules:**
- Max line length: 100
- Max function arguments: 8
- Cognitive complexity: 50
- MSRV: 1.75.0
- All warnings are errors in CI

**Common Patterns:**

```rust
// ✅ GOOD: Use Result and ?
fn process() -> Result<()> {
    let data = fetch_data()?;
    Ok(())
}

// ❌ BAD: Use unwrap
fn process() {
    let data = fetch_data().unwrap();
}

// ✅ GOOD: Borrow when possible
fn process(data: &[u8]) { }

// ❌ BAD: Unnecessary clone
fn process(data: Vec<u8>) { }

// ✅ GOOD: Descriptive errors
.context("Failed to connect to Aptos")?

// ❌ BAD: Generic errors
.expect("error")?
```

### Solidity (Solhint)

**Key Rules:**
- Compiler: ^0.8.20
- Max line length: 120
- CamelCase for contracts
- mixedCase for functions
- UPPER_SNAKE_CASE for constants

**Common Patterns:**

```solidity
// ✅ GOOD: Custom errors
error InvalidProof();
revert InvalidProof();

// ❌ BAD: String errors (expensive)
revert("Invalid proof");

// ✅ GOOD: Natspec comments
/// @notice Updates state with proof
/// @param proof The SP1 proof
function updateState(bytes calldata proof) external

// ✅ GOOD: Naming conventions
contract DiemLightClient { }      // CamelCase
function updateState() { }        // mixedCase
uint256 constant MAX_SIZE = 100;  // UPPER_SNAKE_CASE
```

---

## 🤖 GitHub Actions Workflows

### CI Workflow (On Push/PR)

**Triggers:** Push to main/develop, or PR to main/develop

**Jobs:**

1. **rust-lint**
   - Format check (`cargo fmt --check`)
   - Clippy check (`cargo clippy -- -D warnings`)
   - Caches: cargo registry, index, build

2. **rust-build**
   - Build guest (RISC-V)
   - Build host (native)
   - Depends on: rust-lint

3. **rust-test**
   - Run all tests
   - All features enabled
   - Depends on: rust-lint

4. **solidity-lint**
   - Format check (`forge fmt --check`)
   - Solhint check
   - Installs Foundry & Node.js

5. **solidity-build**
   - Compile contracts
   - Check sizes
   - Depends on: solidity-lint

6. **solidity-test**
   - Run Foundry tests
   - Generate gas report
   - Depends on: solidity-lint

7. **security**
   - cargo-audit (Rust dependencies)
   - Slither (Solidity security)
   - Runs in parallel

8. **coverage**
   - Generate code coverage
   - Upload to Codecov
   - Uses cargo-tarpaulin

**Caching Strategy:**
- Cargo registry
- Cargo git
- Cargo build artifacts
- Significantly speeds up CI

### Release Workflow (On Tag Push)

**Triggers:** Push tag `v*.*.*` (e.g., v0.1.0)

**Jobs:**

1. **create-release**
   - Creates GitHub release
   - Outputs upload URL

2. **build-binaries**
   - Builds for multiple platforms:
     - Linux x86_64
     - macOS x86_64
     - macOS arm64 (Apple Silicon)
   - Compresses binaries
   - Uploads as release assets

3. **publish-contracts**
   - Builds contract artifacts
   - Creates archive
   - Uploads to release

---

## 🔐 Pre-commit Hooks

**Installed Hooks:**

1. **Rust:**
   - `cargo fmt --check` - Format check
   - `cargo clippy` - Lint check

2. **Solidity:**
   - `forge fmt --check` - Format check
   - `solhint` - Lint check

3. **General:**
   - Trailing whitespace removal
   - End-of-file fixer
   - YAML validation
   - Large file check (max 1MB)
   - Merge conflict check

**Setup:**

```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install

# Run manually on all files
pre-commit run --all-files

# Skip hooks for a commit (not recommended)
git commit --no-verify
```

---

## 📊 Coverage Reports

### Rust Coverage

```bash
# Install tarpaulin
cargo install cargo-tarpaulin

# Generate HTML report
cargo tarpaulin --all-features --workspace --out Html

# View report
open target/tarpaulin/index.html
```

### Solidity Coverage

```bash
cd contracts

# Generate coverage (requires forge-coverage)
forge coverage

# Generate detailed lcov report
forge coverage --report lcov
```

---

## 🔒 Security Scanning

### Rust Security

```bash
# Install cargo-audit
cargo install cargo-audit

# Run audit
cargo audit

# Check for outdated dependencies
cargo install cargo-outdated
cargo outdated
```

### Solidity Security

```bash
cd contracts

# Install Slither
pip install slither-analyzer

# Run Slither
slither src/

# Run with specific detectors
slither src/ --detect reentrancy-eth,reentrancy-no-eth
```

---

## 🐛 Troubleshooting

### Rust Issues

**"rustfmt not found"**
```bash
rustup component add rustfmt
```

**"clippy not found"**
```bash
rustup component add clippy
```

**"Target riscv32im-unknown-none-elf not found"**
```bash
rustup target add riscv32im-unknown-none-elf
```

**Clippy warnings differ from CI**
```bash
# Update to latest stable
rustup update stable

# Clear cache
cargo clean
```

### Solidity Issues

**"forge not found"**
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

**"solhint not found"**
```bash
npm install -g solhint
```

**Format check fails**
```bash
cd contracts
forge fmt
```

### Pre-commit Issues

**"pre-commit not found"**
```bash
pip install pre-commit
```

**Hooks fail on commit**
```bash
# Run manually to see errors
pre-commit run --all-files

# Fix issues then commit again
```

---

## 📝 Best Practices

### Before Committing

```bash
# 1. Format code
make fmt

# 2. Check linting
make lint

# 3. Run tests
make test

# 4. Build everything
make build
```

### In Pull Requests

1. ✅ All CI checks pass
2. ✅ Code is formatted
3. ✅ No clippy warnings
4. ✅ Tests are added/updated
5. ✅ Documentation is updated

### For Releases

1. ✅ Version bumped in all Cargo.toml files
2. ✅ CHANGELOG.md updated
3. ✅ All tests pass
4. ✅ Security audit clean
5. ✅ Tag with semantic version (v0.1.0)

---

## 🎯 CI Status Badges

Add to your README.md:

```markdown
![CI](https://github.com/atomica/diem-prover-zkp/workflows/CI/badge.svg)
![Coverage](https://codecov.io/gh/atomica/diem-prover-zkp/branch/main/graph/badge.svg)
```

---

## 📚 Additional Resources

- [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- [Clippy Lints](https://rust-lang.github.io/rust-clippy/master/)
- [Rustfmt Configuration](https://rust-lang.github.io/rustfmt/)
- [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
- [Solhint Rules](https://github.com/protofire/solhint/blob/master/docs/rules.md)
- [Foundry Book](https://book.getfoundry.sh/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

---

## ✅ Checklist

### Initial Setup
- [ ] Install Rust toolchain
- [ ] Add RISC-V target
- [ ] Install Foundry
- [ ] Install cargo-audit
- [ ] Install solhint
- [ ] Install pre-commit
- [ ] Run `make install`

### Before First Commit
- [ ] Run `make fmt`
- [ ] Run `make lint`
- [ ] Run `make test`
- [ ] Install pre-commit hooks
- [ ] Verify CI workflow syntax

### Regular Development
- [ ] Format before committing
- [ ] Check linting locally
- [ ] Run tests
- [ ] Keep dependencies updated
- [ ] Monitor CI status

---

**Everything is ready!** Your project now has comprehensive linting, formatting, and CI/CD configured. 🎉
