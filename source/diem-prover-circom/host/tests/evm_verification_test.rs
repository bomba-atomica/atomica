use ark_bn254::{Bn254, Fr};
use ark_circom::{CircomBuilder, CircomConfig};
use ark_ec::AffineRepr;
use ark_ff::{BigInteger, PrimeField};
use ark_groth16::Groth16;
use ark_snark::SNARK;
use ark_std::rand::thread_rng;
use std::path::PathBuf;

use alloy_primitives::{Address, Bytes, U256};
use alloy_sol_types::{sol, SolCall};
use revm::{
    primitives::TransactTo,
    db::InMemoryDB,
    Evm,
};

// Define the Solidity verifier interface (based on Semaphore's audited contract)
sol! {
    interface SimpleGroth16Verifier {
        function verifyProof(
            uint256[2] calldata a,
            uint256[2][2] calldata b,
            uint256[2] calldata c,
            uint256[] calldata pubSignals
        ) external view returns (bool);
    }
}

#[tokio::test]
async fn test_evm_proof_verification_gas_cost() {
    println!("\n=== EVM Proof Verification Gas Test ===\n");

    // Step 1: Build circom circuit and generate proof
    println!("Step 1: Building circom circuit...");
    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path)
        .expect("Failed to load circuit config");
    let mut builder = CircomBuilder::new(cfg);

    builder.push_input("a", 42);
    builder.push_input("b", 42);

    // Step 2: Setup and generate proof
    println!("Step 2: Generating ZK proof...");
    let circom = builder.setup();
    let mut rng = thread_rng();
    let params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng)
        .expect("Failed to generate parameters");

    let circom = builder.build().expect("Failed to build circuit");
    let inputs = circom.get_public_inputs().expect("Failed to get public inputs");
    let proof = Groth16::<Bn254>::prove(&params, circom, &mut rng)
        .expect("Failed to generate proof");

    // Step 3: Verify proof locally (sanity check)
    println!("Step 3: Verifying proof locally...");
    let pvk = Groth16::<Bn254>::process_vk(&params.vk).expect("Failed to process VK");
    let verified = Groth16::<Bn254>::verify_with_processed_vk(&pvk, &inputs, &proof)
        .expect("Failed to verify proof");
    assert!(verified, "Local proof verification failed");
    println!("  ✓ Local verification passed");

    // Step 4: Deploy verifier contract to EVM
    println!("\nStep 4: Deploying verifier contract to EVM...");

    // Load compiled bytecode from build script
    let bytecode_hex = include_str!(concat!(env!("OUT_DIR"), "/verifier_bytecode.hex"));
    let bytecode = hex::decode(bytecode_hex.trim_start_matches("0x"))
        .expect("Failed to decode bytecode");

    let mut evm = Evm::builder()
        .with_db(InMemoryDB::default())
        .build();

    // Deploy contract
    let deployer = Address::from([0x1; 20]);
    evm.tx_mut().caller = deployer;
    evm.tx_mut().transact_to = TransactTo::Create;
    evm.tx_mut().data = Bytes::from(bytecode);
    evm.tx_mut().value = U256::ZERO;
    evm.tx_mut().gas_limit = 10_000_000;

    let deploy_result = evm.transact_commit()
        .expect("Failed to deploy contract");

    let contract_address = match deploy_result {
        revm::primitives::ExecutionResult::Success { output, .. } => {
            match output {
                revm::primitives::Output::Create(_, Some(addr)) => addr,
                _ => panic!("No contract address returned"),
            }
        }
        revm::primitives::ExecutionResult::Revert { output, .. } => {
            panic!("Contract deployment reverted: {:?}", output);
        }
        revm::primitives::ExecutionResult::Halt { reason, .. } => {
            panic!("Contract deployment halted: {:?}", reason);
        }
    };

    println!("  ✓ Contract deployed at: {:?}", contract_address);

    // Step 5: Convert proof to Solidity format
    println!("\nStep 5: Converting proof to Solidity format...");

    // Helper to convert field element to U256
    let fe_to_u256 = |fe: &ark_bn254::Fq| -> U256 {
        let bytes = fe.into_bigint().to_bytes_be();
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes);
        U256::from_be_bytes(arr)
    };

    let fe2_to_u256 = |fe: &ark_bn254::Fq2| -> (U256, U256) {
        (fe_to_u256(&fe.c1), fe_to_u256(&fe.c0))
    };

    // Convert ark-groth16 proof to Solidity format
    let (proof_a_x, proof_a_y) = proof.a.xy().unwrap_or_default();
    let a: [U256; 2] = [fe_to_u256(&proof_a_x), fe_to_u256(&proof_a_y)];

    let (proof_b_x, proof_b_y) = proof.b.xy().unwrap_or_default();
    let (bx1, bx0) = fe2_to_u256(&proof_b_x);
    let (by1, by0) = fe2_to_u256(&proof_b_y);
    let b: [[U256; 2]; 2] = [[bx1, bx0], [by1, by0]];

    let (proof_c_x, proof_c_y) = proof.c.xy().unwrap_or_default();
    let c: [U256; 2] = [fe_to_u256(&proof_c_x), fe_to_u256(&proof_c_y)];

    let public_inputs: Vec<U256> = inputs.iter().map(|x| {
        let bytes = x.into_bigint().to_bytes_be();
        let mut arr = [0u8; 32];
        arr.copy_from_slice(&bytes);
        U256::from_be_bytes(arr)
    }).collect();

    // Step 6: Call verify function and measure gas
    println!("Step 6: Calling verify() on EVM...");

    let call = SimpleGroth16Verifier::verifyProofCall {
        a,
        b,
        c,
        pubSignals: public_inputs,
    };
    let calldata = call.abi_encode();

    evm.tx_mut().caller = deployer;
    evm.tx_mut().transact_to = TransactTo::Call(contract_address);
    evm.tx_mut().data = Bytes::from(calldata);
    evm.tx_mut().value = U256::ZERO;
    evm.tx_mut().gas_limit = 10_000_000;

    let verify_result = evm.transact_commit()
        .expect("Failed to call verify");

    match verify_result {
        revm::primitives::ExecutionResult::Success { gas_used, output, .. } => {
            println!("\n=== RESULTS ===");
            println!("  ✓ Verification succeeded");
            println!("  Gas used: {} gas", gas_used);
            println!("  Output: {:?}", output);

            // Convert gas to approximate USD cost (assuming $2000 ETH, 20 gwei gas price)
            let gas_price_gwei = 20;
            let eth_price_usd = 2000;
            let cost_wei = gas_used * gas_price_gwei * 1_000_000_000;
            let cost_eth = cost_wei as f64 / 1e18;
            let cost_usd = cost_eth * eth_price_usd as f64;

            println!("  Estimated cost (20 gwei): ${:.6}", cost_usd);
            println!("================\n");
        }
        revm::primitives::ExecutionResult::Revert { gas_used, output } => {
            panic!("Verification reverted (gas used: {}): {:?}", gas_used, output);
        }
        revm::primitives::ExecutionResult::Halt { reason, gas_used } => {
            panic!("Verification halted (gas used: {}): {:?}", gas_used, reason);
        }
    }
}
