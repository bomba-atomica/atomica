pragma circom 2.0.0;

// Simple no-op circuit that takes an input and outputs it
// This is the Circom equivalent of the SP1 noop guest program
template Noop() {
    // Private input
    signal input in;

    // Public output
    signal output out;

    // Constraint: output equals input
    out <== in;
}

component main = Noop();
