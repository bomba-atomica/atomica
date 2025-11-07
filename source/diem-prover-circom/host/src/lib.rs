// Diem Prover - Circom Edition
// This crate provides a test harness for evaluating Circom-based ZK proofs

pub mod utils {
    use num_bigint::BigInt;
    use std::str::FromStr;

    /// Convert a decimal string to BigInt
    pub fn str_to_bigint(s: &str) -> BigInt {
        BigInt::from_str(s).expect("Invalid number format")
    }
}
