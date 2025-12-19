# Unit Tests

## Overview

This directory contains **unit tests** for pure logic functions and utilities in the Atomica web application. Unit tests focus on testing isolated functions without dependencies on external services, DOM, or network resources.

## What Belongs Here

Unit tests are appropriate for:

- **Cryptographic operations** - IBE, signatures, hashing, encryption
- **Address derivation** - Converting keys to addresses, account abstraction
- **Data serialization/deserialization** - Encoding/decoding data structures
- **Pure utility functions** - String manipulation, formatting, parsing
- **Type conversions** - Data transformations without side effects
- **Mathematical operations** - Calculations, validations, algorithms

## What Doesn't Belong Here

- Tests requiring DOM manipulation → `tests/ui-component/`
- Tests requiring React components → `tests/ui-component/`
- Tests requiring wallet integration → `tests/integration/`
- Tests requiring localnet/blockchain → `tests/integration/` or `tests/meta/`
- Tests requiring browser APIs → `tests/integration/` or `tests/ui-component/`

## Test Environment

**Environment**: Browser (Chromium via Playwright)
**Config**: `vitest.config.ts`
**Run**: `npm test -- tests/unit/`

Unit tests run in a real browser environment to ensure compatibility with browser APIs and the production runtime environment. However, they should not depend on browser-specific features like DOM or `window.ethereum`.

## Current Test Files

### 1. `ibe.test.ts`

**Purpose**: Identity-Based Encryption (IBE) cryptographic operations

**What it tests**:
- IBE encryption and decryption
- Key derivation from identities
- Message confidentiality
- Cryptographic primitives

**Use cases**:
- Encrypted messaging between accounts
- Privacy-preserving data storage
- Identity-based access control

### 2. `derived-address.test.ts`

**Purpose**: Aptos account address derivation

**What it tests**:
- Address generation from public keys
- Account abstraction address derivation
- Ethereum-compatible address calculations
- Deterministic address generation

**Use cases**:
- Creating resource accounts
- Predicting contract addresses
- Implementing account abstraction

### 3. `siwe-signature.test.ts`

**Purpose**: Sign-In With Ethereum (SIWE) signature validation

**What it tests**:
- SIWE message format compliance
- Ethereum signature verification
- Message parsing and validation
- Cross-chain authentication

**Use cases**:
- MetaMask wallet authentication
- Ethereum wallet integration
- Cross-chain identity verification
- Web3 login flows

### 4. `secp256k1-address-derivation.test.ts`

**Purpose**: SECP256k1 (Ethereum-compatible) address derivation on Aptos

**What it tests**:
- Ethereum private key to Aptos address conversion
- SECP256k1 public key derivation
- Address calculation differences (Aptos SHA3-256 vs Ethereum Keccak-256)
- Account abstraction with Ethereum keys

**Use cases**:
- Importing Ethereum wallets to Aptos
- Cross-chain account management
- MetaMask integration with Aptos
- Understanding address derivation differences

**Key behaviors documented**:
- Same Ethereum private key produces different addresses on Aptos vs Ethereum
- Aptos uses SHA3-256 for hashing (different from Ethereum's Keccak-256)
- SECP256k1 accounts are first-class citizens on Aptos
- Account abstraction allows using Ethereum signatures on Aptos

### 5. `authenticator-serialization.test.ts`

**Purpose**: Aptos transaction authenticator serialization

**What it tests**:
- Serialization of different authenticator types (Ed25519, SECP256k1, Multi-sig)
- BCS (Binary Canonical Serialization) encoding
- Authenticator structure and format
- Account abstraction authenticators

**Use cases**:
- Building custom transaction authenticators
- Implementing account abstraction
- Understanding transaction signature formats
- Cross-wallet compatibility

## Running Tests

### Run all unit tests
```bash
npm test -- tests/unit/
```

### Run specific test file
```bash
npm test -- tests/unit/ibe.test.ts
npm test -- tests/unit/siwe-signature.test.ts
```

### Run with verbose output
```bash
npm test -- tests/unit/ --reporter=verbose
```

### Watch mode
```bash
npm test -- tests/unit/ --watch
```

## Writing Unit Tests

### Test Structure

```typescript
import { describe, it, expect } from "vitest";
import { myFunction } from "../../src/utils/myFunction";

describe("myFunction", () => {
  it("should do something specific", () => {
    // Arrange
    const input = "test input";
    const expected = "expected output";

    // Act
    const result = myFunction(input);

    // Assert
    expect(result).toBe(expected);
  });

  it("should handle edge cases", () => {
    expect(() => myFunction(null)).toThrow();
  });
});
```

### Best Practices

1. **Test one thing** - Each test should verify a single behavior
2. **Use descriptive names** - Test names should explain what is being tested
3. **Arrange, Act, Assert** - Structure tests with clear phases
4. **Test edge cases** - Include null, undefined, empty, boundary values
5. **Avoid side effects** - Tests should be pure and isolated
6. **No external dependencies** - Mock or stub external services
7. **Fast execution** - Unit tests should run in milliseconds

### Coding Standards

**CRITICAL**: All test code must meet the Definition of Done before being considered complete.

#### Preflight Checklist

Before marking any test work as done, verify:

- [ ] Tests written FIRST (Test-Driven Development)
- [ ] All tests pass (`npm test`)
- [ ] Zero linting errors (`npm run lint`)
- [ ] Code formatted (`npm run format`)
- [ ] Type check passes (`npx tsc --noEmit`)
- [ ] No type suppressions (`@ts-ignore`, `any`) in src/
- [ ] JSDoc comments on exported functions
- [ ] README updated with new test patterns

**See**: `/Users/lucas/code/rust/atomica/docs/development/typescript-coding-guidelines.md` for complete standards.

### Common Patterns

#### Testing with fixtures
```typescript
import goldenVectors from "../fixtures/golden_vectors.json";

describe("cryptographic operations", () => {
  it("should match known test vectors", () => {
    goldenVectors.forEach(({ input, expected }) => {
      expect(hash(input)).toBe(expected);
    });
  });
});
```

#### Testing error conditions
```typescript
it("should throw on invalid input", () => {
  expect(() => parseAddress("invalid")).toThrow("Invalid address format");
});

it("should return null for missing values", () => {
  expect(findAccount(undefined)).toBeNull();
});
```

#### Testing async operations
```typescript
it("should complete async operation", async () => {
  const result = await asyncFunction();
  expect(result).toBeDefined();
});
```

## Test Fixtures

Unit tests may use fixtures from `tests/fixtures/`:

- `golden_vectors.json` - Known test vectors for cryptographic operations
- Other JSON files with test data

**Important**: Fixtures should be deterministic and version-controlled.

## Troubleshooting

### Test failures

- Check if function signature changed
- Verify imports are correct
- Ensure test expectations match actual behavior
- Run single test to isolate issue: `npm test -- tests/unit/failing.test.ts`

### Type errors

- Run `npx tsc --noEmit` to see full type errors
- Check if types need to be updated
- Ensure no `any` types in source code (allowed in tests with ESLint comments)

### Import errors

- Verify relative paths are correct (../../src/...)
- Check if module has default vs named exports
- Ensure TypeScript can resolve the import

## Performance Considerations

Unit tests should be **fast**:

- Target: <10ms per test
- No network requests
- No file I/O (except importing test fixtures)
- No waiting/delays
- No DOM manipulation

If a test is slow (>100ms), it probably belongs in `tests/integration/` instead.

## Contributing

When adding new unit tests:

1. **Follow TDD** - Write tests before implementation
2. **Keep tests pure** - No side effects, external dependencies, or state
3. **Document complex tests** - Explain what's being tested and why
4. **Use fixtures** - Share test data via fixtures/golden_vectors.json
5. **Update this README** - Add your test to the "Current Test Files" section
6. **Run all tests** - Ensure new tests don't break existing tests
7. **Check coding standards** - Follow the preflight checklist

## See Also

- [Main Test Documentation](../README.md)
- [Integration Tests](../integration/README.md)
- [UI Component Tests](../ui-component/README.md)
- [TypeScript Coding Guidelines](/Users/lucas/code/rust/atomica/docs/development/typescript-coding-guidelines.md)
- [Vitest Documentation](https://vitest.dev/)
