# Simple Equivalence Circuit Specification

## Objective
Create a minimal Halo2 circuit to demonstrate the proving and verification workflow in Rust.

## Circuit Logic
The circuit checks if a private input value $x$ is equal to the constant value $42$.

$$ x = 42 $$

## Components
1.  **Configuration**:
    - One advice column `advice` (for the private input $x$).
    - One fixed column `constant` (to store the value 42, or we can use a gate constraint directly).
    - One selector `s_eq` (to enable the equality check).

2.  **Constraints**:
    - If `s_eq` is enabled, then `advice` must equal `42`.
    - Constraint equation: `s_eq * (advice - 42) = 0`

3.  **Witness Generation**:
    - The prover supplies the value of $x$.
    - If $x = 42$, the constraint is satisfied.
    - If $x \neq 42$, the constraint is not satisfied.

## Test Scenarios
1.  **Success Case**:
    - Input: $x = 42$
    - Expected Result: Proof generated and verified successfully.

2.  **Failure Case**:
    - Input: $x = 43$
    - Expected Result: MockProver fails with "constraint not satisfied".

## Artifacts
- Rust test script (e.g., `tests/equivalence.rs`) that:
    - Defines the circuit.
    - Runs MockProver.
    - Generates a proof using KZG commitment scheme.
    - Verifies the proof natively.
