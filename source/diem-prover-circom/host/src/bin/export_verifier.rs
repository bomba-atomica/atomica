use ark_bn254::{Bn254, Fr, G1Affine, G2Affine};
use ark_circom::{CircomBuilder, CircomConfig};
use ark_ec::AffineRepr;
use ark_ff::PrimeField;
use ark_groth16::{Groth16, VerifyingKey};
use ark_snark::SNARK;
use ark_std::rand::thread_rng;
use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    println!("Generating Solidity verifier from circuit...");

    // Load the circuit
    let cfg_path = PathBuf::from("../circuits/build/eq_js/eq.wasm");
    let r1cs_path = PathBuf::from("../circuits/build/eq.r1cs");

    let cfg = CircomConfig::<Fr>::new(cfg_path, r1cs_path)?;
    let mut builder = CircomBuilder::new(cfg);

    // Dummy inputs for setup
    builder.push_input("a", 0);
    builder.push_input("b", 0);

    // Generate proving/verifying keys
    let circom = builder.setup();
    let mut rng = thread_rng();
    let params = Groth16::<Bn254>::generate_random_parameters_with_reduction(circom, &mut rng)?;

    // Extract verifying key
    let vk = params.vk;

    // Generate Solidity contract
    let solidity_code = generate_solidity_verifier(&vk)?;

    // Write to file
    let output_path = PathBuf::from("../solidity/src/GeneratedVerifier.sol");
    std::fs::write(&output_path, solidity_code)?;

    println!("✓ Verifier contract written to: {:?}", output_path);

    Ok(())
}

fn generate_solidity_verifier(vk: &VerifyingKey<Bn254>) -> Result<String, Box<dyn std::error::Error>> {
    // Helper to convert G1 point to (x, y) strings
    let g1_to_strings = |p: &G1Affine| -> (String, String) {
        let (x, y) = p.xy().unwrap_or_default();
        (
            x.into_bigint().to_string(),
            y.into_bigint().to_string(),
        )
    };

    // Helper to convert G2 point to ([x1, x2], [y1, y2]) strings
    let g2_to_strings = |p: &G2Affine| -> ((String, String), (String, String)) {
        let (x, y) = p.xy().unwrap_or_default();
        (
            (
                x.c1.into_bigint().to_string(),
                x.c0.into_bigint().to_string(),
            ),
            (
                y.c1.into_bigint().to_string(),
                y.c0.into_bigint().to_string(),
            ),
        )
    };

    let (alphax, alphay) = g1_to_strings(&vk.alpha_g1);
    let ((betax1, betax2), (betay1, betay2)) = g2_to_strings(&vk.beta_g2);
    let ((gammax1, gammax2), (gammay1, gammay2)) = g2_to_strings(&vk.gamma_g2);
    let ((deltax1, deltax2), (deltay1, deltay2)) = g2_to_strings(&vk.delta_g2);

    // IC points (input commitments)
    let mut ic_points = String::new();
    for (i, ic) in vk.gamma_abc_g1.iter().enumerate() {
        let (x, y) = g1_to_strings(ic);
        ic_points.push_str(&format!("    uint256 constant IC{}x = {};\n", i, x));
        ic_points.push_str(&format!("    uint256 constant IC{}y = {};\n", i, y));
    }

    let num_inputs = vk.gamma_abc_g1.len() - 1;

    // Generate the contract
    let contract = format!(
        r#"// SPDX-License-Identifier: MIT
// Generated from circuit using ark-groth16
// Based on Semaphore's audited verifier implementation

pragma solidity >=0.8.23 <0.9.0;

/// @title GeneratedVerifier
/// @notice Groth16 verifier for the equality circuit
contract GeneratedVerifier {{
    // Scalar field size (BN254 curve order)
    uint256 constant r = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key
    uint256 constant alphax = {};
    uint256 constant alphay = {};
    uint256 constant betax1 = {};
    uint256 constant betax2 = {};
    uint256 constant betay1 = {};
    uint256 constant betay2 = {};
    uint256 constant gammax1 = {};
    uint256 constant gammax2 = {};
    uint256 constant gammay1 = {};
    uint256 constant gammay2 = {};
    uint256 constant deltax1 = {};
    uint256 constant deltax2 = {};
    uint256 constant deltay1 = {};
    uint256 constant deltay2 = {};

    // IC (input commitments) - there are {} public inputs
{}

    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;
    uint16 constant pLastMem = 896;

    /// @notice Verify a Groth16 proof
    function verifyProof(
        uint[2] calldata _pA,
        uint[2][2] calldata _pB,
        uint[2] calldata _pC,
        uint[] calldata _pubSignals
    ) external view returns (bool) {{
        require(_pubSignals.length == {}, "Invalid number of public inputs");

        assembly {{
            function checkField(v) {{
                if iszero(lt(v, r)) {{
                    mstore(0, 0)
                    return(0, 0x20)
                }}
            }}

            function g1_mulAccC(pR, x, y, s) {{
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(8000, 7, mIn, 96, mIn, 64)

                if iszero(success) {{
                    mstore(0, 0)
                    return(0, 0x20)
                }}

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(200, 6, mIn, 128, pR, 64)

                if iszero(success) {{
                    mstore(0, 0)
                    return(0, 0x20)
                }}
            }}

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {{
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                // Load IC[0]
                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute linear combination vk_x = IC[0] + pubSignals[0]*IC[1] + ...
                let pubSignalsOffset := add(4, calldataload(96))
                let pubSignalsData := add(pubSignalsOffset, 32)

{}"#,
        alphax, alphay, betax1, betax2, betay1, betay2, gammax1, gammax2, gammay1, gammay2,
        deltax1, deltax2, deltay1, deltay2, num_inputs, ic_points, num_inputs,
        generate_ic_accumulation(num_inputs)
    );

    let contract_end = r#"
                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(_pVk))
                mstore(add(_pPairing, 416), mload(add(_pVk, 32)))

                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)

                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate all inputs
            checkField(calldataload(_pA))
            checkField(calldataload(add(_pA, 32)))

            checkField(calldataload(_pC))
            checkField(calldataload(add(_pC, 32)))

            // Validate public signals
            let pubSignalsOffset := add(4, calldataload(96))
            let pubSignalsLen := calldataload(pubSignalsOffset)
            let pubSignalsData := add(pubSignalsOffset, 32)

            for { let i := 0 } lt(i, pubSignalsLen) { i := add(i, 1) } {
                checkField(calldataload(add(pubSignalsData, mul(i, 32))))
            }

            // Check pairing
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
            return(0, 0x20)
        }
    }
}
"#;

    Ok(format!("{}{}", contract, contract_end))
}

fn generate_ic_accumulation(num_inputs: usize) -> String {
    let mut code = String::new();
    for i in 0..num_inputs {
        code.push_str(&format!(
            "                g1_mulAccC(_pVk, IC{}x, IC{}y, calldataload(add(pubSignalsData, {})))\n",
            i + 1,
            i + 1,
            i * 32
        ));
    }
    code
}
