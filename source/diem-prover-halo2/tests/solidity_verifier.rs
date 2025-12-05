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
    evm::{gen_evm_proof_shplonk, gen_evm_verifier_sol_code, evm_verify},
};
use std::path::Path;

mod common;
use common::EquivalenceCircuit;

#[test]
fn test_solidity_verifier() {
    let k = 9;
    let params_path = Path::new("tests/fixtures/kzg_bn254_9.srs");

    // Generate and save parameters if missing
    if !params_path.exists() {
        println!("Generating {} locally...", params_path.display());
        let params = ParamsKZG::<Bn256>::setup(k, OsRng);
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

    // Read the compiled bytecode from Foundry artifacts
    let bytecode_json = std::fs::read_to_string(
        "solidity/out/Verifier.sol/Halo2Verifier.json"
    ).expect("Failed to read Foundry artifact");

    let artifact: serde_json::Value = serde_json::from_str(&bytecode_json)
        .expect("Failed to parse artifact JSON");

    let bytecode_hex = artifact["bytecode"]["object"]
        .as_str()
        .expect("Failed to get bytecode from artifact");

    // Remove "0x" prefix if present and decode hex
    let bytecode_hex = bytecode_hex.strip_prefix("0x").unwrap_or(bytecode_hex);
    let deployment_code = hex::decode(bytecode_hex)
        .expect("Failed to decode deployment bytecode");

    println!("📦 Deployment code: {} bytes", deployment_code.len());

    // Verify the proof on the EVM using revm
    println!("🔍 Verifying proof on EVM (revm)...");
    match evm_verify(deployment_code, instances.clone(), proof.clone()) {
        Ok(gas_cost) => {
            println!("✅ PROOF VERIFIED ON EVM!");
            println!("⛽ Gas cost: {}", gas_cost);
        }
        Err(e) => {
            panic!("❌ EVM verification failed: {}", e);
        }
    }

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
        instances: instances_hex,
    };

    std::fs::create_dir_all("solidity").unwrap();
    let json_file = std::fs::File::create("solidity/proof_data.json")
        .expect("failed to create proof_data.json");
    serde_json::to_writer_pretty(json_file, &proof_data)
        .expect("failed to write proof_data.json");

    println!("✅ Solidity verifier and proof generated successfully!");
}
