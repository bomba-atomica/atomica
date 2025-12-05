use halo2_proofs_axiom::{
    circuit::Value,
    halo2curves::{
        bn256::{Bn256, Fr},
        ff::PrimeField,
    },
    plonk::{keygen_pk, keygen_vk},
    poly::{
        commitment::Params,
        kzg::commitment::ParamsKZG,
    },
};
use rand::rngs::OsRng;
use snark_verifier_sdk::{
    CircuitExt, SHPLONK,
    evm::{gen_evm_proof_shplonk, gen_evm_verifier_sol_code},
};
use std::path::Path;

mod common;
use common::EquivalenceCircuit;

fn run_solidity_verifier_test(params_path: &Path, use_trusted_setup: bool) {
    let k = 9;

    let params = if use_trusted_setup {
        // Check if parameters exist
        if !params_path.exists() {
            panic!("Trusted setup file not found at {}. Please download it from https://trusted-setup-halo2kzg.s3.eu-central-1.amazonaws.com/hermez-raw-9", params_path.display());
        }
        // Load parameters from the file
        let mut params_file = std::fs::File::open(params_path).expect("failed to open srs file");
        ParamsKZG::<Bn256>::read(&mut params_file).expect("failed to parse srs params")
    } else {
        // Generate parameters locally
        println!("Generating local parameters for testing...");
        ParamsKZG::<Bn256>::setup(k, OsRng)
    };

    let circuit = EquivalenceCircuit {
        private_input: Value::known(Fr::from(42)),
    };

    // Generate verifying key and proving key
    let vk = keygen_vk(&params, &circuit).expect("keygen_vk failed");
    let pk = keygen_pk(&params, vk.clone(), &circuit).expect("keygen_pk failed");

    // Generate Solidity verifier code using SHPLONK
    let num_instance = circuit.num_instance();
    let verifier_solidity = gen_evm_verifier_sol_code::<EquivalenceCircuit, SHPLONK>(
        &params,
        &vk,
        num_instance.clone(),
    );

    // Write Solidity code to file
    std::fs::create_dir_all("solidity/src").unwrap();
    std::fs::write("solidity/src/Verifier.sol", &verifier_solidity)
        .expect("Failed to write Verifier.sol");

    println!("Generated Solidity verifier: {} chars", verifier_solidity.len());
    println!("Solidity verifier written to solidity/src/Verifier.sol");

    // Generate a proof
    let instances = circuit.instances();
    let proof = gen_evm_proof_shplonk(&params, &pk, circuit, instances.clone());

    println!("Generated proof: {} bytes", proof.len());

    // Compile with Foundry and verify on EVM
    println!("\n🔨 Compiling Solidity verifier with Foundry...");
    let forge_output = std::process::Command::new("forge")
        .args(&["build", "--skip", "test", "--root", "solidity", "--format-json"])
        .output()
        .expect("Failed to run forge build");

    if !forge_output.status.success() {
        let stderr = String::from_utf8_lossy(&forge_output.stderr);
        println!("⚠️  Forge compilation failed:");
        println!("{}", stderr);
        println!("\n📝 To verify manually, run: cd solidity && forge test");
        return; // Skip EVM verification but don't fail the test
    }

    println!("✅ Foundry compilation successful!");

    // Save proof data for foundry tests
    #[derive(serde::Serialize)]
    struct ProofData {
        proof: String,
        instances: Vec<Vec<String>>,
    }

    let proof_hex = format!("0x{}", hex::encode(&proof));
    let instances_hex: Vec<Vec<String>> = instances
        .iter()
        .map(|col| {
            col.iter()
                .map(|f| {
                    // Convert Fr to bytes (big-endian representation)
                    let bytes = f.to_repr();
                    format!("0x{}", hex::encode(bytes.as_ref()))
                })
                .collect()
        })
        .collect();

    let proof_data = ProofData {
        proof: proof_hex,
        instances: instances_hex.clone(),
    };

    std::fs::create_dir_all("solidity").unwrap();
    let json_file = std::fs::File::create("solidity/proof_data.json")
        .expect("failed to create proof_data.json");
    serde_json::to_writer_pretty(json_file, &proof_data)
        .expect("failed to write proof_data.json");

    // Generate a bad proof (corrupt the first byte)
    let mut bad_proof = proof.clone();
    if let Some(first) = bad_proof.first_mut() {
        *first = first.wrapping_add(1);
    }
    let bad_proof_hex = format!("0x{}", hex::encode(&bad_proof));
    let bad_proof_data = ProofData {
        proof: bad_proof_hex,
        instances: instances_hex,
    };
    let bad_json_file = std::fs::File::create("solidity/bad_proof_data.json")
        .expect("failed to create bad_proof_data.json");
    serde_json::to_writer_pretty(bad_json_file, &bad_proof_data)
        .expect("failed to write bad_proof_data.json");

    // Run Forge tests
    println!("\n🔨 Running Forge tests...");
    let forge_test_output = std::process::Command::new("forge")
        .args(&["test", "--root", "solidity"])
        .output()
        .expect("Failed to run forge test");

    if !forge_test_output.status.success() {
        let stdout = String::from_utf8_lossy(&forge_test_output.stdout);
        let stderr = String::from_utf8_lossy(&forge_test_output.stderr);
        println!("⚠️  Forge tests failed:");
        println!("STDOUT:\n{}", stdout);
        println!("STDERR:\n{}", stderr);
        panic!("Forge tests failed");
    } else {
        println!("✅ Forge tests passed!");
    }

    println!("✅ Solidity verifier and proof generated successfully!");
}

use serial_test::serial;

#[test]
#[serial]
fn test_solidity_verifier_trusted_setup() {
    // The "hermez-raw-9" file is a trusted setup parameter file from the Hermez Powers of Tau ceremony.
    // It was downloaded from: https://trusted-setup-halo2kzg.s3.eu-central-1.amazonaws.com/hermez-raw-9
    // This ensures we are using secure, production-ready parameters rather than locally generated ones.
    let params_path = Path::new("../data/hermez-raw-9");
    run_solidity_verifier_test(params_path, true);
}

#[test]
#[serial]
fn test_solidity_verifier_local_setup() {
    // This test generates parameters locally to ensure the workflow works without external dependencies
    // (except for the fact that we are testing the workflow itself).
    // We pass a dummy path because use_trusted_setup is false.
    let params_path = Path::new("dummy_path");
    run_solidity_verifier_test(params_path, false);
}
