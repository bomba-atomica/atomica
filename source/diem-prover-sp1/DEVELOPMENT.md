# Development Guide

## Quick Start

### Prerequisites

```bash
# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install RISC-V target
rustup target add riscv32im-unknown-none-elf

# Install Foundry (for Solidity)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install development tools
make install
```

### Setup

```bash
# Clone and setup
cd source/diem-prover-sp1
cp .env.example .env

# Edit .env with your configuration
vim .env
```

## Development Workflow

### 1. Make Changes

Edit code in:
- `guest/src/` - zkVM program
- `host/src/` - Prover service
- `contracts/src/` - Solidity contracts

### 2. Format & Lint

```bash
# Auto-fix all issues
make lint-fix

# Or individually:
make lint-fix-rust        # Format Rust code
make lint-fix-contracts   # Format Solidity code
```

### 3. Check Linting

```bash
# Check everything
make lint

# Or individually:
make lint-rust           # Check Rust linting
make lint-contracts      # Check Solidity linting
```

### 4. Build

```bash
# Build everything
make build

# Or individually:
make build-guest         # Build RISC-V program
make build-host          # Build prover service
make build-contracts     # Build Solidity contracts
```

### 5. Test

```bash
# Run all tests
make test

# Or individually:
make test-rust           # Rust tests
make test-contracts      # Solidity tests
```

### 6. Run

```bash
# Run the prover
make dev                 # Development mode (debug logs)
cargo run --bin prover   # Production mode
```

## Linting Rules

### Rust (Clippy)

Configured in `clippy.toml`:
- Denies all warnings in CI
- Max function arguments: 8
- Cognitive complexity threshold: 50
- MSRV: 1.75.0

Common lints:
```rust
// Use ? operator instead of unwrap
let value = result?;  // ✅ Good
let value = result.unwrap();  // ❌ Bad

// Explicit type annotations
let x: u64 = 42;  // ✅ Good
let x = 42;  // ⚠️ May need type annotation

// Avoid unnecessary clones
let s = &data;  // ✅ Good
let s = data.clone();  // ⚠️ Only if needed
```

### Solidity (Solhint)

Configured in `contracts/.solhint.json`:
- Compiler version: ^0.8.20
- Max line length: 120
- Naming conventions enforced
- No console.log in production code

Common rules:
```solidity
// Use natspec comments
/// @notice Does something important
/// @param x The input value
function doSomething(uint256 x) external {  // ✅ Good

// Proper naming
contract MyContract {}        // ✅ CamelCase
function myFunction() {}      // ✅ mixedCase
uint256 MY_CONSTANT = 100;    // ✅ UPPER_SNAKE_CASE
```

## Pre-commit Hooks

Install pre-commit hooks to automatically check code before commits:

```bash
# Install pre-commit
pip install pre-commit

# Install hooks
pre-commit install

# Run manually
pre-commit run --all-files
```

Hooks will:
- ✅ Format Rust code with rustfmt
- ✅ Lint Rust code with clippy
- ✅ Format Solidity with forge fmt
- ✅ Lint Solidity with solhint
- ✅ Check for trailing whitespace
- ✅ Validate TOML, YAML files
- ✅ Check for large files

## CI/CD Pipeline

GitHub Actions workflows are in `.github/workflows/`:

### On Every Push/PR

**CI Workflow** (`.github/workflows/ci.yml`):

1. **Rust Lint** - Format & clippy checks
2. **Rust Build** - Build guest + host
3. **Rust Test** - Run all tests
4. **Solidity Lint** - Format & solhint checks
5. **Solidity Build** - Compile contracts
6. **Solidity Test** - Run Foundry tests
7. **Security** - cargo-audit & slither
8. **Coverage** - Generate coverage reports

### On Version Tags

**Release Workflow** (`.github/workflows/release.yml`):

1. **Create Release** - GitHub release
2. **Build Binaries** - Linux, macOS (amd64, arm64)
3. **Publish Contracts** - Contract artifacts

## Debugging

### Rust

```bash
# Run with debug logs
RUST_LOG=debug cargo run --bin prover

# Run with trace logs
RUST_LOG=trace cargo run --bin prover

# Use rust-lldb for debugging
rust-lldb ./target/release/prover
```

### Solidity

```bash
# Run tests with verbose output
cd contracts
forge test -vvvv

# Run specific test
forge test --match-test testUpdateState -vvvv

# Debug with traces
forge test --debug testUpdateState
```

## Code Quality Tools

### Rust

```bash
# Security audit
cargo audit

# Check for outdated dependencies
cargo outdated

# Find duplicate dependencies
cargo tree --duplicates

# Generate documentation
cargo doc --open
```

### Solidity

```bash
cd contracts

# Check contract sizes
forge build --sizes

# Generate gas report
forge test --gas-report

# Run slither (requires slither-analyzer)
slither src/
```

## Testing Strategies

### Unit Tests

```rust
// guest/src/main.rs
#[cfg(test)]
mod tests {
    #[test]
    fn test_quorum_calculation() {
        // Test logic
    }
}
```

```solidity
// contracts/test/DiemLightClient.t.sol
function testUpdateState() public {
    // Test contract
}
```

### Integration Tests

```bash
# Run end-to-end tests
cd host
cargo test --test integration
```

## Performance Profiling

### Rust

```bash
# Profile with flamegraph
cargo install flamegraph
cargo flamegraph --bin prover

# Profile with perf
perf record -g cargo run --release --bin prover
perf report
```

### Solidity Gas

```bash
cd contracts
forge test --gas-report > gas-report.txt
```

## Common Issues

### "Target not found: riscv32im-unknown-none-elf"

```bash
rustup target add riscv32im-unknown-none-elf
```

### "cargo-audit not found"

```bash
cargo install cargo-audit
```

### "solhint not found"

```bash
npm install -g solhint
```

### "forge not found"

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

### Clippy warnings in CI but not locally

```bash
# Use the same rust version as CI
rustup update stable

# Clear cache and rebuild
cargo clean
cargo clippy --all-targets --all-features -- -D warnings
```

## Best Practices

### Rust

1. **Use `Result` and `?` operator**
   ```rust
   fn do_something() -> Result<()> {
       let value = fallible_operation()?;
       Ok(())
   }
   ```

2. **Prefer borrowing over cloning**
   ```rust
   fn process(data: &[u8]) { }  // ✅ Borrow
   fn process(data: Vec<u8>) { }  // ❌ Moves ownership
   ```

3. **Use meaningful error messages**
   ```rust
   .context("Failed to connect to Aptos")?
   ```

4. **Add documentation**
   ```rust
   /// Verifies BLS signature
   ///
   /// # Arguments
   /// * `signature` - The BLS signature
   /// * `public_key` - The validator's public key
   fn verify_signature(signature: &[u8], public_key: &[u8]) -> bool
   ```

### Solidity

1. **Use custom errors (gas efficient)**
   ```solidity
   error InvalidProof();
   revert InvalidProof();  // ✅ Custom error
   revert("Invalid proof");  // ❌ String error
   ```

2. **Check-effects-interactions pattern**
   ```solidity
   function withdraw() external {
       uint256 amount = balances[msg.sender];  // Check
       balances[msg.sender] = 0;              // Effect
       payable(msg.sender).transfer(amount);  // Interaction
   }
   ```

3. **Use events for important state changes**
   ```solidity
   emit StateUpdated(newVersion, newRoot);
   ```

4. **Add natspec comments**
   ```solidity
   /// @notice Updates the light client state
   /// @param proof The SP1 proof bytes
   function updateState(bytes calldata proof) external
   ```

## Release Process

### Version Bump

```bash
# Update version in Cargo.toml files
vim Cargo.toml
vim guest/Cargo.toml
vim host/Cargo.toml

# Commit
git add .
git commit -m "chore: bump version to v0.2.0"
```

### Create Release

```bash
# Tag the release
git tag -a v0.2.0 -m "Release v0.2.0"

# Push tag (triggers release workflow)
git push origin v0.2.0
```

## Resources

- [Rust API Guidelines](https://rust-lang.github.io/api-guidelines/)
- [Solidity Style Guide](https://docs.soliditylang.org/en/latest/style-guide.html)
- [SP1 Documentation](https://docs.succinct.xyz/)
- [Foundry Book](https://book.getfoundry.sh/)
