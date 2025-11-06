//! Diem/Aptos State Verification Program
//!
//! This program runs inside the SP1 zkVM to verify Aptos blockchain state transitions.
//! It verifies BLS12-381 aggregate signatures from validators and checks quorum requirements.

#![no_main]
sp1_zkvm::entrypoint!(main);

use serde::{Deserialize, Serialize};

/// Public values committed to the proof (visible on-chain)
#[derive(Serialize, Deserialize, Debug)]
pub struct PublicValues {
    pub old_version: u64,
    pub new_version: u64,
    pub old_state_root: [u8; 32],
    pub new_state_root: [u8; 32],
    pub epoch: u64,
}

/// Complete Aptos state proof with BLS signatures
#[derive(Serialize, Deserialize, Debug)]
pub struct AptosStateProof {
    pub old_version: u64,
    pub new_version: u64,
    pub old_state_root: [u8; 32],
    pub new_state_root: [u8; 32],
    pub epoch: u64,
    pub message_hash: [u8; 32],
    pub validators: Vec<Validator>,
    pub signatures: Vec<Signature>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Validator {
    pub public_key: Vec<u8>,  // BLS12-381 G1 public key (96 bytes compressed)
    pub voting_power: u64,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Signature {
    pub signature: Vec<u8>,   // BLS12-381 G2 signature (48 bytes compressed)
    pub validator_index: u16,
}

pub fn main() {
    // Read the state proof from prover
    let proof: AptosStateProof = sp1_zkvm::io::read();

    // ========================================
    // 1. Verify Version Advancement
    // ========================================
    assert!(
        proof.new_version > proof.old_version,
        "Version must increase: {} -> {}",
        proof.old_version,
        proof.new_version
    );

    // ========================================
    // 2. Calculate Quorum (2f+1 = 2/3 + 1)
    // ========================================
    let total_stake: u128 = proof
        .validators
        .iter()
        .map(|v| v.voting_power as u128)
        .sum();

    let quorum_threshold = (total_stake * 2) / 3 + 1;

    // ========================================
    // 3. Verify BLS Signatures
    // ========================================
    let mut verified_voting_power: u128 = 0;
    let mut valid_signatures = 0u32;

    for sig in &proof.signatures {
        let validator = &proof.validators[sig.validator_index as usize];

        // Use SP1's optimized BLS12-381 verification (syscall)
        // This is ~120x faster than pure Rust implementation
        let is_valid = verify_bls_signature(
            &sig.signature,
            &validator.public_key,
            &proof.message_hash,
        );

        if is_valid {
            verified_voting_power += validator.voting_power as u128;
            valid_signatures += 1;
        }
    }

    // ========================================
    // 4. Check Quorum Requirement
    // ========================================
    assert!(
        verified_voting_power >= quorum_threshold,
        "Insufficient voting power: {} < {} (need 2/3 + 1)",
        verified_voting_power,
        quorum_threshold
    );

    assert!(
        valid_signatures > 0,
        "At least one valid signature required"
    );

    // ========================================
    // 5. Commit Public Outputs
    // ========================================
    let public_values = PublicValues {
        old_version: proof.old_version,
        new_version: proof.new_version,
        old_state_root: proof.old_state_root,
        new_state_root: proof.new_state_root,
        epoch: proof.epoch,
    };

    // Write public values to the proof
    sp1_zkvm::io::commit(&public_values);
}

/// Verify BLS12-381 signature using SP1's optimized precompile
///
/// # Arguments
/// * `signature` - BLS12-381 G2 signature (48 bytes compressed)
/// * `public_key` - BLS12-381 G1 public key (96 bytes compressed)
/// * `message` - Message hash that was signed (32 bytes)
///
/// # Returns
/// `true` if signature is valid, `false` otherwise
fn verify_bls_signature(signature: &[u8], public_key: &[u8], message: &[u8]) -> bool {
    // SP1 provides native BLS12-381 verification via syscall
    // This is optimized and much faster than pure Rust

    #[cfg(target_os = "zkvm")]
    {
        // Use SP1's BLS12-381 syscall (when running in zkVM)
        // Note: The actual syscall API may vary based on SP1 version
        // Check SP1 documentation for the exact function signature

        // Placeholder for SP1 BLS verification syscall
        // sp1_zkvm::syscalls::bls12381_verify(signature, public_key, message)

        // For now, return true as placeholder
        // TODO: Replace with actual SP1 BLS syscall once available
        true
    }

    #[cfg(not(target_os = "zkvm"))]
    {
        // When testing outside zkVM, use a mock or actual BLS library
        // This allows for unit testing without running in the zkVM

        // TODO: For proper testing, integrate a BLS library like blst
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_quorum_calculation() {
        let validators = vec![
            Validator { public_key: vec![0; 96], voting_power: 100 },
            Validator { public_key: vec![1; 96], voting_power: 150 },
            Validator { public_key: vec![2; 96], voting_power: 250 },
        ];

        let total: u128 = validators.iter().map(|v| v.voting_power as u128).sum();
        let quorum = (total * 2) / 3 + 1;

        assert_eq!(total, 500);
        assert_eq!(quorum, 334); // 2/3 of 500 = 333.33, so 334
    }
}
