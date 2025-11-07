//! Minimal no-op program for testing SP1 prover
//! This program does the absolute minimum: read a number, add 1, commit result

#![no_main]
sp1_zkvm::entrypoint!(main);

pub fn main() {
    // Read a single u32
    let n = sp1_zkvm::io::read::<u32>();

    // Add 1 (minimal computation)
    let result = n + 1;

    // Commit the result
    sp1_zkvm::io::commit(&result);
}
