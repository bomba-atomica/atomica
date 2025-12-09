# Consensus Critical Code Guidelines

This document establishes the testing and development standards for any features that impact consensus, including DKG, Timelock, and Validator Transactions.

**Definition of Done**
A component is effectively **incomplete** until *all* of the following testing layers are implemented and passing.

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
**Review Process**
PRs touching consensus code will **not be merged** without evidence of all five layers.
