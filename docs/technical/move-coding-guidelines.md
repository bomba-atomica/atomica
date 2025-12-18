# Move Language Coding Guidelines

## Overview

This document establishes coding standards and best practices for writing Move smart contracts in the Atomica project. Following these guidelines ensures consistency, maintainability, and correctness across the codebase.

## Documentation Comments

### Placement Rules

**IMPORTANT**: Documentation comments must be placed **between** the directive/attribute and the function signature, not before the attribute.

#### ✅ Correct
```move
#[view]
/// Get the metadata object for FAKEETH
/// Returns the Object<Metadata> for the FAKEETH fungible asset
public fun get_metadata(): Object<Metadata> {
    // implementation
}
```

#### ❌ Incorrect
```move
/// Get the metadata object for FAKEETH
/// Returns the Object<Metadata> for the FAKEETH fungible asset
#[view]
public fun get_metadata(): Object<Metadata> {
    // implementation
}
```

### Documentation Style

- Use `///` for documentation comments (triple slash)
- Start with a brief one-line summary
- Add detailed explanation on subsequent lines if needed
- Document all public functions
- Document complex private functions that need clarification
- Include parameter descriptions for non-obvious inputs
- Document error conditions and assertions

#### Example
```move
#[view]
/// Retrieves the current balance for a given account
///
/// Returns 0 if the account has not been initialized with this token.
/// This is a read-only operation that does not modify state.
public fun get_balance(account: address): u64 acquires TokenStore {
    // implementation
}
```

## Function Attributes

### Common Attributes

#### `#[view]`
- Used for read-only functions that can be called without a transaction
- Must not modify state
- Can be called via SDK's `view()` method
- Useful for queries and getters

```move
#[view]
/// Returns the total supply of tokens
public fun total_supply(): u64 {
    // implementation
}
```

#### Entry Functions
- Use `public entry fun` for functions callable from transactions
- Keep entry functions focused and simple
- Validate inputs early

```move
/// Mints tokens to the signer's account
/// Maximum 10,000 tokens per transaction
public entry fun mint(account: &signer, amount: u64) {
    assert!(amount <= MAX_MINT_AMOUNT, E_EXCEEDS_MAX_MINT);
    // implementation
}
```

### Test Attributes

#### `#[test]`
```move
#[test]
/// Tests basic minting functionality
fun test_mint_success() {
    // test implementation
}
```

#### `#[test_only]`
```move
#[test_only]
/// Helper function for tests only
public fun create_test_account(): signer {
    // implementation
}
```

## Naming Conventions

### Constants
- Use `SCREAMING_SNAKE_CASE`
- Prefix error codes with `E_`
- Group related constants together

```move
const ASSET_SYMBOL: vector<u8> = b"FAKEETH";
const MAX_MINT_AMOUNT: u64 = 1_000_000_000_000;

const E_EXCEEDS_MAX_MINT: u64 = 1;
const E_NOT_INITIALIZED: u64 = 2;
const E_INSUFFICIENT_BALANCE: u64 = 3;
```

### Functions
- Use `snake_case`
- Be descriptive and clear
- Prefix boolean-returning functions with `is_` or `has_`

```move
public fun mint(account: &signer, amount: u64) { }
public fun is_initialized(account: address): bool { }
public fun has_sufficient_balance(account: address, amount: u64): bool { }
```

### Structs
- Use `PascalCase`
- Be descriptive of the struct's purpose

```move
struct ManagingRefs has key {
    mint_ref: MintRef,
    transfer_ref: TransferRef,
    burn_ref: BurnRef,
}

struct TokenMetadata has store {
    name: String,
    symbol: String,
    decimals: u8,
}
```

### Modules
- Use `snake_case`
- Keep module names concise but descriptive

```move
module atomica::fake_eth { }
module atomica::fake_usd { }
module atomica::registry { }
```

## Code Organization

### Module Structure
Organize code in this order:
1. Friend declarations
2. Use statements
3. Constants (error codes first, then other constants)
4. Structs
5. Public entry functions
6. Public view functions
7. Public functions
8. Private functions
9. Test functions (in `#[test_only]` module if extensive)

```move
module atomica::example {
    // Friends
    friend atomica::other_module;

    // Imports
    use std::signer;
    use std::option;
    use aptos_framework::fungible_asset;

    // Error codes
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_INVALID_AMOUNT: u64 = 2;

    // Other constants
    const MAX_SUPPLY: u64 = 1_000_000_000;

    // Structs
    struct State has key { }

    // Public entry functions
    public entry fun initialize() { }

    // Public view functions
    #[view]
    /// Gets the current state
    public fun get_state(): u64 { }

    // Public functions
    public fun helper(): u64 { }

    // Private functions
    fun internal_logic() { }

    // Tests
    #[test_only]
    module tests {
        #[test]
        fun test_initialize() { }
    }
}
```

## Error Handling

### Assertions
- Use descriptive error codes
- Place assertions early in functions
- Group related validations together

```move
public entry fun transfer(from: &signer, to: address, amount: u64) acquires Balance {
    // Validate inputs first
    assert!(amount > 0, E_INVALID_AMOUNT);
    assert!(signer::address_of(from) != to, E_CANNOT_TRANSFER_TO_SELF);

    // Check state
    let balance = borrow_global<Balance>(signer::address_of(from));
    assert!(balance.value >= amount, E_INSUFFICIENT_BALANCE);

    // Execute logic
    // ...
}
```

### Error Code Documentation
Document error codes in comments:

```move
/// Error codes
const E_EXCEEDS_MAX_MINT: u64 = 1;  // Attempted to mint more than MAX_MINT_AMOUNT
const E_NOT_INITIALIZED: u64 = 2;   // Token store not initialized for account
const E_ALREADY_INITIALIZED: u64 = 3; // Token store already exists
```

## Type Safety

### Use Strong Types
Prefer using structs and objects over raw addresses when possible:

```move
// Good: Type-safe metadata reference
public fun get_metadata(): Object<Metadata> { }

// Avoid: Raw address is less clear
public fun get_metadata(): address { }
```

### Explicit Type Annotations
Use type annotations for clarity:

```move
// Good: Clear intent
let metadata_address: address = object::create_object_address(&@atomica, ASSET_SYMBOL);

// Acceptable but less clear
let metadata_address = object::create_object_address(&@atomica, ASSET_SYMBOL);
```

## Resource Management

### Acquiring Resources
Always declare acquired resources in function signatures:

```move
public entry fun mint(account: &signer, amount: u64) acquires ManagingRefs {
    let refs = borrow_global<ManagingRefs>(@atomica);
    // ...
}
```

### Resource Initialization
- Initialize resources only once
- Check for existence before initialization if needed
- Store resources at predictable addresses

```move
public entry fun initialize(admin: &signer) {
    // Ensure single initialization
    assert!(!exists<State>(signer::address_of(admin)), E_ALREADY_INITIALIZED);

    move_to(admin, State {
        // fields
    });
}
```

## Comments

### When to Comment
- Complex algorithms or non-obvious logic
- Workarounds or temporary solutions
- References to external specifications
- Assumptions and invariants

### Comment Style
```move
// Single-line comments for brief explanations

/* Multi-line comments for longer explanations
   that need multiple lines to describe
   complex logic or design decisions */
```

## Best Practices

### Gas Efficiency
- Minimize storage operations
- Batch operations when possible
- Avoid unnecessary resource borrows

### Security
- Validate all inputs
- Check authorization early
- Be explicit about who can call functions
- Use friends judiciously to limit access

### Testing
- Write unit tests for all public functions
- Test error cases
- Test boundary conditions
- Use meaningful test names

```move
#[test_only]
module tests {
    #[test]
    /// Verifies that minting succeeds with valid amount
    fun test_mint_within_limit() {
        // test implementation
    }

    #[test]
    #[expected_failure(abort_code = E_EXCEEDS_MAX_MINT)]
    /// Verifies that minting fails when exceeding maximum
    fun test_mint_exceeds_limit() {
        // test implementation
    }
}
```

## Formatting

### Indentation
- Use 4 spaces (not tabs)
- Indent continuation lines

### Line Length
- Aim for 100 characters maximum
- Break long lines logically

### Spacing
```move
// Good: Space after keywords, around operators
public fun add(a: u64, b: u64): u64 {
    a + b
}

// Avoid: No spaces
public fun add(a:u64,b:u64):u64{
    a+b
}
```

### Struct Formatting
```move
struct Example has key, store {
    field_one: u64,
    field_two: address,
    field_three: vector<u8>,
}
```

## Version Compatibility

### Dependencies
- Document minimum framework version requirements
- Pin dependency versions in Move.toml
- Test with target framework version

### Deprecation
- Mark deprecated functions clearly
- Provide migration path
- Keep deprecated functions for at least one version

```move
#[deprecated]
/// This function is deprecated. Use new_function() instead.
public fun old_function() {
    // implementation
}
```

## Compilation and Testing

### Compiling Move Contracts

To compile the Move contracts and check for errors and lint warnings:

```bash
# Navigate to the Move contracts directory
cd source/atomica-move-contracts

# Compile with named addresses (for development)
aptos move compile --named-addresses atomica=0xcafe

# Compile with a specific address (for deployment)
aptos move compile --named-addresses atomica=<your_address>
```

**Expected Output (Success):**
```json
{
  "Result": [
    "0xcafe::fake_eth",
    "0xcafe::fake_usd", 
    "0xcafe::registry"
  ]
}
```

**Exit Code:**
- `0` = Success (no errors or warnings)
- `1` = Compilation failed (check error messages)

### Running Tests

```bash
# Run all tests
aptos move test --named-addresses atomica=0xcafe

# Run tests with coverage
aptos move test --coverage --named-addresses atomica=0xcafe

# Run specific test
aptos move test --filter test_name --named-addresses atomica=0xcafe
```

### Common Compilation Errors

#### Lint Errors
The Move compiler includes a linter that checks for:
- Unused variables
- Unused functions
- Incorrect documentation placement
- Style violations

**Fix lint errors before committing code.**

#### Type Errors
- Ensure all types match
- Check that acquired resources are declared
- Verify struct abilities (key, store, copy, drop)

#### Dependency Issues
If compilation fails with dependency errors:
```bash
# Clean build artifacts
rm -rf build/

# Clear package cache
rm -rf ~/.move/

# Recompile
aptos move compile --named-addresses atomica=0xcafe
```

### Pre-Commit Checklist

Before committing Move code changes:

- [ ] Code compiles without errors: `aptos move compile`
- [ ] No lint warnings produced
- [ ] All tests pass: `aptos move test`
- [ ] Documentation comments are properly placed (after attributes)
- [ ] Error codes are documented
- [ ] New public functions have tests
- [ ] Code follows naming conventions

## Related Files

- Move contracts: `source/atomica-move-contracts/sources/`
- Move.toml configuration: `source/atomica-move-contracts/Move.toml`
- Test fixtures: `source/atomica-web/tests/fixtures/`
- Aptos CLI binary: `source/target/debug/aptos` (built from zapatos)
