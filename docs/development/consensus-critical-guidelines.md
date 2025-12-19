# Consensus Critical Code Guidelines

This document establishes the testing and development standards for any features that impact consensus, including DKG, Timelock, and Validator Transactions.

## Definition of Done

**CRITICAL**: Consensus-critical code is NOT complete until ALL of the following criteria are met. This is a STRICT requirement - no exceptions.

### Preflight Checklist for Consensus-Critical Code

A component is effectively **incomplete** until *all* of the following testing layers are implemented and passing:

- [ ] **Rust unit tests** - >80% coverage, all passing
- [ ] **Move unit tests** - Every public/friend function tested, all passing
- [ ] **Move integration tests** - Full lifecycle flows tested, all passing
- [ ] **Move formal verification** - Invariants proven, no unchecked aborts
- [ ] **Smoke tests (Local Testnet)** - Full workflow on 4-node testnet, all passing
- [ ] **All standard checks pass** - See [rust-coding-guidelines.md](./rust-coding-guidelines.md) and [move-coding-guidelines.md](./move-coding-guidelines.md)
- [ ] **Documentation complete** - All layers documented with links to project docs
- [ ] **README updated** - Architecture docs and testing strategy documented

**If ANY layer is incomplete, the work is INCOMPLETE. PRs will NOT be merged without evidence of all five testing layers.**

## 1. Rust Unit Tests
Every Rust module must have comprehensive unit tests located within the module itself (usually in a `tests` module or `#[test]` functions).
*   **Location**: `src/my_module.rs` or `src/tests/my_module_test.rs`
*   **Focus**: Logic correctness, edge cases, error handling, and serialization/deserialization.
*   **Requirement**: >80% code coverage for consensus-critical paths.

## 2. Move Unit Tests
All Move modules must have unit tests covering internal logic.
*   **Location**: `sources/my_module.move` (using `#[test]`)
*   **Focus**: Function correctness, resource management, and arithmetic safety.
*   **Requirement**: Test every public and friend function.

## 3. Move Integration Tests
A higher level of testing that involves interactions between multiple Move modules.
*   **Location**: `tests/` directory in the Move package.
*   **Focus**: End-to-end flows *within the VM*, mocking the validator set if necessary.
*   **Requirement**: Verify the full lifecycle of a feature (e.g., Initialization -> Start Epoch -> Reveal -> Rotate).
    *   **Crucial**: Must simulate validator set changes and epoch boundaries to ensure secrecy and availability are maintained during handoffs.

## 4. Move Formal Verification
Use the Move Prover to mathematically prove the correctness of the contract logic.
*   **Location**: `sources/specs/my_module.spec.move` or inline spec blocks.
*   **Focus**: Invariants, pre-conditions, and post-conditions.
*   **Requirement**:
    *   Define invariants for critical resources (e.g., `TimelockState`).
    *   Verify partial correctness of key transition functions.
    *   No aborts_if false positives left unchecked.

## 5. Smoke Tests (Local Testnet)
The ultimate validation. These tests spin up a real, local Aptos network (swarm) and interact with it as external actors.
*   **Location**: `testsuite/smoke-test/src/`
*   **Tooling**: `forge` (Aptos testing framework).
*   **Focus**:
    *   Node startup/genesis with the feature enabled.
    *   Transaction submission via REST/GRPC API.
    *   Validator consensus behavior.
    *   State persistence across restarts.
    *   **Reconfiguration**: Explicitly trigger epoch changes and validator set updates (add/remove validators) while the feature is active to verify robustness during transitions.
*   **Requirement**: A successful run of the full feature workflow against a running 4-node local testnet.

---

## Pre-Commit Checklist (CRITICAL)

Run this comprehensive checklist before marking consensus-critical work as complete:

```bash
# 1. Rust Unit Tests
cd source/atomica-core  # or relevant Rust crate
cargo test
# Must show: >80% coverage for consensus paths, all tests passed

# 2. Move Unit Tests
cd source/atomica-move-contracts
aptos move test --named-addresses atomica=0xcafe
# Must show: All unit tests passed

# 3. Move Integration Tests
aptos move test --named-addresses atomica=0xcafe
# Must show: Integration tests in tests/ directory all passed
# Verify: Lifecycle tests cover Initialization -> Epoch -> Reveal -> Rotate

# 4. Move Formal Verification
aptos move prove --named-addresses atomica=0xcafe
# Must show: All invariants proven, no unchecked aborts

# 5. Smoke Tests (Local Testnet)
cd testsuite/smoke-test
forge test <your-test-name>
# Must show: Full workflow succeeds on 4-node local testnet
# Verify: Epoch changes and validator set updates handled correctly

# 6. Standard code quality checks
# See rust-coding-guidelines.md and move-coding-guidelines.md
cargo clippy -- -D warnings  # For Rust code
cargo fmt --check           # For Rust code
aptos move compile          # For Move code (0 warnings)

# 7. Documentation verification
# Verify all test files have comments explaining what they test
# Verify README files document the testing strategy
```

**Review Process**

PRs touching consensus code will **not be merged** without evidence of all five testing layers.

**Required in PR description:**
- Links to or evidence of passing tests for each layer
- Explanation of what consensus behavior is being changed/added
- Confirmation that reconfiguration scenarios were tested
- Links to updated documentation

**ONLY when all five layers pass is consensus-critical work complete.**

## Related Documentation

- [Rust Coding Guidelines](./rust-coding-guidelines.md) - General Rust standards and TDD approach
- [Move Coding Guidelines](./move-coding-guidelines.md) - Move contract standards
- [Architecture Overview](../technical/architecture-overview.md) - System design context
