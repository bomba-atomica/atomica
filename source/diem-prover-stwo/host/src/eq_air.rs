// Equality Check AIR for Stwo
//
// This module defines an Algebraic Intermediate Representation (AIR) that proves
// two values are equal: a == b
//
// Unlike Circom circuits which use R1CS constraints, stwo uses execution traces
// and polynomial constraints.

use anyhow::Result;
use num_traits::Zero;
use serde::{Deserialize, Serialize};
use stwo::core::air::Component;
use stwo::core::channel::Blake2sM31Channel;
use stwo::core::fields::m31::BaseField;
use stwo::core::fields::qm31::SecureField;
use stwo::core::pcs::{CommitmentSchemeVerifier, PcsConfig};
use stwo::core::poly::circle::CanonicCoset;
use stwo::core::proof::StarkProof;
use stwo::core::vcs::blake2_merkle::{Blake2sM31MerkleChannel, Blake2sM31MerkleHasher};
use stwo::core::verifier::verify;
use stwo::core::ColumnVec;
use stwo::prover::backend::simd::m31::{PackedBaseField, LOG_N_LANES};
use stwo::prover::backend::simd::SimdBackend;
use stwo::prover::backend::{Col, Column};
use stwo::prover::poly::circle::{CircleEvaluation, PolyOps};
use stwo::prover::poly::BitReversedOrder;
use stwo::prover::{prove, CommitmentSchemeProver};
use stwo_constraint_framework::{EvalAtRow, FrameworkComponent, FrameworkEval, TraceLocationAllocator};

pub type EqualityComponent = FrameworkComponent<EqualityEval>;

/// Evaluation component for equality constraint
#[derive(Clone)]
pub struct EqualityEval {
    pub log_n_rows: u32,
}

impl FrameworkEval for EqualityEval {
    fn log_size(&self) -> u32 {
        self.log_n_rows
    }

    fn max_constraint_log_degree_bound(&self) -> u32 {
        self.log_n_rows + 1
    }

    fn evaluate<E: EvalAtRow>(&self, mut eval: E) -> E {
        // Get the two trace columns: a and b
        let a = eval.next_trace_mask();
        let b = eval.next_trace_mask();

        // Add constraint: a - b == 0
        eval.add_constraint(a - b);

        eval
    }
}

/// Generate execution trace for equality check
///
/// The trace has 2 columns: [a, b]
/// With log_size rows, where all rows contain the same values
fn generate_trace(
    log_size: u32,
    a_val: u32,
    b_val: u32,
) -> ColumnVec<CircleEvaluation<SimdBackend, BaseField, BitReversedOrder>> {
    assert!(log_size >= LOG_N_LANES, "log_size must be at least LOG_N_LANES");

    let size = 1 << log_size;

    // Create two columns filled with constant values
    let mut col_a = Col::<SimdBackend, BaseField>::zeros(size);
    let mut col_b = Col::<SimdBackend, BaseField>::zeros(size);

    let a_field = BaseField::from_u32_unchecked(a_val);
    let b_field = BaseField::from_u32_unchecked(b_val);

    // Fill all SIMD vectors with the values
    let packed_a = PackedBaseField::broadcast(a_field);
    let packed_b = PackedBaseField::broadcast(b_field);

    for i in 0..(size >> LOG_N_LANES) {
        col_a.data[i] = packed_a;
        col_b.data[i] = packed_b;
    }

    let domain = CanonicCoset::new(log_size).circle_domain();
    vec![
        CircleEvaluation::<SimdBackend, _, BitReversedOrder>::new(domain, col_a),
        CircleEvaluation::<SimdBackend, _, BitReversedOrder>::new(domain, col_b),
    ]
}

/// Proof that two values are equal
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EqualityProof {
    pub config: PcsConfig,
    pub stark_proof: StarkProof<Blake2sM31MerkleHasher>,
    pub a: u32,
    pub b: u32,
}

/// Generate a proof that a == b
///
/// # Arguments
/// * `a` - First value
/// * `b` - Second value (must equal `a`)
///
/// # Returns
/// * `Ok(EqualityProof)` - Proof that a == b
/// * `Err(_)` - If a != b or proof generation fails
pub fn prove_equality(a: u32, b: u32) -> Result<EqualityProof> {
    // Verify inputs are actually equal
    if a != b {
        anyhow::bail!("Cannot prove equality: {} != {}", a, b);
    }

    // Use a small trace for simple equality
    const LOG_N_ROWS: u32 = 5; // 32 rows

    let config = PcsConfig::default();

    // Precompute twiddles
    let twiddles = SimdBackend::precompute_twiddles(
        CanonicCoset::new(LOG_N_ROWS + 1 + config.fri_config.log_blowup_factor)
            .circle_domain()
            .half_coset,
    );

    // Setup protocol
    let prover_channel = &mut Blake2sM31Channel::default();
    let mut commitment_scheme = CommitmentSchemeProver::<
        SimdBackend,
        Blake2sM31MerkleChannel,
    >::new(config, &twiddles);

    // Preprocessed trace (empty for now)
    let mut tree_builder = commitment_scheme.tree_builder();
    tree_builder.extend_evals([]);
    tree_builder.commit(prover_channel);

    // Generate trace
    let trace = generate_trace(LOG_N_ROWS, a, b);
    let mut tree_builder = commitment_scheme.tree_builder();
    tree_builder.extend_evals(trace);
    tree_builder.commit(prover_channel);

    // Prove constraints
    let component = EqualityComponent::new(
        &mut TraceLocationAllocator::default(),
        EqualityEval {
            log_n_rows: LOG_N_ROWS,
        },
        SecureField::zero(),
    );

    let stark_proof = prove::<SimdBackend, Blake2sM31MerkleChannel>(
        &[&component],
        prover_channel,
        commitment_scheme,
    )?;

    Ok(EqualityProof {
        config,
        stark_proof,
        a,
        b,
    })
}

/// Verify a proof that two values are equal
///
/// # Arguments
/// * `proof` - The equality proof to verify
///
/// # Returns
/// * `Ok(true)` - Proof is valid
/// * `Err(_)` - Verification failed
pub fn verify_equality(proof: &EqualityProof) -> Result<bool> {
    const LOG_N_ROWS: u32 = 5;

    // Setup verifier channel
    let verifier_channel = &mut Blake2sM31Channel::default();
    let commitment_scheme =
        &mut CommitmentSchemeVerifier::<Blake2sM31MerkleChannel>::new(proof.config);

    // Create component for verification
    let component = EqualityComponent::new(
        &mut TraceLocationAllocator::default(),
        EqualityEval {
            log_n_rows: LOG_N_ROWS,
        },
        SecureField::zero(),
    );

    // Retrieve the expected column sizes
    let sizes = component.trace_log_degree_bounds();
    commitment_scheme.commit(proof.stark_proof.commitments[0], &sizes[0], verifier_channel);
    commitment_scheme.commit(proof.stark_proof.commitments[1], &sizes[1], verifier_channel);

    // Verify the proof
    verify(&[&component], verifier_channel, commitment_scheme, proof.stark_proof.clone())?;

    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_equality_happy_path() -> Result<()> {
        let a = 42;
        let b = 42;

        let proof = prove_equality(a, b)?;
        let verified = verify_equality(&proof)?;

        assert!(verified, "Proof should verify for equal values");
        Ok(())
    }

    #[test]
    fn test_equality_should_fail() {
        let a = 42;
        let b = 43;

        let result = prove_equality(a, b);
        assert!(result.is_err(), "Should not be able to prove a != b");
    }

    #[test]
    fn test_equality_zero_values() -> Result<()> {
        let a = 0;
        let b = 0;

        let proof = prove_equality(a, b)?;
        let verified = verify_equality(&proof)?;

        assert!(verified, "Proof should verify for zero values");
        Ok(())
    }

    #[test]
    fn test_equality_large_values() -> Result<()> {
        let a = 999999;
        let b = 999999;

        let proof = prove_equality(a, b)?;
        let verified = verify_equality(&proof)?;

        assert!(verified, "Proof should verify for large values");
        Ok(())
    }
}
