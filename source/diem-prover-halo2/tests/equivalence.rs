mod common;
use common::EquivalenceCircuit;
use halo2_proofs_axiom::{
    circuit::Value,
    dev::MockProver,
    halo2curves::bn256::{Bn256, Fr},
    plonk::{
        create_proof, keygen_pk, keygen_vk, verify_proof,
    },
    poly::{
        commitment::ParamsProver,
        kzg::{
            commitment::{KZGCommitmentScheme, ParamsKZG},
            multiopen::{ProverSHPLONK, VerifierSHPLONK},
            strategy::SingleStrategy,
        },
    },
    transcript::{
        Challenge255, Blake2bRead, Blake2bWrite, TranscriptReadBuffer, TranscriptWriterBuffer,
    },
};
use rand::rngs::OsRng;

// 2. Tests

#[test]
fn test_mock_prover_success() {
    let k = 4;
    let circuit = EquivalenceCircuit {
        private_input: Value::known(Fr::from(42)),
    };

    let prover = MockProver::run(k, &circuit, vec![]).unwrap();
    assert_eq!(prover.verify(), Ok(()));
}

#[test]
fn test_mock_prover_failure() {
    let k = 4;
    let circuit = EquivalenceCircuit {
        private_input: Value::known(Fr::from(43)), // Invalid input
    };

    let prover = MockProver::run(k, &circuit, vec![]).unwrap();
    assert!(prover.verify().is_err());
}

#[test]
fn test_real_prover() {
    let k = 4;
    let params = ParamsKZG::<Bn256>::new(k);
    let circuit = EquivalenceCircuit {
        private_input: Value::known(Fr::from(42)),
    };

    // Key Generation
    let vk = keygen_vk(&params, &circuit).expect("keygen_vk failed");
    let pk = keygen_pk(&params, vk.clone(), &circuit).expect("keygen_pk failed");

    // Proof Generation
    let mut transcript = Blake2bWrite::<_, _, Challenge255<_>>::init(vec![]);
    create_proof::<
        KZGCommitmentScheme<Bn256>,
        ProverSHPLONK<'_, Bn256>,
        Challenge255<_>,
        _,
        _,
        _,
    >(
        &params,
        &pk,
        &[circuit],
        &[&[]], // No public inputs
        OsRng,
        &mut transcript,
    )
    .expect("proof generation failed");

    let proof = transcript.finalize();
    println!("Proof size: {} bytes", proof.len());

    // Proof Verification
    let strategy = SingleStrategy::new(&params);
    let mut transcript = Blake2bRead::<_, _, Challenge255<_>>::init(&proof[..]);
    
    let result = verify_proof::<
        KZGCommitmentScheme<Bn256>,
        VerifierSHPLONK<'_, Bn256>,
        Challenge255<_>,
        _,
        _,
    >(
        &params,
        &vk,
        strategy,
        &[&[]],
        &mut transcript,
    );

    assert!(result.is_ok(), "Proof verification failed");
}

#[test]
fn test_real_prover_failure() {
    let k = 4;
    let params = ParamsKZG::<Bn256>::new(k);
    let circuit = EquivalenceCircuit {
        private_input: Value::known(Fr::from(43)), // Invalid input
    };

    // Key Generation (using the same circuit structure)
    let vk = keygen_vk(&params, &circuit).expect("keygen_vk failed");
    let pk = keygen_pk(&params, vk.clone(), &circuit).expect("keygen_pk failed");

    // Proof Generation
    // Note: create_proof might fail if constraints are not satisfied, 
    // or it might produce an invalid proof. We handle both.
    let mut transcript = Blake2bWrite::<_, _, Challenge255<_>>::init(vec![]);
    let proof_result = create_proof::<
        KZGCommitmentScheme<Bn256>,
        ProverSHPLONK<'_, Bn256>,
        Challenge255<_>,
        _,
        _,
        _,
    >(
        &params,
        &pk,
        &[circuit],
        &[&[]],
        OsRng,
        &mut transcript,
    );

    if let Ok(_) = proof_result {
        let proof = transcript.finalize();
        println!("Invalid Proof generated, size: {} bytes", proof.len());

        // Proof Verification should fail
        let strategy = SingleStrategy::new(&params);
        let mut transcript = Blake2bRead::<_, _, Challenge255<_>>::init(&proof[..]);
        
        let result = verify_proof::<
            KZGCommitmentScheme<Bn256>,
            VerifierSHPLONK<'_, Bn256>,
            Challenge255<_>,
            _,
            _,
        >(
            &params,
            &vk,
            strategy,
            &[&[]],
            &mut transcript,
        );

        assert!(result.is_err(), "Verification should have failed for invalid input");
    } else {
        // If create_proof failed, that's also a success for this test
        println!("create_proof failed as expected for invalid input");
    }
}
