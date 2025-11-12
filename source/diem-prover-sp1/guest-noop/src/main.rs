//! Minimal no-op program for testing SP1 prover
//! This program compares two integers and asserts they are equal
//! Used to test both STARK (core/compressed) and SNARK (groth16/plonk) proof modes

#![no_main]
sp1_zkvm::entrypoint!(main);

pub fn main() {
    // Read two u32 values
    let a = sp1_zkvm::io::read::<u32>();
    let b = sp1_zkvm::io::read::<u32>();

    // Assert they are equal (this is the computation being proven)
    assert_eq!(a, b, "Values must be equal: {} != {}", a, b);

    // Commit both values as public outputs
    sp1_zkvm::io::commit(&a);
    sp1_zkvm::io::commit(&b);
}
