use halo2_proofs_axiom::{
    circuit::Value,
    halo2curves::bn256::{Bn256, Fr, G1Affine},
    plonk::{create_proof, keygen_pk, keygen_vk, verify_proof},
    poly::{
        commitment::{ParamsProver, Params},
        kzg::{
            commitment::{KZGCommitmentScheme, ParamsKZG},
            multiopen::{ProverSHPLONK, VerifierSHPLONK},
            strategy::SingleStrategy,
        },
    },
    transcript::{
        Challenge255, TranscriptReadBuffer, TranscriptWriterBuffer,
    },
};
use snark_verifier::{
    system::halo2::transcript::evm::{EvmTranscript, ChallengeEvm},
    loader::native::NativeLoader,
};
use snark_verifier_sdk::{
    gen_pk, halo2::gen_snark_shplonk, CircuitExt, Snark,
};
use rand::rngs::OsRng;
use std::path::Path;

mod common;
use common::EquivalenceCircuit;

#[test]
fn test_solidity_verifier() {
    let k = 8; // Increased k to match previous attempts, though 4 might suffice
    // 1. Setup (Simulated Universal Setup)
    let k = 9;
    let params_path = Path::new("tests/fixtures/kzg_bn254_9.srs");
    
    // Generate and save parameters if missing (simulating a downloaded file)
    if !params_path.exists() {
        println!("Generating {} locally...", params_path.display());
        let params = ParamsKZG::<Bn256>::new(k);
        let mut buf = Vec::new();
        params.write(&mut buf).expect("failed to write params");
        std::fs::write(params_path, buf).expect("failed to save params");
    }

    // Load parameters from the file
    let mut params_file = std::fs::File::open(params_path).expect("failed to open srs file");
    let params = ParamsKZG::<Bn256>::read(&mut params_file).expect("failed to parse srs params");

    let circuit = EquivalenceCircuit {
        private_input: Value::known(Fr::from(42)),
    };
    let empty_circuit = EquivalenceCircuit::default();

    // 2. Generate Keys
    let vk = keygen_vk(&params, &empty_circuit).expect("keygen_vk failed");
    let pk = keygen_pk(&params, vk.clone(), &empty_circuit).expect("keygen_pk failed");

    // 3. Generate Proof (EvmTranscript)
    let mut transcript = EvmTranscript::<G1Affine, NativeLoader, Vec<u8>, Vec<u8>>::new(vec![]);
    create_proof::<
        KZGCommitmentScheme<Bn256>,
        ProverSHPLONK<'_, Bn256>,
        ChallengeEvm<_>,
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

    // 4. Generate Solidity Verifier Code
    let generator = SolidityGenerator::new(&params, &vk, BatchOpenScheme::Bdfg21, 0);
    let verifier_source = generator.render().unwrap();

    // 5. Write Verifier to solidity/src
    let solidity_dir = Path::new("solidity");
    std::fs::create_dir_all(solidity_dir.join("src")).unwrap();
    let verifier_path = solidity_dir.join("src/Verifier.sol");
    std::fs::write(&verifier_path, &verifier_source).unwrap();

    // 6. Save Proof Data for Foundry
    #[derive(serde::Serialize)]
    struct ProofData {
        proof: String,
        instances: Vec<String>,
    }

    let proof_hex = format!("0x{}", hex::encode(&proof));
    let proof_data = ProofData {
        proof: proof_hex,
        instances: vec![],
    };

    let json_path = solidity_dir.join("proof_data.json");
    let json_file = std::fs::File::create(json_path).expect("failed to create proof_data.json");
    serde_json::to_writer(json_file, &proof_data).expect("failed to write proof_data.json");

    // 7. Run Forge Test
    let status = std::process::Command::new("forge")
        .arg("test")
        .arg("-vvv") // Increase verbosity for debugging
        .current_dir(solidity_dir)
        .status()
        .expect("failed to execute forge test");
    
    assert!(status.success(), "forge test failed");
}
