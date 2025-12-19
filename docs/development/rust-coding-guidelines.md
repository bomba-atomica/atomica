# Rust Coding Guidelines

## Overview

This document establishes coding standards and best practices for writing Rust code in the Atomica project. Following these guidelines ensures consistency, maintainability, and correctness across the codebase.

## Definition of Done

**CRITICAL**: A task is NOT complete until ALL of the following criteria are met. Agents must perform this preflight check before marking any work as done.

### Preflight Checklist

- [ ] **Tests written FIRST** (we practice TDD - Test-Driven Development)
- [ ] **All tests pass** - Both new tests and the entire existing test suite
- [ ] **Zero warnings** - Code compiles with no warnings (`cargo build`, `cargo test`)
- [ ] **Lint clean** - Clippy passes with no warnings (`cargo clippy -- -D warnings`)
- [ ] **Formatted** - Code is formatted with rustfmt (`cargo fmt`)
- [ ] **Documentation complete** - All public items have doc comments
- [ ] **README updated** - Relevant README files updated with links to project docs

**If ANY item fails, the work is INCOMPLETE. Do not proceed to the next task.**

## Test-Driven Development (TDD)

### Required Workflow

1. **Write the test first** - Before implementing any feature or fix
2. **Watch it fail** - Verify the test fails for the right reason
3. **Implement minimal code** - Make the test pass
4. **Refactor** - Clean up while keeping tests green
5. **Verify all tests pass** - Run the full test suite

### Test Requirements

```rust
// Every public function must have tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_functionality() {
        // Arrange
        let input = setup_test_data();

        // Act
        let result = function_under_test(input);

        // Assert
        assert_eq!(result, expected_value);
    }

    #[test]
    fn test_error_conditions() {
        let invalid_input = create_invalid_data();
        let result = function_under_test(invalid_input);
        assert!(result.is_err());
    }

    #[test]
    fn test_edge_cases() {
        // Test boundary conditions, empty inputs, maximum values, etc.
    }
}
```

### Test Organization

- Place unit tests in a `tests` module within the same file
- Place integration tests in `tests/` directory at crate root
- Use `tests/common/mod.rs` for shared test utilities
- Name test functions descriptively: `test_<what>_<condition>_<expected_outcome>`

## Compilation and Quality Checks

### Before Committing - Run ALL Commands

```bash
# 1. Format check (fix issues automatically)
cargo fmt

# 2. Build without warnings
cargo build --all-targets

# 3. Run all tests
cargo test --all

# 4. Lint with Clippy (treat warnings as errors)
cargo clippy --all-targets -- -D warnings

# 5. Check documentation builds
cargo doc --no-deps
```

**All commands must complete with zero warnings and zero errors.**

### Continuous Validation

Run checks frequently during development:
```bash
# Quick check loop
cargo check && cargo test && cargo clippy
```

## Documentation Comments

### Required Documentation

**Every public item MUST have documentation:**
- Modules (`//!` at the top of the file)
- Functions (`///` before the function)
- Structs and enums
- Public constants
- Complex private functions

### Documentation Style

```rust
//! Module-level documentation at the top of the file.
//!
//! This module handles XYZ functionality for the Atomica project.
//! See [architecture overview](../../docs/technical/architecture-overview.md)
//! for system context.

/// Validates a transaction signature and returns the signer address.
///
/// # Arguments
///
/// * `tx` - The transaction to validate
/// * `public_key` - The public key to verify against
///
/// # Returns
///
/// Returns `Ok(Address)` if signature is valid, `Err(ValidationError)` otherwise.
///
/// # Errors
///
/// Returns `ValidationError::InvalidSignature` if signature verification fails.
/// Returns `ValidationError::MalformedKey` if public key is invalid.
///
/// # Examples
///
/// ```
/// let tx = Transaction::new(...);
/// let addr = validate_signature(&tx, &pubkey)?;
/// ```
///
/// # See Also
///
/// * [Cryptographic standards](../../docs/technical/cryptographic-stack-analysis.md)
/// * [`sign_transaction`] for creating signatures
pub fn validate_signature(tx: &Transaction, public_key: &PublicKey) -> Result<Address, ValidationError> {
    // implementation
}
```

### Documentation Best Practices

- **Start with a one-line summary**
- **Explain the "why"** - Context and rationale, not just mechanics
- **Link to related documentation** - Reference docs in `atomica/docs/`
- **Link to related code** - Use `[`type_name`]` for intra-doc links
- **Provide examples** for non-trivial functions
- **Document errors** - All error conditions and their meanings
- **Document panics** - Any conditions that cause panics
- **Document safety** - For `unsafe` code, explain invariants

### Linking to Project Documentation

Always link back to relevant project documentation:

```rust
//! # Transaction Processing Module
//!
//! Handles transaction validation and execution for the Atomica protocol.
//!
//! ## Architecture
//!
//! This module implements the transaction flow described in
//! [architecture-overview.md](../../docs/technical/architecture-overview.md).
//!
//! ## Testing Strategy
//!
//! See [consensus-critical-guidelines.md](../../docs/development/consensus-critical-guidelines.md)
//! for testing requirements.
//!
//! ## Related Documentation
//!
//! - [Offline transaction runner](../../docs/technical/offline_transaction_runner.md)
//! - [Fee payer design](../../docs/technical/fee-payer.md)
```

## Naming Conventions

### Functions and Variables
```rust
// Use snake_case
fn calculate_total_supply() -> u64 { }
let user_balance = 100;

// Boolean functions use is_, has_, can_, should_ prefixes
fn is_valid(&self) -> bool { }
fn has_permission(&self, addr: &Address) -> bool { }
```

### Types
```rust
// Use PascalCase for structs, enums, traits
struct TransactionPool { }
enum ValidationError { }
trait Verifiable { }

// Use descriptive names
struct ValidatorSet { }  // Good
struct VS { }  // Bad - too abbreviated
```

### Constants and Statics
```rust
// Use SCREAMING_SNAKE_CASE
const MAX_TRANSACTION_SIZE: usize = 1024;
const DEFAULT_GAS_PRICE: u64 = 100;

// Error codes if using numeric codes
const E_INVALID_SIGNATURE: u64 = 1;
const E_INSUFFICIENT_BALANCE: u64 = 2;
```

### Modules
```rust
// Use snake_case
mod transaction_pool;
mod validator_set;
mod crypto_utils;
```

## Code Organization

### Module Structure

Organize code in this order:
1. Module documentation (`//!`)
2. Imports (`use` statements, grouped and sorted)
3. Constants
4. Type definitions (structs, enums, type aliases)
5. Trait implementations
6. Public functions
7. Private functions
8. Tests (`#[cfg(test)] mod tests`)

```rust
//! Transaction pool implementation.
//!
//! See [README.md](./README.md) for module overview.

// Standard library imports
use std::collections::{HashMap, VecDeque};
use std::sync::Arc;

// External crate imports
use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

// Internal imports
use crate::crypto::Signature;
use crate::types::Transaction;

// Constants
const MAX_POOL_SIZE: usize = 10000;

// Type definitions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransactionPool {
    pending: VecDeque<Transaction>,
    verified: HashMap<Hash, Transaction>,
}

// Implementations
impl TransactionPool {
    pub fn new() -> Self { }

    fn validate_internal(&self, tx: &Transaction) -> bool { }
}

// Tests
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pool_creation() { }
}
```

### Import Grouping

```rust
// Group imports with blank lines between groups:
// 1. Standard library
use std::collections::HashMap;
use std::path::PathBuf;

// 2. External crates (alphabetically)
use anyhow::Result;
use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

// 3. Internal modules (alphabetically)
use crate::config::Config;
use crate::crypto::verify_signature;
use crate::types::{Address, Transaction};
```

## Error Handling

### Use Result Types

```rust
use anyhow::{Context, Result, bail};
use thiserror::Error;

/// Custom error types for domain-specific errors
#[derive(Error, Debug)]
pub enum ValidationError {
    #[error("Invalid signature for transaction {tx_hash}")]
    InvalidSignature { tx_hash: String },

    #[error("Insufficient balance: have {have}, need {need}")]
    InsufficientBalance { have: u64, need: u64 },

    #[error("Transaction too large: {size} bytes (max: {max})")]
    TransactionTooLarge { size: usize, max: usize },
}

/// Use Result for fallible operations
pub fn validate_transaction(tx: &Transaction) -> Result<(), ValidationError> {
    if !verify_signature(tx) {
        return Err(ValidationError::InvalidSignature {
            tx_hash: tx.hash().to_string()
        });
    }
    Ok(())
}

/// Use context to add information to errors
pub fn process_transaction(tx: &Transaction) -> Result<Receipt> {
    validate_transaction(tx)
        .context("Failed to validate transaction")?;

    execute_transaction(tx)
        .context(format!("Failed to execute transaction {}", tx.hash()))?;

    Ok(receipt)
}
```

### Avoid Unwrap in Production Code

```rust
// Bad - can panic
let value = map.get(&key).unwrap();

// Good - handle the error
let value = map.get(&key)
    .ok_or(ValidationError::KeyNotFound)?;

// Acceptable - with clear justification
let value = map.get(&key)
    .expect("key must exist: verified in initialization");
```

## Type Safety and Ownership

### Use Strong Types

```rust
// Avoid primitive obsession
// Bad
fn transfer(from: String, to: String, amount: u64) -> Result<()> { }

// Good - use newtype pattern
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Address(String);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Amount(u64);

fn transfer(from: Address, to: Address, amount: Amount) -> Result<()> { }
```

### Ownership and Borrowing

```rust
// Prefer borrowing when you don't need ownership
fn validate_transaction(tx: &Transaction) -> Result<()> { }  // Good
fn validate_transaction(tx: Transaction) -> Result<()> { }   // Bad - unnecessary move

// Use mut only when needed
fn update_balance(balance: &mut Balance, amount: Amount) { }

// Return owned values when creating new data
fn create_transaction(params: &TxParams) -> Transaction { }
```

## README Files

### Required README Structure

Every significant module directory must have a `README.md`:

```markdown
# Module Name

Brief one-paragraph description of what this module does.

## Purpose

Why does this module exist? What problem does it solve?

## Key Components

- **ComponentA**: Brief description
- **ComponentB**: Brief description

## Architecture

High-level overview of how this module works. Diagram if helpful.

## Usage Examples

\`\`\`rust
use crate::module_name::ComponentA;

let component = ComponentA::new();
component.do_something()?;
\`\`\`

## Testing

How to run tests for this module:
\`\`\`bash
cargo test --package atomica-module-name
\`\`\`

See [consensus-critical-guidelines.md](../../docs/development/consensus-critical-guidelines.md)
for testing requirements.

## Related Documentation

- [Architecture Overview](../../docs/technical/architecture-overview.md)
- [Specific Feature Design](../../docs/technical/feature-design.md)
- [Parent Module README](../README.md)

## Related Code

- [`related_module`](../related_module/) - How it relates
- [`dependency_module`](../dependency_module/) - What it depends on
```

## Formatting

### Use rustfmt

Always run `cargo fmt` before committing. Configure in `rustfmt.toml`:

```toml
max_width = 100
tab_spaces = 4
edition = "2021"
```

### Code Style

```rust
// Use 4 spaces for indentation
fn example() {
    if condition {
        do_something();
    }
}

// Break long lines logically
let result = some_long_function_name(
    first_parameter,
    second_parameter,
    third_parameter,
);

// Format struct literals
let config = Config {
    host: "localhost".to_string(),
    port: 8080,
    timeout: Duration::from_secs(30),
};

// Chain methods on separate lines if long
let result = data
    .iter()
    .filter(|x| x.is_valid())
    .map(|x| x.process())
    .collect::<Vec<_>>();
```

## Clippy Lints

### Enforce Strict Linting

Configure Clippy in `Cargo.toml` or `.cargo/config.toml`:

```toml
[lints.clippy]
# Deny all warnings
all = "warn"

# Specific lints to enforce
pedantic = "warn"
unwrap_used = "warn"
expect_used = "warn"
```

### Common Clippy Fixes

```rust
// Use if-let instead of match for single pattern
// Bad
match option {
    Some(x) => do_something(x),
    None => {}
}

// Good
if let Some(x) = option {
    do_something(x);
}

// Use ? operator instead of match
// Bad
let value = match operation() {
    Ok(v) => v,
    Err(e) => return Err(e),
};

// Good
let value = operation()?;
```

## Best Practices

### Dependency Management

- Pin exact versions for reproducible builds
- Minimize dependencies - evaluate cost vs benefit
- Prefer well-maintained crates with active communities
- Document why each major dependency is needed

### Performance Considerations

- Profile before optimizing
- Use `#[inline]` judiciously for hot paths
- Consider using `&str` over `String` where possible
- Use iterators instead of collecting unnecessarily

### Security

- Validate all external inputs
- Use constant-time comparisons for secrets
- Clear sensitive data from memory when done
- Document security assumptions

### Async Code

```rust
// Use async/await for I/O bound operations
async fn fetch_data(url: &str) -> Result<Data> {
    let response = reqwest::get(url).await?;
    let data = response.json().await?;
    Ok(data)
}

// Document blocking operations
/// # Warning
///
/// This function blocks the current thread. Use [`fetch_data`] for async contexts.
fn fetch_data_blocking(url: &str) -> Result<Data> {
    // blocking implementation
}
```

## Workspace Organization

### Crate Structure

```
atomica/
├── Cargo.toml           # Workspace manifest
├── source/
│   ├── atomica-core/    # Core protocol logic
│   │   ├── Cargo.toml
│   │   ├── README.md    # Links to docs/technical/
│   │   └── src/
│   ├── atomica-web/     # Web interface
│   │   ├── README.md    # Links to docs/technical/
│   │   └── src/
│   └── atomica-cli/     # Command line tools
│       ├── README.md
│       └── src/
└── docs/                # Project documentation
    ├── development/
    └── technical/
```

## Related Documentation

- [Consensus Critical Guidelines](./consensus-critical-guidelines.md) - Testing requirements for consensus code
- [TypeScript Coding Guidelines](./typescript-coding-guidelines.md) - Standards for TypeScript code
- [Move Coding Guidelines](./move-coding-guidelines.md) - Standards for Move smart contracts
- [Architecture Overview](../technical/architecture-overview.md) - System architecture
- [Runtime Environments](./runtime-environments.md) - Development and test environments

## Pre-Commit Checklist (CRITICAL)

Run this checklist before marking ANY task as complete:

```bash
# 1. Tests written first (TDD)
# Verify tests exist for new functionality

# 2. Format code
cargo fmt --all

# 3. Build without warnings
cargo build --all-targets
# Must show: "Finished" with 0 warnings

# 4. Run all tests
cargo test --all
# Must show: all tests passed

# 5. Clippy with no warnings
cargo clippy --all-targets -- -D warnings
# Must show: 0 warnings

# 6. Check documentation
cargo doc --no-deps --document-private-items
# Must build without warnings

# 7. Verify README files updated
# Check that relevant READMEs have been updated with links to project docs
```

**ONLY when all checks pass is the work complete.**
