//! Shared types between guest and host

use serde::{Deserialize, Serialize};

/// Public values from the SP1 proof (visible on-chain)
/// Must match the PublicValues struct in guest/src/main.rs
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq, Eq)]
pub struct PublicValues {
    pub old_version: u64,
    pub new_version: u64,
    pub old_state_root: [u8; 32],
    pub new_state_root: [u8; 32],
    pub epoch: u64,
}

/// Complete Aptos state proof
#[derive(Serialize, Deserialize, Debug, Clone)]
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

/// Validator information
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Validator {
    pub public_key: Vec<u8>,  // BLS12-381 G1 public key (96 bytes compressed)
    pub voting_power: u64,
}

/// BLS signature from a validator
#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Signature {
    pub signature: Vec<u8>,   // BLS12-381 G2 signature (48 bytes compressed)
    pub validator_index: u16,
}

impl AptosStateProof {
    /// Create a test state proof for development/testing
    pub fn test_proof() -> Self {
        Self {
            old_version: 100,
            new_version: 200,
            old_state_root: [1u8; 32],
            new_state_root: [2u8; 32],
            epoch: 1,
            message_hash: [0u8; 32],
            validators: vec![
                Validator {
                    public_key: vec![0u8; 96],
                    voting_power: 100,
                },
                Validator {
                    public_key: vec![1u8; 96],
                    voting_power: 150,
                },
            ],
            signatures: vec![
                Signature {
                    signature: vec![0u8; 48],
                    validator_index: 0,
                },
                Signature {
                    signature: vec![1u8; 48],
                    validator_index: 1,
                },
            ],
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proof_serialization() {
        let proof = AptosStateProof::test_proof();

        // Test bincode serialization
        let encoded = bincode::serialize(&proof).unwrap();
        let decoded: AptosStateProof = bincode::deserialize(&encoded).unwrap();

        assert_eq!(proof.old_version, decoded.old_version);
        assert_eq!(proof.new_version, decoded.new_version);
    }

    #[test]
    fn test_public_values() {
        let pv = PublicValues {
            old_version: 100,
            new_version: 200,
            old_state_root: [1u8; 32],
            new_state_root: [2u8; 32],
            epoch: 1,
        };

        // Test JSON serialization (for debugging)
        let json = serde_json::to_string(&pv).unwrap();
        let decoded: PublicValues = serde_json::from_str(&json).unwrap();

        assert_eq!(pv, decoded);
    }
}
