pragma circom 2.0.0;

// Equality check circuit that verifies two numbers are equal
// Takes two inputs (a and b) and constrains them to be equal
template EqualityCheck() {
    // Public inputs - both numbers are public so the verifier knows what values were checked
    signal input a;
    signal input b;

    // Constraint: a must equal b
    // This will fail at proof generation if a != b
    a === b;
}

component main {public [a, b]} = EqualityCheck();
